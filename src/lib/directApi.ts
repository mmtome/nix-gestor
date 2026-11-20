import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { GRAPH } from "./meta";
import { credencialDaConta } from "./insights";
import { comoDirect, feicoesDoTexto, resumirDirect } from "./direct";
import type { ConversaBruta, Feicoes, MensagemBruta } from "./direct";

/* ============================================================================
   Direct pela API — coleta contínua e resumo do mês.

   A API de conversas só detalha as 20 mensagens mais recentes de cada
   conversa. Lida de hora em hora (GitHub Actions → /api/cron/direct), isso
   basta: entre duas leituras nenhuma conversa recebe 20 mensagens, então
   nada se perde. Cada mensagem é gravada uma vez em MensagemDirect, sem o
   texto, e o resumo do mês sai dali para DadosExportados (tipo "direct"), o
   mesmo lugar que o arquivo exportado usa — o deck não sabe a diferença.

   O histórico de antes da primeira coleta é lido aos poucos, uma parte a
   cada passagem (`directCursor`), dentro de um orçamento de chamadas: a Meta
   corta o app inteiro quando ele passa do limite por hora.
   ========================================================================== */

const CAMPOS = "id,created_time,from,to,message,attachments,reactions,shares,story,is_unsupported";
const CAMPOS_BASICOS = "id,created_time,from,to,message";

type MsgApi = {
  id: string;
  created_time: string;
  from?: { id?: string };
  message?: string;
  attachments?: { data?: { mime_type?: string; image_data?: { render_as_sticker?: boolean } }[] };
  reactions?: { data?: { reaction?: string; users?: { id?: string }[] }[] };
  shares?: { data?: { link?: string }[] };
  story?: { mention?: unknown; reply_to?: unknown };
  is_unsupported?: boolean;
};
type ConversaApi = { id: string; updated_time?: string; messages?: { data?: MsgApi[] } };
type Pagina = { data?: ConversaApi[]; paging?: { next?: string; cursors?: { after?: string } } };

class LimiteDaMeta extends Error {}

async function graph<T>(caminho: string, token: string): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { message?: string; code?: number } }).error;
    // 4, 17, 32, 613: limite de chamadas. Parar e tentar na próxima passagem.
    if ([4, 17, 32, 613].includes(e?.code ?? 0)) throw new LimiteDaMeta(e?.message ?? "limite");
    throw new Error(`${e?.code ?? res.status}: ${e?.message ?? "erro"}`);
  }
  // Perto do teto do app, para antes de levar o corte.
  const uso = res.headers.get("x-app-usage");
  if (uso) {
    try {
      const u = JSON.parse(uso) as { call_count?: number };
      if ((u.call_count ?? 0) >= 85) throw new LimiteDaMeta(`uso do app em ${u.call_count}%`);
    } catch (e) {
      if (e instanceof LimiteDaMeta) throw e;
    }
  }
  return json as T;
}

/** O id de quem escreve não precisa ficar guardado: o hash basta para contar pessoas. */
const anonimo = (projectId: string, id: string) =>
  createHash("sha256").update(`${projectId}:${id}`).digest("hex").slice(0, 16);

type Linha = Prisma.MensagemDirectCreateManyInput;

function paraLinha(projectId: string, ig: string, conversaId: string, m: MsgApi): Linha | null {
  const em = new Date(m.created_time);
  if (Number.isNaN(em.getTime())) return null;
  const daConta = m.from?.id === ig;
  const anexos = m.attachments?.data ?? [];
  const tipoDe = (a: (typeof anexos)[number]) => a.mime_type ?? "";
  const figurinhas = anexos.filter((a) => a.image_data?.render_as_sticker || tipoDe(a) === "image/gif").length;
  const links = (m.shares?.data ?? []).map((s) => s.link ?? "");
  const respostaStory = !!m.story?.reply_to || links.some((l) => l.includes("/stories/"));

  const dados = {
    midias: anexos.filter((a) => /^(image|video)\//.test(tipoDe(a))).length - figurinhas,
    audios: anexos.filter((a) => tipoDe(a).startsWith("audio/")).length,
    figurinhas,
    compartilhamento: links.some((l) => !l.includes("/stories/")),
    respostaStory,
    reacoes: (m.reactions?.data ?? []).flatMap((r) =>
      (r.users ?? []).map((u) => ({
        emoji: r.reaction ?? "",
        autor: u.id === ig ? "conta" : anonimo(projectId, u.id ?? ""),
      })),
    ),
    feicoes: feicoesDoTexto(m.message ?? "") satisfies Feicoes,
  };

  return {
    id: m.id,
    projectId,
    conversaId,
    em,
    daConta,
    autor: daConta ? "conta" : anonimo(projectId, m.from?.id ?? conversaId),
    tipo: m.story?.mention ? "mencao" : "mensagem",
    dados: dados as Prisma.InputJsonValue,
  };
}

type Conta = {
  projectId: string;
  igUserId: string | null;
  accessToken: string | null;
  directDesde: Date | null;
  directAte: Date | null;
  directCursor: string | null;
};

/**
 * Uma passagem pela caixa de entrada: primeiro o que mudou desde a última
 * leitura, depois mais um pedaço do histórico. Devolve os meses tocados.
 */
export async function coletarDirectDaConta(conta: Conta, orcamento = 10) {
  const cred = credencialDaConta(conta);
  if (!cred) return { mensagens: 0, meses: [] as { ano: number; mes: number }[], erro: "sem conta conectada" };
  const { projectId } = conta;

  let campos = CAMPOS;
  let tamanho = 50;
  let chamadas = 0;
  const pagina = async (after?: string): Promise<Pagina> => {
    chamadas++;
    const q =
      `${cred.igUserId}/conversations?platform=instagram&limit=${tamanho}` +
      `&fields=id,updated_time,messages.limit(20){${campos}}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    try {
      return await graph<Pagina>(q, cred.token);
    } catch (e) {
      if (e instanceof LimiteDaMeta) throw e;
      const msg = e instanceof Error ? e.message : "";
      // Campo que esta versão da API não aceita: segue com os básicos.
      if (campos === CAMPOS && /^100:/.test(msg)) campos = CAMPOS_BASICOS;
      // "Reduza a quantidade de dados": páginas menores.
      else if (tamanho > 20 && /^(1|2):/.test(msg)) tamanho = 20;
      else throw e;
      chamadas++;
      return graph<Pagina>(q.replace(CAMPOS, campos).replace(/limit=50/, `limit=${tamanho}`), cred.token);
    }
  };

  const linhas: Linha[] = [];
  let maisNova = conta.directAte;
  const guardar = (c: ConversaApi) => {
    const t = c.updated_time ? new Date(c.updated_time) : null;
    if (t && (!maisNova || t > maisNova)) maisNova = t;
    for (const m of c.messages?.data ?? []) {
      const l = paraLinha(projectId, cred.igUserId, c.id, m);
      if (l) linhas.push(l);
    }
  };

  let cursor = conta.directCursor;
  let parou: string | undefined;
  try {
    // 1. Novidades: do topo (mais recente) até a primeira conversa já lida.
    let after: string | undefined;
    for (let fim = false; !fim && chamadas < orcamento; ) {
      const p = await pagina(after);
      for (const c of p.data ?? []) {
        if (conta.directAte && c.updated_time && new Date(c.updated_time) <= conta.directAte) {
          fim = true;
          break;
        }
        guardar(c);
      }
      const proximo = p.paging?.next ? p.paging.cursors?.after : undefined;
      // Primeira coleta: esta página abre também a leitura do histórico.
      if (cursor === null) {
        cursor = proximo ?? "fim";
        fim = true;
      }
      if (!proximo) fim = true;
      after = proximo;
    }

    // 2. Histórico, de onde parou na passagem anterior.
    while (cursor && cursor !== "fim" && chamadas < orcamento) {
      const p = await pagina(cursor);
      for (const c of p.data ?? []) guardar(c);
      cursor = (p.paging?.next ? p.paging.cursors?.after : undefined) ?? "fim";
    }
  } catch (e) {
    if (!(e instanceof LimiteDaMeta)) throw e;
    parou = `limite da Meta (${e.message})`;
  }

  // Mensagem já gravada não é regravada; reação nova numa antiga atualiza.
  for (let i = 0; i < linhas.length; i += 1000) {
    await db.mensagemDirect.createMany({ data: linhas.slice(i, i + 1000), skipDuplicates: true });
  }
  for (const l of linhas.filter((x) => (x.dados as { reacoes: unknown[] }).reacoes.length)) {
    await db.mensagemDirect.update({ where: { id: l.id }, data: { dados: l.dados } });
  }

  await db.instagramAccount.update({
    where: { projectId },
    data: {
      directDesde: conta.directDesde ?? new Date(),
      directAte: maisNova,
      directCursor: cursor,
    },
  });

  const meses = new Map<string, { ano: number; mes: number }>();
  for (const l of linhas) {
    const d = new Date(new Date(l.em).getTime() - 3 * 3600_000);
    meses.set(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  return {
    mensagens: linhas.length,
    chamadas,
    historico: cursor === "fim" ? "lido" : "em andamento",
    meses: [...meses.values()],
    parou,
  };
}

const inicioDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes - 1, 1, 3));

/**
 * Refaz o resumo de um mês a partir das mensagens guardadas. As conversas do
 * mês entram inteiras — "iniciada", "sem resposta" e o tempo de resposta
 * dependem do que veio antes e depois.
 *
 * Mês anterior ao início da coleta contínua é parcial (só as 20 últimas
 * mensagens de cada conversa): nesse caso, um resumo vindo do arquivo
 * exportado, que é completo, não é substituído.
 */
export async function recalcularDirect(projectId: string, ano: number, mes: number) {
  const inicio = inicioDoMes(ano, mes);
  const fim = mes === 12 ? inicioDoMes(ano + 1, 1) : inicioDoMes(ano, mes + 1);

  const ativas = await db.mensagemDirect.findMany({
    where: { projectId, em: { gte: inicio, lt: fim } },
    distinct: ["conversaId"],
    select: { conversaId: true },
  });
  if (!ativas.length) return null;

  const conversas = new Map<string, ConversaBruta>();
  const ids = ativas.map((a) => a.conversaId);
  for (let i = 0; i < ids.length; i += 500) {
    const linhas = await db.mensagemDirect.findMany({
      where: { projectId, conversaId: { in: ids.slice(i, i + 500) } },
      select: { conversaId: true, em: true, daConta: true, autor: true, tipo: true, dados: true },
    });
    for (const l of linhas) {
      const c = conversas.get(l.conversaId) ?? {
        id: l.conversaId,
        pasta: "inbox" as const,
        participantes: [],
        mensagens: [] as MensagemBruta[],
      };
      const d = l.dados as Partial<MensagemBruta>;
      c.mensagens.push({
        autor: l.autor,
        ts: l.em.getTime(),
        tipo: l.tipo === "mencao" ? "mencao" : "mensagem",
        texto: "",
        midias: Math.max(0, d.midias ?? 0),
        audios: d.audios ?? 0,
        figurinhas: d.figurinhas ?? 0,
        compartilhamento: !!d.compartilhamento,
        respostaStory: !!d.respostaStory,
        reacoes: d.reacoes ?? [],
        segundosLigacao: 0,
        feicoes: d.feicoes,
      });
      conversas.set(l.conversaId, c);
    }
  }

  const resumo = resumirDirect([...conversas.values()], "conta").find((m) => m.ano === ano && m.mes === mes);
  if (!resumo) return null;

  const conta = await db.instagramAccount.findUnique({ where: { projectId }, select: { directDesde: true } });
  const completo = !!conta?.directDesde && conta.directDesde <= inicio;
  const dados = { ...resumo.dados, fonte: "api" as const, completo, arquivoAte: new Date().toISOString() };

  const chave = { projectId_ano_mes_tipo: { projectId, ano, mes, tipo: "direct" } };
  const atual = await db.dadosExportados.findUnique({ where: chave, select: { dados: true } });
  if (!completo && comoDirect(atual?.dados)?.fonte === "arquivo") return comoDirect(atual?.dados);

  await db.dadosExportados.upsert({
    where: chave,
    create: { projectId, ano, mes, tipo: "direct", dados: dados as Prisma.InputJsonValue },
    update: { dados: dados as Prisma.InputJsonValue },
  });
  return comoDirect(dados);
}

/** A passagem de hora em hora: todas as contas, e o resumo dos meses tocados. */
export async function coletarDirectTodos() {
  const contas = await db.instagramAccount.findMany({
    where: { igUserId: { not: null }, accessToken: { not: null } },
    select: {
      projectId: true,
      username: true,
      igUserId: true,
      accessToken: true,
      directDesde: true,
      directAte: true,
      directCursor: true,
    },
  });
  const resultado = [];
  for (const c of contas) {
    try {
      const r = await coletarDirectDaConta(c);
      // O mês corrente sempre: "sem resposta" muda mesmo sem mensagem nova.
      const agora = new Date(Date.now() - 3 * 3600_000);
      const meses = [...r.meses, { ano: agora.getUTCFullYear(), mes: agora.getUTCMonth() + 1 }];
      const feitos = new Set<string>();
      for (const m of meses) {
        const k = `${m.ano}-${m.mes}`;
        if (feitos.has(k)) continue;
        feitos.add(k);
        await recalcularDirect(c.projectId, m.ano, m.mes);
      }
      resultado.push({ conta: c.username, ...r, meses: [...feitos] });
    } catch (e) {
      resultado.push({ conta: c.username, erro: e instanceof Error ? e.message : "erro" });
    }
  }
  return resultado;
}
