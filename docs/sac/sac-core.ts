// =============================================================
// sac-core.ts — lógica pura do módulo SAC (sem banco, sem HTTP)
// 1) normalizeEvolutionEvent: transforma o webhook da Evolution API
//    num evento simples (image | reaction | reply | revoke | ignore)
// 2) parseCaption: lê a legenda do print (#canal #categoria #evento título)
// =============================================================

export type SacTagType = 'canal' | 'categoria' | 'evento' | 'prioridade';

export interface SacTag {
  slug: string;          // ex: "ig"
  type: SacTagType;
  label: string;         // ex: "Instagram"
  aliases: string[];     // ex: ["insta", "instagram"]
}

export type NormalizedEvent =
  | {
      kind: 'image';
      waMessageId: string;
      groupJid: string;
      senderId: string | null;
      senderName: string | null;
      fromMe: boolean;
      caption: string;
      mimetype: string;
      base64: string | null;
      timestamp: number; // segundos (unix)
    }
  | {
      kind: 'reaction';
      waMessageId: string;
      groupJid: string;
      senderId: string | null;
      senderName: string | null;
      fromMe: boolean;
      targetMessageId: string;
      emoji: string; // "" = reação removida
      timestamp: number;
    }
  | {
      kind: 'reply';
      waMessageId: string;
      groupJid: string;
      senderId: string | null;
      senderName: string | null;
      fromMe: boolean;
      quotedMessageId: string;
      text: string;
      timestamp: number;
    }
  | {
      kind: 'revoke';
      waMessageId: string;
      groupJid: string;
      targetMessageId: string;
      timestamp: number;
    }
  | { kind: 'ignore'; reason: string };

// ---------- helpers ----------

/** Tira os "envelopes" que o WhatsApp coloca em volta da mensagem real. */
function unwrapMessage(message: any): any {
  let m = message ?? {};
  for (let i = 0; i < 5; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.viewOnceMessageV2Extension?.message ??
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

/**
 * Em grupos o remetente pode vir como telefone (@s.whatsapp.net) ou como
 * LID (@lid). Preferimos o telefone quando existir.
 */
function resolveSender(data: any): string | null {
  const key = data?.key ?? {};
  const candidates = [
    key.participantAlt,
    key.participantPn,
    data?.participantAlt,
    key.participant,
    data?.participant,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  const phone = candidates.find((c) => c.endsWith('@s.whatsapp.net'));
  return stripDevice(phone ?? candidates[0] ?? null);
}

/** "5534999999999:12@s.whatsapp.net" -> "5534999999999@s.whatsapp.net" */
function stripDevice(jid: string | null): string | null {
  if (!jid) return null;
  return jid.replace(/:\d+@/, '@');
}

function toUnixSeconds(ts: any): number {
  const n = typeof ts === 'object' && ts !== null && 'low' in ts ? ts.low : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return Math.floor(Date.now() / 1000);
  return n > 1e12 ? Math.floor(n / 1000) : n; // aceita ms ou s
}

function findContextInfo(data: any, m: any): any {
  return (
    data?.contextInfo ??
    m?.extendedTextMessage?.contextInfo ??
    m?.imageMessage?.contextInfo ??
    m?.conversation?.contextInfo ??
    null
  );
}

// ---------- 1) normalizador ----------

export function normalizeEvolutionEvent(payload: any): NormalizedEvent {
  const event = String(payload?.event ?? '').toLowerCase().replace(/_/g, '.');
  if (event !== 'messages.upsert') {
    return { kind: 'ignore', reason: `evento ${payload?.event ?? 'desconhecido'}` };
  }

  // Algumas versões mandam data como array
  const data = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const key = data?.key ?? {};
  const groupJid: string = key.remoteJid ?? '';
  if (!groupJid.endsWith('@g.us')) return { kind: 'ignore', reason: 'não é grupo' };

  const waMessageId: string = key.id;
  if (!waMessageId) return { kind: 'ignore', reason: 'sem id' };

  const m = unwrapMessage(data.message);
  const base = {
    waMessageId,
    groupJid,
    senderId: resolveSender(data),
    senderName: data.pushName ?? null,
    fromMe: Boolean(key.fromMe),
    timestamp: toUnixSeconds(data.messageTimestamp),
  };

  // Mensagem apagada para todos
  const proto = m.protocolMessage;
  if (proto && (proto.type === 'REVOKE' || proto.type === 0) && proto.key?.id) {
    return {
      kind: 'revoke',
      waMessageId,
      groupJid,
      targetMessageId: proto.key.id,
      timestamp: base.timestamp,
    };
  }

  // Reação
  if (m.reactionMessage?.key?.id) {
    return {
      kind: 'reaction',
      ...base,
      targetMessageId: m.reactionMessage.key.id,
      emoji: m.reactionMessage.text ?? '',
    };
  }

  // Imagem (print)
  const img = m.imageMessage;
  const docImg =
    m.documentMessage && String(m.documentMessage.mimetype ?? '').startsWith('image/')
      ? m.documentMessage
      : null;
  if (img || docImg) {
    const media = img ?? docImg;
    return {
      kind: 'image',
      ...base,
      caption: (media.caption ?? '').trim(),
      mimetype: media.mimetype ?? 'image/jpeg',
      // com "Webhook Base64" ligado, a Evolution manda a imagem aqui
      base64: data.message?.base64 ?? m.base64 ?? null,
    };
  }

  // Texto respondendo (citando) outra mensagem
  const text: string = m.extendedTextMessage?.text ?? m.conversation ?? '';
  const ctx = findContextInfo(data, m);
  if (text && ctx?.stanzaId) {
    return { kind: 'reply', ...base, quotedMessageId: ctx.stanzaId, text: text.trim() };
  }

  return { kind: 'ignore', reason: `tipo ${data.messageType ?? 'desconhecido'} sem ação` };
}

// ---------- 2) parser da legenda ----------

export interface ParsedCaption {
  canal: string | null;
  categoria: string | null;
  evento: string | null;
  prioridade: string | null;
  titulo: string;
  tagsDesconhecidas: string[];
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function parseCaption(caption: string, dictionary: SacTag[]): ParsedCaption {
  const index = new Map<string, SacTag>();
  for (const tag of dictionary) {
    index.set(slugify(tag.slug), tag);
    for (const a of tag.aliases) index.set(slugify(a), tag);
  }

  const result: ParsedCaption = {
    canal: null,
    categoria: null,
    evento: null,
    prioridade: null,
    titulo: '',
    tagsDesconhecidas: [],
  };

  const tagRegex = /#([\p{L}\p{N}_-]+)/gu;
  for (const match of caption.matchAll(tagRegex)) {
    const raw = slugify(match[1]);
    const tag = index.get(raw);
    if (!tag) {
      if (!result.tagsDesconhecidas.includes(raw)) result.tagsDesconhecidas.push(raw);
      continue;
    }
    if (result[tag.type] === null) result[tag.type] = tag.slug; // a 1ª de cada tipo vence
  }

  result.titulo = caption
    .replace(tagRegex, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return result;
}

// ---------- 3) regras de status ----------

/**
 * novo              -> print chegou, ninguém respondeu ainda
 * respondido_grupo  -> os donos responderam no grupo (falta repassar ao cliente)
 * resolvido         -> cliente já recebeu a resposta
 * arquivado         -> descartado / print apagado (fica fora do quadro)
 */
export type SacStatus = 'novo' | 'respondido_grupo' | 'resolvido' | 'arquivado';

/** Normaliza emoji: tira tom de pele e o seletor de variação (U+FE0F). */
export function normalizeEmoji(e: string): string {
  return e.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/️/g, '');
}

const RAW_EMOJI_TO_STATUS: Record<string, SacStatus> = {
  '✅': 'resolvido',
  '✔️': 'resolvido',
  '☑️': 'resolvido',
  '❌': 'arquivado',
};

export const EMOJI_TO_STATUS: Record<string, SacStatus> = Object.fromEntries(
  Object.entries(RAW_EMOJI_TO_STATUS).map(([k, v]) => [normalizeEmoji(k), v]),
);

export const REPLY_KEYWORDS_RESOLVED = ['respondido', 'resolvido', 'ok', 'feito', 'pronto'];

export function statusFromReaction(emoji: string): SacStatus | null {
  if (!emoji) return null; // reação removida é tratada no handler
  return EMOJI_TO_STATUS[normalizeEmoji(emoji)] ?? null;
}

/**
 * Resposta curta tipo "ok", "respondido!", "feito ✅" = comando de status.
 * Resposta longa ("Ok, pode falar que a meia vale até...") = é a RESPOSTA
 * dos donos, não um comando — vira comentário no card.
 */
export function statusFromReplyText(text: string): SacStatus | null {
  const words = slugify(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  return REPLY_KEYWORDS_RESOLVED.includes(words[0]) ? 'resolvido' : null;
}
