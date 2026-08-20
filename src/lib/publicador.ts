import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/* ============================================================================
   Publicação automática no Instagram.

   Fluxo: o post sobe sozinho quando a tarefa está APROVADA e a data chegou.
   Quem dispara é o cron diário (src/app/api/cron/publicar/route.ts).

   Como a API da Meta funciona, e por que o código é assim:

   - Publicar é em duas etapas. Primeiro cria-se um "container" de mídia
     (POST /{ig-user-id}/media), depois publica-se ele
     (POST /{ig-user-id}/media_publish). Carrossel tem uma etapa a mais: cada
     imagem vira um container filho, e um container-pai os agrupa.

   - A Meta BUSCA a imagem por URL — não aceita upload direto. Por isso existe
     /api/publico/arte/[anexo], que serve o anexo sem sessão, com assinatura
     HMAC e só enquanto a tarefa estiver aprovada. É o único ponto do sistema
     em que um anexo sai sem login, e é deliberadamente estreito.

   - A imagem precisa ser JPEG. Nossas artes são PNG, então a rota pública
     converte na saída.

   - Não existe agendamento na API: publicar é sempre "agora". O agendamento é
     nosso, no cron.

   Sem INSTAGRAM_PUBLISH_TOKEN + INSTAGRAM_USER_ID, nada é enviado: a tarefa é
   marcada como "sem_credencial" e fica aguardando. Todo o resto do caminho
   (seleção, ordem, URL pública, conversão) roda igual, então dá para conferir
   o pipeline inteiro antes de existir credencial.
   ========================================================================== */

const GRAPH = "https://graph.instagram.com/v21.0";

/** MP4 e MOV são os únicos contêineres que a Meta aceita. */
export const ehVideo = (mimeType: string) =>
  mimeType.startsWith("video/") &&
  /mp4|quicktime|mov/i.test(mimeType);

export type StatusPublicacao =
  | "publicado"
  | "sem_credencial"
  | "sem_arte"
  | "erro";

export function credencialConfigurada(): boolean {
  return !!(process.env.INSTAGRAM_PUBLISH_TOKEN && process.env.INSTAGRAM_USER_ID);
}

/* ---------------------------------------------------------------- assinatura */

function segredo(): string {
  // Sem segredo próprio, cai no da sessão: é melhor derivar de algo que já é
  // secreto do que aceitar link sem assinatura.
  return process.env.PUBLIC_ART_SECRET || process.env.AUTH_SECRET || "gestor-arte";
}

export function assinarAnexo(anexoId: string): string {
  return createHmac("sha256", segredo()).update(anexoId).digest("hex").slice(0, 32);
}

export function assinaturaConfere(anexoId: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinarAnexo(anexoId));
  const recebida = Buffer.from(assinatura ?? "");
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}

/** URL absoluta — a Meta busca de fora, então caminho relativo não serve. */
export function urlPublicaDaArte(anexoId: string, base?: string): string {
  const raiz =
    base ||
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return `${raiz.replace(/\/$/, "")}/api/publico/arte/${anexoId}?a=${assinarAnexo(anexoId)}`;
}

/* ------------------------------------------------------------------ Graph API */

async function chamarGraph(
  caminho: string,
  corpo: Record<string, string>,
): Promise<Record<string, string>> {
  const token = process.env.INSTAGRAM_PUBLISH_TOKEN!;
  const res = await fetch(`${GRAPH}/${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...corpo, access_token: token }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string> & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `Graph ${res.status}`);
  }
  return json;
}

/** O container não fica pronto na hora; publicar antes da hora devolve erro. */
async function esperarContainer(containerId: string, tentativas = 12): Promise<void> {
  const token = process.env.INSTAGRAM_PUBLISH_TOKEN!;
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const { status_code } = (await res.json().catch(() => ({}))) as { status_code?: string };
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Container ${containerId} em ${status_code}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Container ${containerId} não ficou pronto a tempo`);
}

/* ------------------------------------------------------------------ publicar */

export type ResultadoPublicacao = {
  status: StatusPublicacao;
  mediaId?: string;
  permalink?: string;
  erro?: string;
  imagens: string[];
};

export async function publicarTarefa(taskId: string): Promise<ResultadoPublicacao> {
  const tarefa = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      // Ordem estável: a sequência dos cards do carrossel é a ordem de anexo.
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  // Só imagem e vídeo publicável entram; PDF de briefing anexado na mesma
  // tarefa não pode virar card de carrossel.
  const midias = tarefa.attachments
    .filter((a) => a.isImage || ehVideo(a.mimeType))
    .map((a) => ({ url: urlPublicaDaArte(a.id), video: ehVideo(a.mimeType) }));

  const imagens = midias.map((m) => m.url);

  if (midias.length === 0) {
    return { status: "sem_arte", erro: "A tarefa não tem imagem nem vídeo anexado", imagens };
  }

  if (!credencialConfigurada()) {
    return {
      status: "sem_credencial",
      erro: "Falta INSTAGRAM_PUBLISH_TOKEN / INSTAGRAM_USER_ID",
      imagens,
    };
  }

  const usuario = process.env.INSTAGRAM_USER_ID!;
  const legenda = (tarefa.legenda ?? tarefa.description ?? "").slice(0, 2200);

  // Transcodificação de vídeo é lenta: 12 tentativas de 3s bastam para foto,
  // mas derrubariam um reels de um minuto antes de ele ficar pronto.
  const temVideo = midias.some((m) => m.video);
  const espera = temVideo ? 60 : 12;

  try {
    let containerId: string;

    if (midias.length === 1) {
      const unica = midias[0];
      const c = await chamarGraph(
        `${usuario}/media`,
        unica.video
          ? { media_type: "REELS", video_url: unica.url, caption: legenda }
          : { image_url: unica.url, caption: legenda },
      );
      containerId = c.id;
    } else {
      const filhos: string[] = [];
      for (const m of midias.slice(0, LIMITE_CARROSSEL)) {
        const filho = await chamarGraph(
          `${usuario}/media`,
          m.video
            ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" }
            : { image_url: m.url, is_carousel_item: "true" },
        );
        filhos.push(filho.id);
      }
      for (const id of filhos) await esperarContainer(id, espera);

      const pai = await chamarGraph(`${usuario}/media`, {
        media_type: "CAROUSEL",
        children: filhos.join(","),
        caption: legenda,
      });
      containerId = pai.id;
    }

    await esperarContainer(containerId, espera);
    const publicado = await chamarGraph(`${usuario}/media_publish`, {
      creation_id: containerId,
    });

    let permalink: string | undefined;
    try {
      const token = process.env.INSTAGRAM_PUBLISH_TOKEN!;
      const res = await fetch(
        `${GRAPH}/${publicado.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      permalink = ((await res.json()) as { permalink?: string }).permalink;
    } catch {
      /* o permalink é conveniência; não vale falhar a publicação por ele */
    }

    return { status: "publicado", mediaId: publicado.id, permalink, imagens };
  } catch (e) {
    return {
      status: "erro",
      erro: e instanceof Error ? e.message : "Falha ao publicar",
      imagens,
    };
  }
}

/** Carrossel do Instagram aceita no máximo 10 cards. */
export const LIMITE_CARROSSEL = 10;
