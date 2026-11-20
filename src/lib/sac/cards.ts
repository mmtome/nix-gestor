import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { orderTop, type SacStatus } from "./core";

type Tx = Prisma.TransactionClient;

export const STATUS: SacStatus[] = ["novo", "respondido_grupo", "resolvido", "arquivado"];

/** O card de uma mensagem: o print principal, um anexo ou um comentário dele. */
export async function acharCardPorMensagem(waMessageId: string, tx: Tx = db) {
  const card = await tx.sacCard.findUnique({ where: { waMessageId } });
  if (card) return card;
  const anexo = await tx.sacAttachment.findUnique({
    where: { waMessageId },
    select: { card: true },
  });
  if (anexo) return anexo.card;
  const comentario = await tx.sacComment.findUnique({
    where: { waMessageId },
    select: { card: true },
  });
  return comentario?.card ?? null;
}

/** Chave para o topo de uma coluna. */
export async function topoDaColuna(status: string, tx: Tx = db, ignorar?: string) {
  const primeiro = await tx.sacCard.findFirst({
    where: { status, ...(ignorar ? { id: { not: ignorar } } : {}) },
    orderBy: { ordem: "asc" },
    select: { ordem: true },
  });
  return orderTop(primeiro?.ordem ?? null);
}

export type Autor = {
  via: "reacao" | "resposta" | "gestor" | "sistema";
  actorId?: string | null;
  actorName?: string | null;
  emoji?: string | null;
  waMessageId?: string | null;
  em?: Date;
};

/**
 * Troca o status, registra no histórico e leva o card para o topo da nova
 * coluna (ou para `ordem`, quando veio de um arraste no gestor).
 */
export async function mudarStatus(
  card: { id: string; status: string },
  para: SacStatus,
  autor: Autor,
  tx: Tx = db,
  ordem?: string,
) {
  const em = autor.em ?? new Date();
  await tx.sacCard.update({
    where: { id: card.id },
    data: {
      status: para,
      ordem: ordem ?? (await topoDaColuna(para, tx, card.id)),
      ...(para === "resolvido"
        ? { resolvedAt: em, resolvedBy: autor.actorName ?? autor.actorId ?? null }
        : card.status === "resolvido"
          ? { resolvedAt: null, resolvedBy: null }
          : {}),
    },
  });
  await tx.sacEvent.create({
    data: {
      cardId: card.id,
      type: "status",
      fromStatus: card.status,
      toStatus: para,
      via: autor.via,
      actorId: autor.actorId ?? null,
      actorName: autor.actorName ?? null,
      emoji: autor.emoji ?? null,
      waMessageId: autor.waMessageId ?? null,
      createdAt: em,
    },
  });
}
