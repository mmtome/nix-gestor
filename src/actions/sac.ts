"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { cifrar } from "@/lib/meta";
import { refreshAll } from "@/lib/revalidate";
import { slugify, type SacStatus } from "@/lib/sac/core";
import { credenciais, lerConfig } from "@/lib/sac/config";
import { mudarStatus } from "@/lib/sac/cards";
import { processarWebhook } from "@/lib/sac/tratar";
import {
  desconectar,
  estadoConexao,
  listarGrupos,
  prepararInstancia,
  qrCode,
  reagir,
  type EstadoConexao,
} from "@/lib/sac/evolution";

/* ============================================================================
   Ações da aba SAC. O quadro é de todo usuário logado; as configurações
   (conexão, grupo, regras, tags) só de administrador.
   ========================================================================== */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const erro = (e: unknown) => ({
  ok: false as const,
  erro: e instanceof z.ZodError ? e.issues[0]?.message ?? "Dados inválidos." : e instanceof Error ? e.message : String(e),
});

async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Só administradores mudam as configurações do SAC.");
  return user;
}

const status = z.enum(["novo", "respondido_grupo", "resolvido", "arquivado"]);
const ordem = z.string().regex(/^[0-9A-Za-z]{1,120}$/, "Ordem inválida.");

/* -------------------------------------------------------------------------- */
/* quadro                                                                      */
/* -------------------------------------------------------------------------- */

/** Arrastar no quadro: muda a coluna e/ou a posição. */
export async function moverCardSac(input: { cardId: string; para: SacStatus; ordem: string }): Promise<Resultado> {
  try {
    const user = await requireUser();
    const d = z.object({ cardId: z.string().min(1), para: status, ordem }).parse(input);
    const card = await db.sacCard.findUnique({ where: { id: d.cardId } });
    if (!card) throw new Error("Card não encontrado.");

    if (card.status === d.para) {
      await db.sacCard.update({ where: { id: card.id }, data: { ordem: d.ordem } });
    } else {
      await mudarStatus(card, d.para, { via: "gestor", actorId: user.id, actorName: user.name }, db, d.ordem);
      await sincronizarReacao(card, d.para);
    }
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

/** Fase 6: resolver no gestor reage ✅ no print; tirar de Resolvido tira a reação. */
async function sincronizarReacao(
  card: { status: string; groupJid: string; waMessageId: string; senderFromMe: boolean; senderId: string | null },
  para: string,
) {
  const config = await lerConfig();
  const c = credenciais(config);
  if (!c || !config.reagirAoResolver) return;
  const emoji = para === "resolvido" ? (config.emojisResolvido[0] ?? "✅") : card.status === "resolvido" ? "" : null;
  if (emoji === null) return;
  try {
    await reagir(
      c,
      {
        remoteJid: card.groupJid,
        fromMe: card.senderFromMe,
        id: card.waMessageId,
        ...(!card.senderFromMe && card.senderId?.includes("@") ? { participant: card.senderId } : {}),
      },
      emoji,
    );
  } catch (e) {
    // A reação é cortesia: o status no gestor já mudou.
    console.error("[sac] reação", e);
  }
}

export type DetalheSac = Awaited<ReturnType<typeof carregarDetalhe>>;

async function carregarDetalhe(cardId: string) {
  const card = await db.sacCard.findUnique({
    where: { id: cardId },
    include: {
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true } },
      comments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { id: "asc" } },
    },
  });
  if (!card) return null;

  // Respostas que os donos já deram para dúvidas da mesma categoria (e evento).
  const parecidas =
    card.categoria || card.evento
      ? await db.sacComment.findMany({
          where: {
            source: "whatsapp",
            cardId: { not: card.id },
            card: {
              status: { in: ["respondido_grupo", "resolvido"] },
              ...(card.categoria ? { categoria: card.categoria } : {}),
              ...(card.evento ? { evento: card.evento } : {}),
            },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { card: { select: { id: true, titulo: true, senderId: true } } },
        })
      : [];

  return {
    id: card.id,
    status: card.status as SacStatus,
    titulo: card.titulo,
    legendaOriginal: card.legendaOriginal,
    canal: card.canal,
    categoria: card.categoria,
    evento: card.evento,
    prioridade: card.prioridade,
    tagsDesconhecidas: card.tagsDesconhecidas,
    senderId: card.senderId,
    senderName: card.senderName,
    receivedAt: card.receivedAt.toISOString(),
    firstResponseAt: card.firstResponseAt?.toISOString() ?? null,
    resolvedAt: card.resolvedAt?.toISOString() ?? null,
    resolvedBy: card.resolvedBy,
    anexos: card.attachments.map((a) => a.id),
    comentarios: card.comments.map((c) => ({
      id: c.id,
      autor: c.authorName ?? c.authorId ?? "—",
      doRemetente: !!card.senderId && c.authorId === card.senderId,
      texto: c.text,
      fonte: c.source as "whatsapp" | "gestor",
      em: c.createdAt.toISOString(),
    })),
    eventos: card.events.map((e) => ({
      id: e.id,
      tipo: e.type,
      de: e.fromStatus,
      para: e.toStatus,
      via: e.via,
      autor: e.actorName ?? (e.actorId === "conta" ? "o número do SAC" : e.actorId),
      emoji: e.emoji,
      em: e.createdAt.toISOString(),
    })),
    parecidas: parecidas
      .filter((p) => p.authorId !== p.card.senderId)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        cardId: p.card.id,
        titulo: p.card.titulo,
        texto: p.text,
        autor: p.authorName ?? "—",
        em: p.createdAt.toISOString(),
      })),
  };
}

export async function detalheCardSac(cardId: string): Promise<Resultado<{ card: NonNullable<DetalheSac> }>> {
  try {
    await requireUser();
    const card = await carregarDetalhe(z.string().min(1).parse(cardId));
    if (!card) throw new Error("Card não encontrado.");
    return { ok: true, card };
  } catch (e) {
    return erro(e);
  }
}

const reclassificacao = z.object({
  cardId: z.string().min(1),
  titulo: z.string().trim().max(120).optional(),
  canal: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  evento: z.string().nullable().optional(),
  prioridade: z.string().nullable().optional(),
});

/** Corrige a classificação ou o título no detalhe do card. */
export async function reclassificarCardSac(input: z.infer<typeof reclassificacao>): Promise<Resultado> {
  try {
    const user = await requireUser();
    const { cardId, ...campos } = reclassificacao.parse(input);
    for (const tipo of ["canal", "categoria", "evento", "prioridade"] as const) {
      const slug = campos[tipo];
      if (!slug) continue;
      const tag = await db.sacTag.findUnique({ where: { slug } });
      if (!tag || tag.type !== tipo) throw new Error(`A tag #${slug} não é do tipo ${tipo}.`);
    }
    await db.$transaction([
      db.sacCard.update({ where: { id: cardId }, data: campos }),
      db.sacEvent.create({
        data: { cardId, type: "reclassificado", via: "gestor", actorId: user.id, actorName: user.name },
      }),
    ]);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

/** Nota interna no card (não vai para o WhatsApp). */
export async function notaCardSac(cardId: string, texto: string): Promise<Resultado> {
  try {
    const user = await requireUser();
    const d = z
      .object({ cardId: z.string().min(1), texto: z.string().trim().min(1, "Escreva a nota.").max(5000) })
      .parse({ cardId, texto });
    await db.sacComment.create({
      data: { cardId: d.cardId, authorId: user.id, authorName: user.name, text: d.texto, source: "gestor" },
    });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

export async function excluirNotaSac(comentarioId: string): Promise<Resultado> {
  try {
    const user = await requireUser();
    const nota = await db.sacComment.findUnique({ where: { id: comentarioId } });
    if (!nota || nota.source !== "gestor") throw new Error("Só notas do gestor podem ser apagadas aqui.");
    if (nota.authorId !== user.id && user.role !== "ADMIN") throw new Error("Só quem escreveu apaga a nota.");
    await db.sacComment.delete({ where: { id: nota.id } });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

/* -------------------------------------------------------------------------- */
/* tags                                                                        */
/* -------------------------------------------------------------------------- */

const tagSchema = z.object({
  slug: z
    .string()
    .transform((s) => slugify(s.replace(/^#/, "")))
    .pipe(z.string().regex(/^[\p{L}\p{N}_-]{1,40}$/u, "Use só letras, números, - ou _ (sem espaço).")),
  type: z.enum(["canal", "categoria", "evento", "prioridade"]),
  label: z.string().trim().min(1, "Dê um nome para a tag.").max(60),
  aliases: z.array(z.string()).max(20).default([]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  active: z.boolean().optional(),
});

const limparAliases = (aliases: string[], slug: string) =>
  [...new Set(aliases.map((a) => slugify(a.replace(/^#/, ""))).filter((a) => a && a !== slug))];

/**
 * Cadastra uma tag. Os cards que já tinham essa #palavra como desconhecida
 * passam a usá-la (se o campo daquele tipo ainda estiver vazio).
 */
export async function cadastrarTagSac(input: z.input<typeof tagSchema>): Promise<Resultado> {
  try {
    await requireUser();
    const d = tagSchema.parse(input);
    const aliases = limparAliases(d.aliases, d.slug);
    if (await db.sacTag.findUnique({ where: { slug: d.slug } })) throw new Error(`A tag #${d.slug} já existe.`);
    const ultima = await db.sacTag.findFirst({ where: { type: d.type }, orderBy: { sort: "desc" } });
    await db.sacTag.create({
      data: { slug: d.slug, type: d.type, label: d.label, aliases, color: d.color ?? null, sort: (ultima?.sort ?? 0) + 1 },
    });
    await aplicarTagNova(d.slug, aliases, d.type);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

async function aplicarTagNova(slug: string, aliases: string[], tipo: "canal" | "categoria" | "evento" | "prioridade") {
  const nomes = [slug, ...aliases];
  const cards = await db.sacCard.findMany({
    where: { tagsDesconhecidas: { hasSome: nomes } },
    select: { id: true, tagsDesconhecidas: true, canal: true, categoria: true, evento: true, prioridade: true },
  });
  for (const c of cards) {
    await db.sacCard.update({
      where: { id: c.id },
      data: {
        tagsDesconhecidas: c.tagsDesconhecidas.filter((t) => !nomes.includes(t)),
        ...(c[tipo] ? {} : { [tipo]: slug }),
      },
    });
  }
}

export async function salvarTagSac(input: z.input<typeof tagSchema>): Promise<Resultado> {
  try {
    await requireAdmin();
    const d = tagSchema.parse(input);
    const atual = await db.sacTag.findUnique({ where: { slug: d.slug } });
    if (!atual) throw new Error("Tag não encontrada.");
    await db.sacTag.update({
      where: { slug: d.slug },
      data: {
        label: d.label,
        aliases: limparAliases(d.aliases, d.slug),
        color: d.color ?? null,
        // O tipo não muda: deixaria, por exemplo, um evento no campo de canal.
        active: d.active ?? atual.active,
      },
    });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

export async function excluirTagSac(slug: string): Promise<Resultado> {
  try {
    await requireAdmin();
    await db.sacTag.delete({ where: { slug } }); // os cards ficam com o campo vazio
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

/* -------------------------------------------------------------------------- */
/* conexão com o WhatsApp                                                      */
/* -------------------------------------------------------------------------- */

async function urlDoWebhook(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/sac/webhook?token=${encodeURIComponent(token)}`;
}

export async function salvarConexaoSac(input: { url: string; chave: string; instancia: string }): Promise<Resultado> {
  try {
    await requireAdmin();
    const d = z
      .object({
        url: z
          .string()
          .trim()
          .url("Cole o endereço completo, começando com https://")
          .transform((u) => u.replace(/\/+$/, "").replace(/\/manager$/, "")),
        chave: z.string().trim().max(500),
        instancia: z
          .string()
          .trim()
          .regex(/^[\w-]{1,40}$/, "O nome da instância usa só letras, números, - ou _."),
      })
      .parse(input);
    await lerConfig();
    await db.sacConfig.update({
      where: { id: "sac" },
      data: {
        evolutionUrl: d.url,
        evolutionInstancia: d.instancia,
        ...(d.chave ? { evolutionKey: cifrar(d.chave) } : {}),
      },
    });
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

export type EstadoWhatsapp = { estado: EstadoConexao | "sem-config"; qr: string | null; aviso?: string };

/**
 * "Conectar WhatsApp": cria a instância se faltar, aplica os ajustes da spec
 * (grupos ligados, sem "sempre online", sem marcar como lida), aponta o
 * webhook para este gestor e devolve o QR code.
 */
export async function conectarWhatsappSac(): Promise<Resultado<EstadoWhatsapp>> {
  try {
    await requireAdmin();
    const config = await lerConfig();
    const c = credenciais(config);
    if (!c) return { ok: true, estado: "sem-config", qr: null };
    await prepararInstancia(c, await urlDoWebhook(config.webhookToken));
    const r = await qrCode(c);
    if (r.conectado) return { ok: true, estado: "open", qr: null };
    return {
      ok: true,
      estado: "connecting",
      qr: r.imagem,
      ...(r.imagem ? {} : { aviso: "A Evolution ainda não gerou o QR code. Tente de novo em alguns segundos." }),
    };
  } catch (e) {
    return erro(e);
  }
}

export async function estadoWhatsappSac(): Promise<Resultado<EstadoWhatsapp>> {
  try {
    await requireUser();
    const c = credenciais(await lerConfig());
    if (!c) return { ok: true, estado: "sem-config", qr: null };
    return { ok: true, estado: await estadoConexao(c), qr: null };
  } catch (e) {
    return erro(e);
  }
}

export async function desconectarWhatsappSac(): Promise<Resultado> {
  try {
    await requireAdmin();
    const c = credenciais(await lerConfig());
    if (!c) throw new Error("A Evolution não está configurada.");
    await desconectar(c);
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

export async function gruposWhatsappSac(): Promise<Resultado<{ grupos: { jid: string; nome: string; pessoas: number | null }[] }>> {
  try {
    await requireAdmin();
    const c = credenciais(await lerConfig());
    if (!c) throw new Error("Conecte o WhatsApp primeiro.");
    return { ok: true, grupos: await listarGrupos(c) };
  } catch (e) {
    return erro(e);
  }
}

/* -------------------------------------------------------------------------- */
/* regras                                                                      */
/* -------------------------------------------------------------------------- */

const regras = z.object({
  groupJid: z
    .string()
    .trim()
    .regex(/^[\d-]+@g\.us$/, "O ID do grupo termina em @g.us.")
    .nullable(),
  groupNome: z.string().trim().max(120).nullable(),
  senderMode: z.enum(["fromMe", "allowlist", "any"]),
  allowedSenders: z.array(z.string().trim().max(80)).max(50),
  albumWindowSeconds: z.number().int().min(0).max(600),
  slaAmareloHoras: z.number().int().min(1).max(240),
  slaVermelhoHoras: z.number().int().min(1).max(720),
  emojisResolvido: z.array(z.string().trim().min(1).max(16)).max(10),
  emojisArquivado: z.array(z.string().trim().min(1).max(16)).max(10),
  reagirAoResolver: z.boolean(),
  logPayloads: z.boolean(),
});

export async function salvarRegrasSac(input: z.input<typeof regras>): Promise<Resultado> {
  try {
    await requireAdmin();
    const d = regras.parse(input);
    if (d.slaVermelhoHoras <= d.slaAmareloHoras) throw new Error("O prazo vermelho precisa ser maior que o amarelo.");
    await lerConfig();
    await db.sacConfig.update({
      where: { id: "sac" },
      data: { ...d, allowedSenders: d.allowedSenders.filter(Boolean) },
    });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}

/* -------------------------------------------------------------------------- */
/* log do webhook                                                              */
/* -------------------------------------------------------------------------- */

/** Roda de novo uma mensagem que deu erro (a imagem é baixada outra vez da Evolution). */
export async function reprocessarLogSac(id: number): Promise<Resultado<{ resultado: string }>> {
  try {
    await requireAdmin();
    const log = await db.sacWebhookLog.findUnique({ where: { id } });
    if (!log) throw new Error("Registro não encontrado.");
    const resultado = await processarWebhook(log.payload, undefined, log.id);
    refreshAll();
    return { ok: true, resultado: resultado ?? "" };
  } catch (e) {
    return erro(e);
  }
}

export async function limparLogsSac(): Promise<Resultado> {
  try {
    await requireAdmin();
    await db.sacWebhookLog.deleteMany({});
    refreshAll();
    return { ok: true };
  } catch (e) {
    return erro(e);
  }
}
