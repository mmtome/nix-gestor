/* eslint-disable @typescript-eslint/no-explicit-any -- payloads de teste */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  normalizeEvolutionEvent,
  parseCaption,
  statusFromReaction,
  statusFromReplyText,
  emojiMap,
  senderAllowed,
  stripMedia,
  orderBetween,
  orderTop,
  type SacTag,
} from './core.ts';

const GROUP = '120363000000000000@g.us';

const TAGS: SacTag[] = [
  { slug: 'ig', type: 'canal', label: 'Instagram', aliases: ['insta', 'instagram'] },
  { slug: 'wpp', type: 'canal', label: 'WhatsApp', aliases: ['zap', 'whatsapp'] },
  { slug: 'ingresso', type: 'categoria', label: 'Ingresso', aliases: ['ingressos'] },
  { slug: 'meia', type: 'categoria', label: 'Meia-entrada', aliases: ['meiaentrada'] },
  { slug: 'local', type: 'categoria', label: 'Local / acesso', aliases: [] },
  { slug: 'urgente', type: 'prioridade', label: 'Urgente', aliases: ['urg'] },
];

const imagePayload = {
  event: 'messages.upsert',
  instance: 'sac',
  data: {
    key: { remoteJid: GROUP, fromMe: true, id: 'IMG1', participant: '5534999990000:12@s.whatsapp.net' },
    pushName: 'Matheus',
    message: {
      imageMessage: { mimetype: 'image/jpeg', caption: '#IG #Ingressos Dúvida sobre lote 2 #xyz' },
      base64: 'AAAA',
    },
    messageType: 'imageMessage',
    messageTimestamp: 1763592000,
  },
};

test('imagem com legenda vira evento image', () => {
  const e = normalizeEvolutionEvent(imagePayload);
  assert.equal(e.kind, 'image');
  if (e.kind !== 'image') return;
  assert.equal(e.waMessageId, 'IMG1');
  assert.equal(e.senderId, '5534999990000@s.whatsapp.net');
  assert.equal(e.base64, 'AAAA');
  assert.equal(e.caption, '#IG #Ingressos Dúvida sobre lote 2 #xyz');
});

test('evento com nome MESSAGES_UPSERT e data em array também funciona', () => {
  const e = normalizeEvolutionEvent({ ...imagePayload, event: 'MESSAGES_UPSERT', data: [imagePayload.data] });
  assert.equal(e.kind, 'image');
});

test('imagem dentro de ephemeralMessage é desembrulhada', () => {
  const p = structuredClone(imagePayload) as any;
  p.data.message = { ephemeralMessage: { message: { imageMessage: { caption: '#wpp oi' } } } };
  const e = normalizeEvolutionEvent(p);
  assert.equal(e.kind, 'image');
});

test('remetente @lid usa participantAlt quando existir', () => {
  const p = structuredClone(imagePayload) as any;
  p.data.key.participant = '99887766@lid';
  p.data.key.participantAlt = '5534911112222@s.whatsapp.net';
  const e = normalizeEvolutionEvent(p);
  assert.equal(e.kind === 'image' && e.senderId, '5534911112222@s.whatsapp.net');
});

test('remetente só @lid é mantido como @lid', () => {
  const p = structuredClone(imagePayload) as any;
  p.data.key.participant = '99887766@lid';
  const e = normalizeEvolutionEvent(p);
  assert.equal(e.kind === 'image' && e.senderId, '99887766@lid');
});

test('mensagem fora de grupo é ignorada', () => {
  const p = structuredClone(imagePayload) as any;
  p.data.key.remoteJid = '5534999990000@s.whatsapp.net';
  assert.equal(normalizeEvolutionEvent(p).kind, 'ignore');
});

test('reação ✅ aponta para a mensagem original', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: {
      key: { remoteJid: GROUP, fromMe: false, id: 'R1', participant: '5534988887777@s.whatsapp.net' },
      pushName: 'Dono',
      message: { reactionMessage: { key: { remoteJid: GROUP, fromMe: true, id: 'IMG1' }, text: '✅' } },
      messageType: 'reactionMessage',
      messageTimestamp: 1763592100,
    },
  });
  assert.equal(e.kind, 'reaction');
  if (e.kind !== 'reaction') return;
  assert.equal(e.targetMessageId, 'IMG1');
  assert.equal(statusFromReaction(e.emoji), 'resolvido');
});

test('reação removida tem emoji vazio', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: {
      key: { remoteJid: GROUP, fromMe: false, id: 'R2' },
      message: { reactionMessage: { key: { id: 'IMG1' }, text: '' } },
    },
  });
  assert.equal(e.kind === 'reaction' && e.emoji, '');
  assert.equal(statusFromReaction(''), null);
});

test('variações do emoji: ✔ sem FE0F e com tom de pele', () => {
  assert.equal(statusFromReaction('✔'), 'resolvido');
  assert.equal(statusFromReaction('✔️'), 'resolvido');
  assert.equal(statusFromReaction('❤️'), null);
});

test('resposta citando o print (contextInfo dentro de extendedTextMessage)', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: {
      key: { remoteJid: GROUP, fromMe: false, id: 'T1', participant: '5534988887777@s.whatsapp.net' },
      message: {
        extendedTextMessage: {
          text: 'Pode falar que a meia vale até o 2º lote',
          contextInfo: { stanzaId: 'IMG1' },
        },
      },
    },
  });
  assert.equal(e.kind, 'reply');
  if (e.kind !== 'reply') return;
  assert.equal(e.quotedMessageId, 'IMG1');
  assert.equal(statusFromReplyText(e.text), null); // resposta longa = comentário
});

test('resposta citando o print (contextInfo no data, formato Evolution v2)', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: {
      key: { remoteJid: GROUP, fromMe: true, id: 'T2' },
      message: { conversation: 'Respondido!' },
      contextInfo: { stanzaId: 'IMG1' },
    },
  });
  assert.equal(e.kind, 'reply');
  assert.equal(e.kind === 'reply' && statusFromReplyText(e.text), 'resolvido');
});

test('comandos curtos de resposta', () => {
  assert.equal(statusFromReplyText('ok'), 'resolvido');
  assert.equal(statusFromReplyText('Feito ✅'), 'resolvido');
  assert.equal(statusFromReplyText('Ok, pode falar que a meia vale até o 2º lote'), null);
  assert.equal(statusFromReplyText('quem vai ver isso?'), null);
});

test('mensagem apagada vira revoke', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: {
      key: { remoteJid: GROUP, fromMe: true, id: 'D1' },
      message: { protocolMessage: { type: 'REVOKE', key: { id: 'IMG1' } } },
    },
  });
  assert.equal(e.kind === 'revoke' && e.targetMessageId, 'IMG1');
});

test('texto solto no grupo é ignorado', () => {
  const e = normalizeEvolutionEvent({
    event: 'messages.upsert',
    data: { key: { remoteJid: GROUP, id: 'X' }, message: { conversation: 'bom dia' } },
  });
  assert.equal(e.kind, 'ignore');
});

test('outros eventos são ignorados', () => {
  assert.equal(normalizeEvolutionEvent({ event: 'connection.update', data: {} }).kind, 'ignore');
});

test('parser: tags, aliases, acentos, maiúsculas e tag desconhecida', () => {
  const r = parseCaption('#IG #Ingressos Dúvida sobre lote 2 #xyz', TAGS);
  assert.deepEqual(r, {
    canal: 'ig',
    categoria: 'ingresso',
    evento: null,
    prioridade: null,
    titulo: 'Dúvida sobre lote 2',
    tagsDesconhecidas: ['xyz'],
  });
});

test('parser: ordem livre e primeira tag de cada tipo vence', () => {
  const r = parseCaption('cliente perguntando #meia #insta #local #urg', TAGS);
  assert.equal(r.canal, 'ig');
  assert.equal(r.categoria, 'meia');
  assert.equal(r.prioridade, 'urgente');
  assert.equal(r.titulo, 'cliente perguntando');
});

test('parser: legenda vazia', () => {
  const r = parseCaption('', TAGS);
  assert.equal(r.canal, null);
  assert.equal(r.titulo, '');
});

// ---------- adicionados no gestor ----------

test('mapa de emojis vindo da configuração', () => {
  const map = emojiMap(['👌'], ['🗑️']);
  assert.equal(statusFromReaction('👌', map), 'resolvido');
  assert.equal(statusFromReaction('🗑', map), 'arquivado');
  assert.equal(statusFromReaction('✅', map), null);
});

test('remetente: modos fromMe, any e allowlist (telefone, só número e @lid)', () => {
  const p = structuredClone(imagePayload) as any;
  p.data.key.fromMe = false;
  p.data.key.participant = '99887766@lid';
  p.data.key.participantAlt = '5534911112222@s.whatsapp.net';
  const e = normalizeEvolutionEvent(p);
  assert.equal(e.kind, 'image');
  if (e.kind !== 'image') return;
  assert.deepEqual(e.senderAliases, ['5534911112222@s.whatsapp.net', '99887766@lid']);
  assert.equal(senderAllowed(e, 'fromMe', []), false);
  assert.equal(senderAllowed(e, 'any', []), true);
  assert.equal(senderAllowed(e, 'allowlist', ['5534911112222@s.whatsapp.net']), true);
  assert.equal(senderAllowed(e, 'allowlist', ['(34) 91111-2222']), true);
  assert.equal(senderAllowed(e, 'allowlist', ['99887766@lid']), true);
  assert.equal(senderAllowed(e, 'allowlist', ['5534900000000']), false);
});

test('log sem imagem: base64 e miniatura saem', () => {
  const limpo = stripMedia(imagePayload);
  assert.equal(limpo.data.message.base64, '[removido]');
  assert.equal(limpo.data.message.imageMessage.caption, '#IG #Ingressos Dúvida sobre lote 2 #xyz');
  assert.equal(imagePayload.data.message.base64, 'AAAA'); // o original não muda
});

test('ordem: 500 cards seguidos no topo, arrastes no meio e no fim', () => {
  let t = Date.UTC(2026, 10, 20);
  let topo = orderTop(null, t);
  let fim = topo;
  for (let i = 0; i < 500; i++) {
    t += 1000;
    const novo = orderTop(topo, t);
    assert.ok(novo < topo && novo.length === 9 && !novo.endsWith('0'));
    topo = novo;
  }
  for (let i = 0; i < 100; i++) {
    const novo = orderBetween(fim, null);
    assert.ok(novo > fim);
    fim = novo;
  }
  const meio = orderBetween(topo, fim);
  assert.ok(topo < meio && meio < fim);
  // arrastado para o topo e logo outro print novo: o novo continua em cima
  const arrastado = orderTop(topo, t + 1000);
  assert.ok(arrastado < topo);
  assert.ok(orderTop(arrastado, t + 2000) < arrastado);
  // mesmo milissegundo: cai no meio-termo, sem travar
  assert.ok(orderTop(arrastado, t + 1000) < arrastado);
});
