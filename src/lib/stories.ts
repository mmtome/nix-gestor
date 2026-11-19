import "server-only";
import { db } from "./db";
import { GRAPH } from "./meta";
import { credencialDaConta } from "./insights";

/* ============================================================================
   Coleta de stories.

   A Meta só responde pelos stories que estão no ar: depois de 24 h eles
   somem da API junto com os números. Por isso a coleta roda de hora em hora
   (GitHub Actions → /api/cron/stories) e grava o último número visto de cada
   story. O relatório do mês soma o que foi guardado.

   Cada métrica é pedida sozinha: story com pouco alcance faz a Meta recusar
   algumas, e uma recusa não pode apagar as outras.
   ========================================================================== */

const METRICAS = {
  views: "views",
  reach: "reach",
  respostas: "replies",
  compartilhamentos: "shares",
  interacoes: "total_interactions",
} as const;

type Conta = { igUserId: string | null; accessToken: string | null };

async function graph<T>(caminho: string, token: string): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: { message?: string } }).error?.message || `Graph ${res.status}`);
  }
  return json as T;
}

async function valor(storyId: string, metrica: string, token: string) {
  try {
    const r = await graph<{ data?: { values?: { value?: number }[] }[] }>(
      `${storyId}/insights?metric=${metrica}`,
      token,
    );
    return r.data?.[0]?.values?.[0]?.value;
  } catch {
    return undefined;
  }
}

/** Lê os stories no ar de uma conta e grava os números do momento. */
export async function coletarStoriesDaConta(projectId: string, conta: Conta) {
  const cred = credencialDaConta(conta);
  if (!cred) return { stories: 0, erro: "sem conta conectada" };

  const lista = await graph<{ data?: { id: string; timestamp?: string; media_type?: string }[] }>(
    `${cred.igUserId}/stories?fields=id,timestamp,media_type&limit=100`,
    cred.token,
  );

  for (const s of lista.data ?? []) {
    const numeros: Record<string, number> = {};
    await Promise.all(
      Object.entries(METRICAS).map(async ([campo, metrica]) => {
        const v = await valor(s.id, metrica, cred.token);
        if (v !== undefined) numeros[campo] = v;
      }),
    );
    await db.storyColetado.upsert({
      where: { mediaId: s.id },
      create: {
        projectId,
        mediaId: s.id,
        publicadoEm: s.timestamp ? new Date(s.timestamp) : new Date(),
        tipo: s.media_type ?? null,
        ...numeros,
      },
      // Fica o último número visto: enquanto o story está no ar, ele só cresce.
      update: numeros,
    });
  }
  return { stories: lista.data?.length ?? 0 };
}

/** Todas as contas conectadas, uma por vez. */
export async function coletarTodos() {
  const contas = await db.instagramAccount.findMany({
    where: { igUserId: { not: null }, accessToken: { not: null } },
    select: { projectId: true, username: true, igUserId: true, accessToken: true },
  });
  const resultado: { conta: string; stories?: number; erro?: string }[] = [];
  for (const c of contas) {
    try {
      const r = await coletarStoriesDaConta(c.projectId, c);
      resultado.push({ conta: c.username, ...r });
    } catch (e) {
      resultado.push({ conta: c.username, erro: e instanceof Error ? e.message : "erro" });
    }
  }
  return resultado;
}

/** Stories publicados no mês (horário de Brasília) que a coleta guardou. */
export function storiesDoMes(projectId: string, ano: number, mes: number) {
  return db.storyColetado.findMany({
    where: {
      projectId,
      publicadoEm: { gte: new Date(Date.UTC(ano, mes - 1, 1, 3)), lt: new Date(Date.UTC(ano, mes, 1, 3)) },
    },
    select: { views: true, reach: true, respostas: true, interacoes: true },
  });
}
