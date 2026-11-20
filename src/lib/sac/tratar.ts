import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteFile, putFile } from "@/lib/storage";
import {
  emojiMap,
  normalizeEvolutionEvent,
  parseCaption,
  senderAllowed,
  statusFromReaction,
  statusFromReplyText,
  stripMedia,
  type NormalizedEvent,
  type SacStatus,
  type SenderMode,
} from "./core";
import { credenciais, lerConfig, tagsAtivas, type ConfigSac } from "./config";
import { baixarMidia } from "./evolution";
import { acharCardPorMensagem, mudarStatus, topoDaColuna } from "./cards";

/* ============================================================================
   Tudo o que chega em /api/sac/webhook passa por aqui (seção 6 da spec).
   Devolve uma frase curta do que foi feito, gravada no log do webhook.
   ========================================================================== */

type Evento<K extends NormalizedEvent["kind"]> = Extract<NormalizedEvent, { kind: K }>;

/** Quem mandou. Mensagem do próprio número pode vir sem participante: vira "conta". */
const quem = (ev: { senderId: string | null; fromMe: boolean }) =>
  ev.senderId ?? (ev.fromMe ? "conta" : null);

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

/* eslint-disable @typescript-eslint/no-explicit-any -- payload da Evolution */
export async function processarWebhook(payload: any, config?: ConfigSac, logExistente?: number) {
  config ??= await lerConfig();
  const evento = String(payload?.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  const remoteJid: string = data?.key?.remoteJid ?? "";
  const ehGrupo = remoteJid.endsWith("@g.us");

  // Conversa de cliente com o número do SAC nunca é gravada nem processada.
  if (evento.startsWith("messages.") && !ehGrupo) return "ignorado: não é grupo";

  if (ehGrupo) await registrarVisto(remoteJid, "grupo", null);

  // Log só do grupo escolhido e dos avisos de conexão — nunca de outros grupos.
  const doGrupo = !!config.groupJid && remoteJid === config.groupJid;
  let logId = logExistente ?? null;
  if (logId === null && config.logPayloads && (doGrupo || !evento.startsWith("messages."))) {
    const log = await db.sacWebhookLog.create({
      data: { event: payload?.event ?? null, payload: stripMedia(payload) as Prisma.InputJsonValue },
    });
    logId = log.id;
  }
  const concluir = async (resultado: string) => {
    if (logId !== null) {
      await db.sacWebhookLog.update({ where: { id: logId }, data: { result: resultado.slice(0, 500) } });
    }
    return resultado;
  };

  try {
    if (evento === "connection.update") return await concluir(`conexão: ${data?.state ?? "?"}`);

    const ev = normalizeEvolutionEvent(payload);
    if (ev.kind === "ignore") return await concluir(`ignorado: ${ev.reason}`);
    if (!config.groupJid) return await concluir("ignorado: grupo do SAC ainda não escolhido");
    if (ev.groupJid !== config.groupJid) return await concluir("ignorado: outro grupo");

    if (ev.kind !== "revoke") {
      for (const id of new Set([quem(ev), ...ev.senderAliases].filter((v): v is string => !!v))) {
        await registrarVisto(id, "remetente", ev.senderName);
      }
    }

    switch (ev.kind) {
      case "image":
        return await concluir(await tratarImagem(ev, config));
      case "reaction":
        return await concluir(await tratarReacao(ev, config));
      case "reply":
        return await concluir(await tratarResposta(ev));
      case "revoke":
        return await concluir(await tratarApagada(ev));
    }
  } catch (e) {
    console.error("[sac] webhook", e);
    return concluir(`erro: ${e instanceof Error ? e.message : String(e)}`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function registrarVisto(jid: string, tipo: "grupo" | "remetente", nome: string | null) {
  await db.sacVisto.upsert({
    where: { jid },
    create: { jid, tipo, nome },
    update: { vistoEm: new Date(), total: { increment: 1 }, ...(nome ? { nome } : {}) },
  });
}

/* -------------------------------------------------------------------------- */
/* print                                                                       */
/* -------------------------------------------------------------------------- */

async function tratarImagem(ev: Evento<"image">, config: ConfigSac) {
  if (!senderAllowed(ev, config.senderMode as SenderMode, config.allowedSenders)) {
    return `ignorado: remetente não permitido (${quem(ev) ?? "sem id"})`;
  }
  if (await db.sacAttachment.findUnique({ where: { waMessageId: ev.waMessageId } })) {
    return "ignorado: print já recebido";
  }

  // Baixa na hora: a URL de mídia do WhatsApp é cifrada e expira.
  // No reprocessamento o payload vem do log, sem a imagem ("[removido]").
  let base64 = ev.base64 && !ev.base64.startsWith("[") ? ev.base64 : null;
  let mimetype = ev.mimetype;
  if (!base64) {
    const c = credenciais(config);
    if (!c) throw new Error("o print veio sem a imagem e a Evolution não está configurada");
    const midia = await baixarMidia(c, ev.waMessageId);
    if (!midia) throw new Error("a Evolution não devolveu a imagem do print");
    base64 = midia.base64;
    mimetype = midia.mimetype ?? mimetype;
  }
  mimetype = mimetype.split(";")[0].trim() || "image/jpeg";
  const bytes = Buffer.from(base64.replace(/^data:[^,]*,/, ""), "base64");
  const em = new Date(ev.timestamp * 1000);
  const pasta = em.toISOString().slice(0, 7).replace("-", "/");
  const storageKey = await putFile(
    `sac/${pasta}/${ev.waMessageId}.${EXT[mimetype] ?? "jpg"}`,
    bytes,
    mimetype,
  );

  const lido = parseCaption(ev.caption, await tagsAtivas());
  const classificacao = {
    canal: lido.canal,
    categoria: lido.categoria,
    evento: lido.evento,
    prioridade: lido.prioridade,
    titulo: lido.titulo,
    tagsDesconhecidas: lido.tagsDesconhecidas,
  };
  const remetente = quem(ev);

  try {
    return await db.$transaction(
      async (tx) => {
        // Um remetente por vez: as fotos de um álbum chegam juntas, em webhooks paralelos.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`sac:${remetente ?? ev.waMessageId}`}))`;

        if (await tx.sacAttachment.findUnique({ where: { waMessageId: ev.waMessageId } })) {
          return "ignorado: print já recebido";
        }

        // Álbum (seção 3.3): foto do mesmo remetente dentro da janela entra no card dele.
        const janela = config.albumWindowSeconds * 1000;
        const recente =
          remetente && janela > 0
            ? await tx.sacCard.findFirst({
                where: {
                  senderId: remetente,
                  groupJid: ev.groupJid,
                  receivedAt: { gte: new Date(em.getTime() - janela), lte: new Date(em.getTime() + janela) },
                },
                orderBy: { receivedAt: "desc" },
              })
            : null;
        const anexar = (cardId: string) =>
          tx.sacAttachment.create({
            data: { cardId, waMessageId: ev.waMessageId, storageKey, mimetype, createdAt: em },
          });
        const base = {
          actorId: remetente,
          actorName: ev.senderName,
          waMessageId: ev.waMessageId,
          createdAt: em,
        };

        if (recente && !ev.caption) {
          await anexar(recente.id);
          await tx.sacEvent.create({ data: { ...base, cardId: recente.id, type: "anexo", via: "sistema" } });
          return "anexo do álbum";
        }
        if (recente && ev.caption && !recente.legendaOriginal) {
          // A foto com legenda chegou depois das sem legenda: classifica o card.
          await tx.sacCard.update({
            where: { id: recente.id },
            data: { ...classificacao, legendaOriginal: ev.caption },
          });
          await anexar(recente.id);
          await tx.sacEvent.create({
            data: { ...base, cardId: recente.id, type: "reclassificado", via: "sistema" },
          });
          return "álbum: legenda aplicada ao card";
        }

        const card = await tx.sacCard.create({
          data: {
            waMessageId: ev.waMessageId,
            groupJid: ev.groupJid,
            status: "novo",
            ...classificacao,
            legendaOriginal: ev.caption,
            senderId: remetente,
            senderName: ev.senderName,
            senderFromMe: ev.fromMe,
            ordem: await topoDaColuna("novo", tx),
            receivedAt: em,
          },
        });
        await anexar(card.id);
        await tx.sacEvent.create({
          data: { ...base, cardId: card.id, type: "criado", via: "sistema", toStatus: "novo" },
        });
        return "card criado";
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    // Webhook repetido em paralelo: o outro já gravou.
    if ((e as { code?: string }).code === "P2002") return "ignorado: print já recebido";
    throw e;
  }
}

/* -------------------------------------------------------------------------- */
/* reação                                                                      */
/* -------------------------------------------------------------------------- */

async function tratarReacao(ev: Evento<"reaction">, config: ConfigSac) {
  const card = await acharCardPorMensagem(ev.targetMessageId);
  if (!card) return "ignorado: reação fora de card";
  const autor = quem(ev);
  const novo = statusFromReaction(ev.emoji, emojiMap(config.emojisResolvido, config.emojisArquivado));
  const em = new Date(ev.timestamp * 1000);

  if (!novo) {
    // Reação tirada (ou trocada por outra sem ação): se foi ela que mudou o
    // status por último, o card volta para onde estava.
    const ultima = await db.sacEvent.findFirst({
      where: { cardId: card.id, type: "status" },
      orderBy: { id: "desc" },
    });
    if (
      ultima?.via === "reacao" &&
      ultima.emoji &&
      ultima.actorId === autor &&
      ultima.toStatus === card.status &&
      ultima.fromStatus
    ) {
      await mudarStatus(card, ultima.fromStatus as SacStatus, {
        via: "reacao",
        actorId: autor,
        actorName: ev.senderName,
        emoji: "",
        waMessageId: ev.waMessageId,
        em,
      });
      return `reação desfeita: voltou para ${ultima.fromStatus}`;
    }
    return ev.emoji ? `ignorado: ${ev.emoji} não muda status` : "ignorado: reação removida";
  }

  if (novo === card.status) return `ignorado: card já está em ${novo}`;
  await mudarStatus(card, novo, {
    via: "reacao",
    actorId: autor,
    actorName: ev.senderName,
    emoji: ev.emoji,
    waMessageId: ev.waMessageId,
    em,
  });
  return `status: ${novo} (${ev.emoji})`;
}

/* -------------------------------------------------------------------------- */
/* resposta citando o print                                                    */
/* -------------------------------------------------------------------------- */

async function tratarResposta(ev: Evento<"reply">) {
  const card = await acharCardPorMensagem(ev.quotedMessageId);
  if (!card) return "ignorado: resposta fora de card";
  const [comentario, evento] = await Promise.all([
    db.sacComment.findUnique({ where: { waMessageId: ev.waMessageId } }),
    db.sacEvent.findFirst({ where: { waMessageId: ev.waMessageId } }),
  ]);
  if (comentario || evento) return "ignorado: resposta já recebida";

  const autor = quem(ev);
  const em = new Date(ev.timestamp * 1000);
  const base = { actorId: autor, actorName: ev.senderName, waMessageId: ev.waMessageId, em };

  // "ok", "respondido!", "feito ✅": comando, não resposta.
  const comando = statusFromReplyText(ev.text);
  if (comando) {
    if (comando === card.status) return `ignorado: card já está em ${comando}`;
    await mudarStatus(card, comando, { ...base, via: "resposta" });
    return `status: ${comando} (resposta "${ev.text}")`;
  }

  const outraPessoa = autor !== card.senderId;
  await db.$transaction(async (tx) => {
    await tx.sacComment.create({
      data: {
        cardId: card.id,
        waMessageId: ev.waMessageId,
        authorId: autor,
        authorName: ev.senderName,
        text: ev.text,
        source: "whatsapp",
        createdAt: em,
      },
    });
    await tx.sacEvent.create({
      data: {
        cardId: card.id,
        type: "comentario",
        via: "resposta",
        actorId: autor,
        actorName: ev.senderName,
        waMessageId: ev.waMessageId,
        createdAt: em,
      },
    });
    if (outraPessoa && !card.firstResponseAt) {
      await tx.sacCard.update({ where: { id: card.id }, data: { firstResponseAt: em } });
    }
    if (outraPessoa && card.status === "novo") {
      await mudarStatus(card, "respondido_grupo", { ...base, via: "resposta" }, tx);
    }
  });
  return outraPessoa && card.status === "novo"
    ? "comentário + status: respondido_grupo"
    : "comentário";
}

/* -------------------------------------------------------------------------- */
/* mensagem apagada para todos                                                 */
/* -------------------------------------------------------------------------- */

async function tratarApagada(ev: Evento<"revoke">) {
  const em = new Date(ev.timestamp * 1000);
  const card = await db.sacCard.findUnique({ where: { waMessageId: ev.targetMessageId } });
  if (card) {
    if (card.status === "arquivado") return "ignorado: card já arquivado";
    await mudarStatus(card, "arquivado", { via: "sistema", waMessageId: ev.waMessageId, em });
    return "print apagado: card arquivado";
  }

  const anexo = await db.sacAttachment.findUnique({ where: { waMessageId: ev.targetMessageId } });
  if (anexo) {
    await db.$transaction([
      db.sacAttachment.delete({ where: { id: anexo.id } }),
      db.sacEvent.create({
        data: {
          cardId: anexo.cardId,
          type: "anexo_removido",
          via: "sistema",
          waMessageId: ev.waMessageId,
          createdAt: em,
        },
      }),
    ]);
    await deleteFile(anexo.storageKey);
    return "foto apagada: anexo removido";
  }

  const comentario = await db.sacComment.findUnique({ where: { waMessageId: ev.targetMessageId } });
  if (comentario) {
    await db.sacComment.delete({ where: { id: comentario.id } });
    return "resposta apagada: comentário removido";
  }
  return "ignorado: mensagem apagada fora de card";
}
