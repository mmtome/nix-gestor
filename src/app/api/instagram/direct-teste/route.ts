import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { db } from "@/lib/db";
import { GRAPH, decifrar } from "@/lib/meta";

/* TEMPORÁRIO — diagnóstico do que a API de mensagens devolve para a conta do
   projeto. Só contagens e mensagens de erro; nenhum texto de conversa. */

export const maxDuration = 120;

type Resposta = { data?: { id: string; updated_time?: string }[]; paging?: { next?: string } };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getSession();
  if (!user) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });
  const pelaConta = await db.instagramAccount.findFirst({
    where: { username: url.searchParams.get("conta") ?? "" },
    select: { projectId: true },
  });
  const projectId = pelaConta?.projectId ?? url.searchParams.get("projeto") ?? "";
  try {
    await assertProjectAccess(user, projectId, false);
  } catch {
    return NextResponse.json({ erro: "sem acesso" }, { status: 403 });
  }

  const conta = await db.instagramAccount.findUnique({
    where: { projectId },
    select: { igUserId: true, accessToken: true, username: true },
  });
  if (!conta?.igUserId || !conta.accessToken) return NextResponse.json({ erro: "sem conta" });
  const token = decifrar(conta.accessToken);
  const ig = conta.igUserId;

  const chamar = async (caminho: string) => {
    const sep = caminho.includes("?") ? "&" : "?";
    const res = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (json as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
      throw new Error(`${e?.code ?? res.status}/${e?.error_subcode ?? "-"}: ${e?.message ?? "erro"}`);
    }
    return json;
  };
  const tentar = async (caminho: string) => {
    try {
      return { ok: true as const, v: await chamar(caminho) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "erro" };
    }
  };

  const relato: Record<string, unknown> = { conta: conta.username };
  const inicio = Date.now();

  const lista = [
    `${ig}/conversations?platform=instagram&fields=id,updated_time&limit=50`,
    `me/conversations?platform=instagram&fields=id,updated_time&limit=50`,
  ];
  const paginas = await tentar("me/accounts?fields=id,name&limit=10");
  relato.paginas = paginas.ok
    ? (paginas.v as { data?: { id: string; name: string }[] }).data?.map((p) => p.name)
    : paginas.erro;
  if (paginas.ok) {
    for (const p of ((paginas.v as { data?: { id: string }[] }).data ?? []).slice(0, 2)) {
      lista.push(`${p.id}/conversations?platform=instagram&fields=id,updated_time&limit=50`);
    }
  }

  const tentativas: Record<string, unknown>[] = [];
  let conversas: { id: string; updated_time?: string }[] = [];
  for (const caminho of lista) {
    const r = await tentar(caminho);
    tentativas.push({ caminho: caminho.split("?")[0], ok: r.ok, erro: r.ok ? undefined : r.erro });
    if (!r.ok) continue;
    let pag = r.v as Resposta;
    const achadas = [...(pag.data ?? [])];
    for (let i = 0; i < 3 && pag.paging?.next; i++) {
      const prox = new URL(pag.paging.next);
      prox.searchParams.delete("access_token");
      const r2 = await tentar(prox.pathname.replace(/^\/v[\d.]+\//, "") + prox.search);
      if (!r2.ok) break;
      pag = r2.v as Resposta;
      achadas.push(...(pag.data ?? []));
    }
    tentativas[tentativas.length - 1].conversas = achadas.length;
    tentativas[tentativas.length - 1].maisPaginas = !!pag.paging?.next;
    if (achadas.length && !conversas.length) conversas = achadas;
  }
  relato.tentativas = tentativas;

  if (conversas.length) {
    const datas = conversas.map((c) => c.updated_time).filter(Boolean).sort();
    relato.atualizadas = { de: datas[0], ate: datas.at(-1) };
    const amostra: Record<string, unknown>[] = [];
    for (const c of conversas.slice(0, 3)) {
      const ids = await tentar(`${c.id}?fields=messages.limit(100){id,created_time}`);
      const det = await tentar(`${c.id}?fields=messages.limit(30){id,created_time,from,to,message}`);
      const extra = await tentar(
        `${c.id}?fields=messages.limit(5){id,created_time,from,attachments,reactions,shares,story,is_unsupported}`,
      );
      type M = { from?: { id?: string } };
      const msgs = (det.ok ? ((det.v as { messages?: { data?: M[] } }).messages?.data ?? []) : []) as M[];
      amostra.push({
        idsListados: ids.ok ? ((ids.v as { messages?: { data?: unknown[] } }).messages?.data?.length ?? 0) : ids.erro,
        detalhadas: det.ok ? msgs.length : det.erro,
        comRemetente: msgs.filter((m) => m.from?.id).length,
        daConta: msgs.filter((m) => m.from?.id === ig).length,
        camposExtras: extra.ok ? "ok" : extra.erro,
      });
    }
    relato.amostra = amostra;
  }

  relato.segundos = Math.round((Date.now() - inicio) / 1000);
  return NextResponse.json(relato);
}
