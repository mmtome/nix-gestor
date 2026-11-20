import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fmtTZ } from "@/lib/dates";
import type { SacStatus } from "./core";
import type { TipoTag } from "./tipos";

/* ============================================================================
   Relatório do SAC: tudo o que chegou num período — o que foi respondido, o
   que ficou sem resposta, tempos, quem respondeu, quebras por canal/categoria/
   evento e cada dúvida com as respostas e notas. Datas no horário de Brasília.
   ========================================================================== */

const DIA = 24 * 3600 * 1000;
const LIMITE = 3000;

export type FiltrosRelatorioSac = {
  de: string; // AAAA-MM-DD
  ate: string; // AAAA-MM-DD (inclusive)
  canal: string;
  categoria: string;
  evento: string;
};

/** Meia-noite de Brasília (UTC−3, sem horário de verão desde 2019). */
const inicioDoDia = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 3));
};

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
};
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const minutos = (a: Date, b: Date | null) => (b ? (b.getTime() - a.getTime()) / 60_000 : null);

export type Quebra = {
  slug: string;
  label: string;
  color: string | null;
  total: number;
  resolvidos: number;
  respondidos: number;
  aguardando: number;
  medianaRespostaMin: number | null;
};

export type ItemRelatorio = {
  id: string;
  status: SacStatus;
  titulo: string;
  legenda: string;
  selos: { tipo: TipoTag; label: string; color: string | null }[];
  remetente: string | null;
  recebidoEm: string;
  primeiraRespostaMin: number | null;
  resolvidoEm: string | null;
  resolvidoMin: number | null;
  resolvidoPor: string | null;
  resolvidoVia: string | null;
  anexos: string[];
  comentarios: { autor: string; texto: string; em: string; fonte: "whatsapp" | "gestor"; doRemetente: boolean }[];
};

export type RelatorioSac = Awaited<ReturnType<typeof montarRelatorioSac>>;

export async function montarRelatorioSac(f: FiltrosRelatorioSac) {
  const inicio = inicioDoDia(f.de);
  const fim = new Date(inicioDoDia(f.ate).getTime() + DIA);
  const [config, tags] = await Promise.all([
    db.sacConfig.findUnique({ where: { id: "sac" } }),
    db.sacTag.findMany(),
  ]);
  const porSlug = new Map(tags.map((t) => [t.slug, t]));
  const amarelo = config?.slaAmareloHoras ?? 2;
  const vermelho = config?.slaVermelhoHoras ?? 6;

  const where: Prisma.SacCardWhereInput = {
    receivedAt: { gte: inicio, lt: fim },
    ...(f.canal ? { canal: f.canal } : {}),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.evento ? { evento: f.evento } : {}),
  };
  const cards = await db.sacCard.findMany({
    where,
    orderBy: { receivedAt: "asc" },
    take: LIMITE,
    include: {
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true } },
      comments: { orderBy: { createdAt: "asc" } },
      events: { where: { type: "status", toStatus: "resolvido" }, orderBy: { id: "desc" }, take: 1 },
    },
  });

  const agora = Date.now();
  const validos = cards.filter((c) => c.status !== "arquivado");
  const contar = (s: SacStatus) => cards.filter((c) => c.status === s).length;
  const respondido = (c: (typeof cards)[number]) => !!c.firstResponseAt || c.status === "respondido_grupo" || c.status === "resolvido";

  const tempos1a = validos.flatMap((c) => {
    const m = minutos(c.receivedAt, c.firstResponseAt);
    return m === null ? [] : [m];
  });
  const temposResolucao = validos.flatMap((c) => {
    const m = c.status === "resolvido" ? minutos(c.receivedAt, c.resolvedAt) : null;
    return m === null ? [] : [m];
  });

  // Como foi resolvido: o último evento que levou a "resolvido".
  const vias = { reacao: 0, resposta: 0, gestor: 0, sistema: 0 };
  for (const c of validos) {
    const via = c.status === "resolvido" ? c.events[0]?.via : null;
    if (via && via in vias) vias[via as keyof typeof vias]++;
  }

  // Quem respondeu no grupo (resposta escrita de alguém que não mandou o print) e quem resolveu.
  const pessoas = new Map<string, { nome: string; respostas: number; cards: Set<string>; resolveu: number }>();
  const pessoa = (id: string, nome: string) => {
    const p = pessoas.get(id) ?? { nome, respostas: 0, cards: new Set<string>(), resolveu: 0 };
    pessoas.set(id, p);
    return p;
  };
  for (const c of cards) {
    for (const m of c.comments) {
      if (m.source !== "whatsapp" || (c.senderId && m.authorId === c.senderId)) continue;
      const p = pessoa(m.authorId ?? m.authorName ?? "?", m.authorName ?? m.authorId ?? "—");
      p.respostas++;
      p.cards.add(c.id);
    }
    const r = c.status === "resolvido" ? c.events[0] : null;
    if (r) pessoa(r.actorId ?? r.actorName ?? "?", r.actorName ?? (r.actorId === "conta" ? "Número do SAC" : r.actorId ?? "—")).resolveu++;
  }

  const quebra = (campo: TipoTag): Quebra[] => {
    const grupos = new Map<string, typeof validos>();
    for (const c of validos) {
      const k = c[campo] ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    return [...grupos]
      .map(([slug, lista]) => ({
        slug: slug || "—",
        label: slug ? (porSlug.get(slug)?.label ?? `#${slug}`) : "Sem tag",
        color: slug ? (porSlug.get(slug)?.color ?? null) : null,
        total: lista.length,
        resolvidos: lista.filter((c) => c.status === "resolvido").length,
        respondidos: lista.filter(respondido).length,
        aguardando: lista.filter((c) => c.status === "novo").length,
        medianaRespostaMin: mediana(lista.flatMap((c) => {
          const m = minutos(c.receivedAt, c.firstResponseAt);
          return m === null ? [] : [m];
        })),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
  };

  // Volume por dia (ou por semana, em períodos longos) e por hora do dia.
  const dias = Math.round((fim.getTime() - inicio.getTime()) / DIA);
  const porSemana = dias > 62;
  const serie = new Map<string, number>();
  for (let t = inicio.getTime(); t < fim.getTime(); t += porSemana ? 7 * DIA : DIA) {
    serie.set(fmtTZ(new Date(t), "yyyy-MM-dd"), 0);
  }
  const chaves = [...serie.keys()];
  for (const c of cards) {
    const k = fmtTZ(c.receivedAt, "yyyy-MM-dd");
    const alvo = porSemana ? [...chaves].reverse().find((s) => s <= k) : k;
    if (alvo && serie.has(alvo)) serie.set(alvo, serie.get(alvo)! + 1);
  }
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const c of cards) porHora[Number(fmtTZ(c.receivedAt, "H"))]++;

  const desconhecidas = new Map<string, number>();
  for (const c of cards) for (const t of c.tagsDesconhecidas) desconhecidas.set(t, (desconhecidas.get(t) ?? 0) + 1);

  const itens: ItemRelatorio[] = cards.map((c) => {
    const via = c.status === "resolvido" ? c.events[0]?.via ?? null : null;
    return {
      id: c.id,
      status: c.status as SacStatus,
      titulo: c.titulo,
      legenda: c.legendaOriginal,
      selos: (["canal", "categoria", "evento", "prioridade"] as TipoTag[]).flatMap((tipo) => {
        const slug = c[tipo];
        if (!slug) return [];
        const t = porSlug.get(slug);
        return [{ tipo, label: t?.label ?? `#${slug}`, color: t?.color ?? null }];
      }),
      remetente: c.senderName,
      recebidoEm: c.receivedAt.toISOString(),
      primeiraRespostaMin: minutos(c.receivedAt, c.firstResponseAt),
      resolvidoEm: c.status === "resolvido" ? (c.resolvedAt?.toISOString() ?? null) : null,
      resolvidoMin: c.status === "resolvido" ? minutos(c.receivedAt, c.resolvedAt) : null,
      resolvidoPor: c.status === "resolvido" ? c.resolvedBy : null,
      resolvidoVia: via,
      anexos: c.attachments.map((a) => a.id),
      comentarios: c.comments.map((m) => ({
        autor: m.authorName ?? m.authorId ?? "—",
        texto: m.text,
        em: m.createdAt.toISOString(),
        fonte: m.source as "whatsapp" | "gestor",
        doRemetente: !!c.senderId && m.authorId === c.senderId,
      })),
    };
  });

  return {
    filtros: f,
    geradoEm: new Date().toISOString(),
    cortado: cards.length >= LIMITE,
    sla: { amarelo, vermelho },
    numeros: {
      recebidos: cards.length,
      validos: validos.length,
      aguardando: contar("novo"),
      respondidoGrupo: contar("respondido_grupo"),
      resolvidos: contar("resolvido"),
      arquivados: contar("arquivado"),
      respondidos: validos.filter(respondido).length,
      comRespostaEscrita: validos.filter((c) =>
        c.comments.some((m) => m.source === "whatsapp" && !(c.senderId && m.authorId === c.senderId)),
      ).length,
      notasInternas: cards.reduce((n, c) => n + c.comments.filter((m) => m.source === "gestor").length, 0),
      respondidosNoPrazo: tempos1a.filter((m) => m <= amarelo * 60).length,
      // Sem resposta há mais tempo que o prazo vermelho (ainda aguardando).
      atrasados: validos.filter((c) => c.status === "novo" && agora - c.receivedAt.getTime() > vermelho * 3_600_000).length,
      primeiraResposta: { media: media(tempos1a), mediana: mediana(tempos1a) },
      resolucao: { media: media(temposResolucao), mediana: mediana(temposResolucao) },
      vias,
    },
    serie: { porSemana, pontos: chaves.map((k) => ({ dia: k, total: serie.get(k)! })) },
    porHora,
    porCanal: quebra("canal"),
    porCategoria: quebra("categoria"),
    porEvento: quebra("evento"),
    porPrioridade: quebra("prioridade"),
    pessoas: [...pessoas.values()]
      .map((p) => ({ nome: p.nome, respostas: p.respostas, cards: p.cards.size, resolveu: p.resolveu }))
      .sort((a, b) => b.cards + b.resolveu - (a.cards + a.resolveu)),
    desconhecidas: [...desconhecidas].map(([tag, total]) => ({ tag, total })).sort((a, b) => b.total - a.total),
    itens,
  };
}
