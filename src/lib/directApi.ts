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

// Sem "reactions": a Meta recusa o campo nas mensagens do Instagram
// ("Unsupported request"). Recusa sem nome derruba os extras do fim para o
// começo, por isso o menos importante vai por último.
const CAMPOS = "id,created_time,from,to,message,attachments,story,shares,is_unsupported";
const CAMPOS_BASICOS = "id,created_time,from,to,message";

/** Histórico lido até o fim. O número sobe quando a leitura passa a trazer
 *  campos novos: a conta com a marca antiga relê tudo uma vez. */
const LIDO = "fim-5";

type MsgApi = {
  id: string;
  created_time: string;
  from?: { id?: string };
  message?: string;
  attachments?: { data?: Anexo[] };
  reactions?: { data?: { reaction?: string; users?: { id?: string }[] }[] };
  shares?: { data?: { link?: string }[] };
  story?: { mention?: unknown; reply_to?: unknown };
  is_unsupported?: boolean;
};
type Anexo = {
  mime_type?: string;
  type?: string;
  file_url?: string;
  name?: string;
  image_data?: { render_as_sticker?: boolean; animated_gif_url?: string };
  video_data?: unknown;
  audio_data?: unknown;
};

/** Foto, vídeo, áudio, figurinha ou post compartilhado — pelo que o anexo trouxer de pista. */
function tipoDoAnexo(a: Anexo): "midia" | "audio" | "figurinha" | "compartilhamento" {
  // generic_template é o cartão de um post ou reel enviado no Direct.
  if ("generic_template" in a) return "compartilhamento";
  const pista = `${a.mime_type ?? ""} ${a.type ?? ""} ${a.name ?? ""} ${(a.file_url ?? "").split("?")[0]}`.toLowerCase();
  if (a.image_data?.render_as_sticker || a.image_data?.animated_gif_url || /sticker|gif/.test(pista)) return "figurinha";
  if (a.audio_data || /audio|\.(m4a|aac|mp3|ogg|opus|wav)\b/.test(pista)) return "audio";
  return "midia";
}

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
  const anexos = (m.attachments?.data ?? []).map(tipoDoAnexo);
  const links = (m.shares?.data ?? []).map((s) => s.link ?? "");
  const respostaStory = !!m.story?.reply_to || links.some((l) => l.includes("/stories/"));

  const dados = {
    midias: anexos.filter((a) => a === "midia").length,
    audios: anexos.filter((a) => a === "audio").length,
    figurinhas: anexos.filter((a) => a === "figurinha").length,
    compartilhamento: links.some((l) => !l.includes("/stories/")) || anexos.includes("compartilhamento"),
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
  if (!cred) {
    return {
      mensagens: 0,
      chamadas: 0,
      historico: "sem conta conectada",
      meses: [] as { ano: number; mes: number }[],
      parou: undefined as string | undefined,
    };
  }
  const { projectId } = conta;

  // Campo que a Meta recusar sai sozinho — o erro diz qual é — e os outros
  // continuam vindo. Recusa sem nome derruba os extras de um em um.
  const campos = CAMPOS.split(",");
  const basicos = CAMPOS_BASICOS.split(",");
  const recusados: string[] = [];
  let tamanho = 50;
  let chamadas = 0;
  const pagina = async (after?: string): Promise<Pagina> => {
    for (;;) {
      chamadas++;
      const q =
        `${cred.igUserId}/conversations?platform=instagram&limit=${tamanho}` +
        `&fields=id,updated_time,messages.limit(20){${campos.join(",")}}` +
        (after ? `&after=${encodeURIComponent(after)}` : "");
      try {
        return await graph<Pagina>(q, cred.token);
      } catch (e) {
        if (e instanceof LimiteDaMeta || chamadas >= orcamento + 8) throw e;
        const msg = e instanceof Error ? e.message : "";
        const extras = campos.filter((c) => !basicos.includes(c));
        const nomeado = msg.match(/fields?\W+\(?([a-z_]+)/i)?.[1];
        if (/^100:/.test(msg) && extras.length) {
          const fora = nomeado && extras.includes(nomeado) ? nomeado : extras.at(-1)!;
          campos.splice(campos.indexOf(fora), 1);
          recusados.push(`${fora} (${msg.slice(0, 120)})`);
        } else if (tamanho > 20 && /^(1|2):/.test(msg)) {
          // "Reduza a quantidade de dados": páginas menores.
          tamanho = 20;
        } else throw e;
      }
    }
  };

  const linhas: Linha[] = [];
  let maisNova = conta.directAte;
  // Só os nomes dos campos que vieram (nunca o conteúdo): mostra no resultado
  // da coleta o que a Meta está entregando.
  const formatos = new Map<string, number>();
  const anotar = (k: string) => formatos.set(k, (formatos.get(k) ?? 0) + 1);
  const guardar = (c: ConversaApi) => {
    const t = c.updated_time ? new Date(c.updated_time) : null;
    if (t && (!maisNova || t > maisNova)) maisNova = t;
    for (const m of c.messages?.data ?? []) {
      for (const k of Object.keys(m)) if (!["id", "created_time", "from", "to", "message"].includes(k)) anotar(k);
      for (const a of m.attachments?.data ?? []) anotar(`anexo:${Object.keys(a).sort().join("+")}`);
      if (m.story) anotar(`story:${Object.keys(m.story).join("+")}`);
      const l = paraLinha(projectId, cred.igUserId, c.id, m);
      if (l) linhas.push(l);
    }
  };

  // Leitura feita por uma versão anterior da coleta (menos campos): o
  // histórico é relido e as mensagens já guardadas são completadas.
  const relendo = conta.directCursor !== null && conta.directCursor.startsWith("fim") && conta.directCursor !== LIDO;
  let cursor = relendo ? null : conta.directCursor;
  const lidaAte = relendo ? null : conta.directAte;
  let parou: string | undefined;
  try {
    // 1. Novidades: do topo (mais recente) até a primeira conversa já lida.
    let after: string | undefined;
    for (let fim = false; !fim && chamadas < orcamento; ) {
      const p = await pagina(after);
      for (const c of p.data ?? []) {
        if (lidaAte && c.updated_time && new Date(c.updated_time) <= lidaAte) {
          fim = true;
          break;
        }
        guardar(c);
      }
      const proximo = p.paging?.next ? p.paging.cursors?.after : undefined;
      // Primeira coleta: esta página abre também a leitura do histórico.
      if (cursor === null) {
        cursor = proximo ?? LIDO;
        fim = true;
      }
      if (!proximo) fim = true;
      after = proximo;
    }

    // 2. Histórico, de onde parou na passagem anterior.
    while (cursor && cursor !== LIDO && chamadas < orcamento) {
      const p = await pagina(cursor);
      for (const c of p.data ?? []) guardar(c);
      cursor = (p.paging?.next ? p.paging.cursors?.after : undefined) ?? LIDO;
    }
  } catch (e) {
    if (!(e instanceof LimiteDaMeta)) throw e;
    parou = `limite da Meta (${e.message})`;
  }

  // Mensagem já gravada não é regravada, salvo na releitura ou quando chegou
  // reação nova numa antiga.
  for (let i = 0; i < linhas.length; i += 1000) {
    await db.mensagemDirect.createMany({ data: linhas.slice(i, i + 1000), skipDuplicates: true });
  }
  const regravar =
    conta.directCursor !== LIDO
      ? linhas
      : linhas.filter((x) => (x.dados as { reacoes: unknown[] }).reacoes.length);
  for (let i = 0; i < regravar.length; i += 200) {
    await db.$transaction(
      regravar.slice(i, i + 200).map((l) =>
        db.mensagemDirect.update({ where: { id: l.id }, data: { dados: l.dados, tipo: l.tipo } }),
      ),
    );
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
    historico: cursor === LIDO ? "lido" : "em andamento",
    meses: [...meses.values()],
    parou,
    ...(recusados.length ? { camposRecusados: recusados } : {}),
    campos: Object.fromEntries(formatos),
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
      // O mês corrente e o anterior sempre: "sem resposta" e tempo de
      // resposta mudam quando a conta responde, mesmo dias depois.
      const agora = new Date(Date.now() - 3 * 3600_000);
      const ano = agora.getUTCFullYear();
      const mes = agora.getUTCMonth() + 1;
      const meses = [...r.meses, { ano, mes }, mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }];
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
