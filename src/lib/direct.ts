import type { Contagem } from "./relatorio";

/* ============================================================================
   Direct — as contas sobre o arquivo de "Exportar suas informações".

   A API da Meta não entrega o histórico do Direct (só as 20 últimas mensagens
   de cada conversa), então a fonte é a exportação que a própria conta pede na
   Central de Contas. O arquivo é lido no navegador de quem importa: daqui sai
   só o agregado por mês, nunca o texto de uma mensagem. A única exceção são
   as perguntas que três pessoas diferentes fizeram com as mesmas palavras —
   frase repetida por desconhecidos não identifica ninguém.

   Puro, sem acesso a banco nem a arquivo: roda no navegador e nos testes.
   ========================================================================== */

/* ------------------------------------------------------------------- tipos */

export type MensagemBruta = {
  autor: string;
  ts: number;
  /** Reação e mensagem desfeita vêm no arquivo como se fossem mensagens. */
  tipo: "mensagem" | "reacao" | "ligacao" | "mencao" | "desfeita";
  texto: string;
  midias: number;
  audios: number;
  figurinhas: number;
  compartilhamento: boolean;
  respostaStory: boolean;
  reacoes: { emoji: string; autor: string; ts?: number }[];
  segundosLigacao: number;
  /** O que o texto diz, já extraído. A API guarda só isto, sem o texto. */
  feicoes?: Feicoes;
};

export type Feicoes = {
  /** Sobrou texto depois de tirar a saudação. */
  texto: boolean;
  temas: string[];
  pergunta: boolean;
  emojis: string[];
  /** Pergunta normalizada e a forma de exibir, para achar as repetidas. */
  frase?: string;
  forma?: string;
};

export type ConversaBruta = {
  id: string;
  pasta: "inbox" | "message_requests";
  participantes: string[];
  mensagens: MensagemBruta[];
};

export type DirectMes = {
  recebidas: number;
  enviadas: number;
  /** Conversas com ao menos uma mensagem no mês. */
  conversas: number;
  pessoas: number;
  iniciadas: number;
  iniciadasPeloPublico: number;
  /** Conversas que ainda estavam em "Solicitações" quando o arquivo foi gerado. */
  solicitacoes: number;
  /** Conversas em que o público escreveu e a conta não respondeu depois. */
  semResposta: number;
  respostas: {
    respondidas: number;
    semResposta: number;
    mediaMin: number | null;
    medianaMin: number | null;
    faixas: Contagem[];
  };
  porDia: { dia: number; recebidas: number; enviadas: number }[];
  /** Mensagens recebidas por dia da semana (0 = domingo) × hora, em Brasília. */
  mapa: number[][];
  assuntos: { rotulo: string; conversas: number; mensagens: number }[];
  duvidas: { total: number; temas: Contagem[]; frequentes: { texto: string; pessoas: number }[] };
  interacoes: {
    reacoes: number;
    reacoesConta: number;
    midias: number;
    audios: number;
    figurinhas: number;
    compartilhamentos: number;
    respostasStory: number;
    mencoesStory: number;
    ligacoes: number;
    minutosLigacao: number;
  };
  emojis: Contagem[];
  porConversa: { media: number; mediana: number; faixas: Contagem[] };
  /** Arquivo: data da última mensagem. API: quando o resumo foi refeito. */
  arquivoAte: string;
  /** "api" não tem ligações nem solicitações: a Meta não as entrega. */
  fonte: "arquivo" | "api";
  /** Falso no mês que começou antes da coleta contínua pela API. */
  completo: boolean;
};

/* --------------------------------------------------------- leitura de texto */

/** O arquivo da Meta grava UTF-8 como se cada byte fosse um caractere latino. */
export function corrigirTexto(s: unknown): string {
  if (typeof s !== "string") return "";
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

/** Minúsculas e sem acento: é sobre isso que os padrões abaixo casam. */
export const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/* Frases de sistema, em português e em inglês: o idioma do arquivo segue o
   da conta que pediu a exportação. */
const REACAO = /^(reagiu|reacted)\b.*\b(mensagem|message)\b|^(curtiu uma mensagem|liked a message)/;
const DESFEITA = /^(cancelou o envio|desfez o envio|unsent a message)/;
const LIGACAO = /(chamada de (video|voz|audio)|ligacao de (video|voz)|video chat|audio call|video call)/;
const MENCAO = /(mencionou voce|mencionou-o|mencionou-a|mentioned you in)/;
const STORY = /(respondeu ao (seu )?story|replied to (your |their )?story|reagiu ao (seu )?story|reacted to (your )?story)/;
const ANEXO = /^(enviou|sent) (um anexo|an attachment|uma publicacao|a post|um reel|a reel|um video|a video|uma foto|a photo)/;

const lista = (v: unknown) => (Array.isArray(v) ? v : []);

/** Uma mensagem do message_N.json no formato que as contas usam. */
export function lerMensagem(raw: Record<string, unknown>): MensagemBruta | null {
  const ts = Number(raw.timestamp_ms);
  if (!Number.isFinite(ts)) return null;

  const original = corrigirTexto(raw.content);
  const n = normalizar(original);
  const share = raw.share && typeof raw.share === "object" ? (raw.share as Record<string, unknown>) : null;
  const link = typeof share?.link === "string" ? share.link : "";
  const temLigacao = typeof raw.call_duration === "number";

  let tipo: MensagemBruta["tipo"] = "mensagem";
  if (raw.is_unsent === true || DESFEITA.test(n)) tipo = "desfeita";
  else if (temLigacao || (n.length < 70 && LIGACAO.test(n))) tipo = "ligacao";
  else if (MENCAO.test(n)) tipo = "mencao";
  else if (REACAO.test(n)) tipo = "reacao";

  const respostaStory = tipo === "mensagem" && (STORY.test(n) || link.includes("/stories/"));
  const sistema = STORY.test(n) || ANEXO.test(n) || tipo !== "mensagem";

  return {
    autor: corrigirTexto(raw.sender_name),
    ts,
    tipo,
    // Na reação o "texto" é a própria frase do sistema; o emoji sai dela.
    texto: tipo === "reacao" ? original : sistema ? "" : original,
    midias:
      lista(raw.photos).length + lista(raw.videos).length + (ANEXO.test(n) && !link ? 1 : 0),
    audios: lista(raw.audio_files).length,
    figurinhas: lista(raw.gifs).length + (raw.sticker ? 1 : 0),
    compartilhamento: !!share && !link.includes("/stories/"),
    respostaStory,
    reacoes: lista(raw.reactions)
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        emoji: corrigirTexto(r.reaction),
        autor: corrigirTexto(r.actor),
        ts: typeof r.timestamp === "number" ? r.timestamp * (r.timestamp < 1e12 ? 1000 : 1) : undefined,
      })),
    segundosLigacao: temLigacao ? Number(raw.call_duration) || 0 : 0,
  };
}

/** Quem aparece em mais conversas é a própria conta. */
export function descobrirDono(conversas: ConversaBruta[]): string {
  const vezes = new Map<string, number>();
  for (const c of conversas) for (const p of new Set(c.participantes)) vezes.set(p, (vezes.get(p) ?? 0) + 1);
  return [...vezes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/* -------------------------------------------------------------- assuntos */

/* Classificação por palavra-chave, pensada para os clientes da agência
   (eventos, formaturas, marcas). Uma mensagem pode tocar em mais de um
   assunto; a que não toca em nenhum vai para "Outros". */
export const ASSUNTOS: { rotulo: string; termos: RegExp }[] = [
  {
    rotulo: "Ingressos e valores",
    termos: /\b(ingress|entrada|valor|preco|quanto (custa|e|fica|ta|esta|sai)|custa|lote|meia|compr|vend|pix|cartao|parcel|cupom|desconto|promoc|camarote|vip|pista|passaporte|cortesia|bilhet|ticket|sympla|pacote)/,
  },
  {
    rotulo: "Data e horário",
    termos: /\b(data|que dia|qual dia|quando|horario|que horas|abre|abertura|comeca|inicia|termina|acaba|programac|cronograma|agenda)/,
  },
  {
    rotulo: "Local e acesso",
    termos: /\b(local|onde|endereco|estacionamento|estacionar|como cheg|uber|transporte|onibus|localizac|mapa|portao|acesso)/,
  },
  { rotulo: "Atrações", termos: /\b(atrac|show|banda|cantor|line ?up|artista|djs?\b|quem (vai )?toca|palco)/ },
  {
    rotulo: "Regras, idade e documentos",
    termos: /\b(idade|menor|crianca|documento|rg\b|identidade|pode (levar|entrar)|proibid|permitid|cooler|pets?\b|cachorro|acessibil|pcd|cadeirante)/,
  },
  { rotulo: "Comida e bebida", termos: /\b(comida|cerveja|chopp?e?|bebida|gastronom|cardapio|bar\b|bares|lanche|food)/ },
  {
    rotulo: "Trabalho e parcerias",
    termos: /\b(trabalh|vaga|curriculo|freela|parceri|patrocin|expositor|barraca|stand|estande|permuta|divulga|influenc|imprensa|credencia|orcamento|proposta)/,
  },
  {
    rotulo: "Reembolso e problemas",
    termos: /\b(reembols|cancel|devoluc|devolv|estorn|troca|transferi|nao (recebi|chegou|consigo)|problema|erro\b|reclama|golpe)/,
  },
  { rotulo: "Elogios e agradecimentos", termos: /\b(parabens|obrigad|amei|adorei|incrivel|sucesso|maravilh|perfeit|lindo)/ },
];

const SAUDACAO = /^(oi+e?|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|tudo bem|td bem|hey|hello|hi)\b[\s,!.]*/;
const PERGUNTA =
  /^(qual|quais|quanto|quanta|quantos|quando|onde|como|que horas|tem\b|vai ter|pode|posso|podem|existe|alguem|sera|e possivel|gostaria de saber|queria saber|voces)/;

/** Tira as saudações do começo, uma atrás da outra ("oi, boa noite, ..."). */
function semSaudacao(n: string) {
  let s = n;
  for (let i = 0; i < 3 && SAUDACAO.test(s); i++) s = s.replace(SAUDACAO, "");
  return s;
}

/* A mesma limpeza no texto original, com acento e maiúscula, para exibir. */
const SAUDACAO_ORIGINAL =
  /^(oi+e?|olá|ola|opa|e a[ií]|eai|bom dia|boa tarde|boa noite|tudo bem\??|td bem|hey|hello|hi)(?=[\s,!.?]|$)[\s,!.]*/iu;
function paraExibir(t: string) {
  let s = t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3 && SAUDACAO_ORIGINAL.test(s); i++) s = s.replace(SAUDACAO_ORIGINAL, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Assunto, pergunta e emojis de uma mensagem; o texto em si não sai daqui. */
export function feicoesDoTexto(texto: string): Feicoes {
  const emojis = emojisDe(texto);
  const n = texto ? semSaudacao(normalizar(texto)) : "";
  if (!n) return { texto: false, temas: [], pergunta: false, emojis };

  const temas = ASSUNTOS.filter((t) => t.termos.test(n)).map((t) => t.rotulo);
  const pergunta = texto.includes("?") || PERGUNTA.test(n);
  const frase = n.replace(/[^\p{L}\p{N} ]+/gu, "").trim();
  const repetivel = pergunta && frase.split(" ").length >= 3 && frase.length <= 90;
  return {
    texto: true,
    temas,
    pergunta,
    emojis,
    ...(repetivel ? { frase, forma: paraExibir(texto) } : {}),
  };
}

/* --------------------------------------------------------------- emojis */

const PICTO = /\p{Extended_Pictographic}/u;
const segmentador =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("pt", { granularity: "grapheme" }) : null;

/** Emojis inteiros, com tom de pele e combinações (👍🏽, 👨‍👩‍👧) como um só. */
export function emojisDe(texto: string): string[] {
  if (!texto || !PICTO.test(texto)) return [];
  if (!segmentador) return texto.match(/\p{Extended_Pictographic}/gu) ?? [];
  return [...segmentador.segment(texto)].map((s) => s.segment).filter((s) => PICTO.test(s));
}

/* ---------------------------------------------------------------- contas */

const BRASILIA = 3 * 3600_000; // sem horário de verão desde 2019
const quando = (ts: number) => {
  const d = new Date(ts - BRASILIA);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    semana: d.getUTCDay(),
    hora: d.getUTCHours(),
  };
};
const chave = (ts: number) => {
  const q = quando(ts);
  return `${q.ano}-${q.mes}`;
};

const FAIXAS_RESPOSTA: { rotulo: string; ateMin: number }[] = [
  { rotulo: "Até 5 min", ateMin: 5 },
  { rotulo: "5 a 30 min", ateMin: 30 },
  { rotulo: "30 min a 1 h", ateMin: 60 },
  { rotulo: "1 a 6 h", ateMin: 360 },
  { rotulo: "6 a 24 h", ateMin: 1440 },
  { rotulo: "Mais de 1 dia", ateMin: Infinity },
];

const FAIXAS_CONVERSA: { rotulo: string; ate: number }[] = [
  { rotulo: "1 mensagem", ate: 1 },
  { rotulo: "2 a 5", ate: 5 },
  { rotulo: "6 a 10", ate: 10 },
  { rotulo: "11 a 20", ate: 20 },
  { rotulo: "Mais de 20", ate: Infinity },
];

type Acumulado = {
  recebidas: number;
  enviadas: number;
  conversas: Set<string>;
  pessoas: Set<string>;
  iniciadas: number;
  iniciadasPeloPublico: number;
  solicitacoes: number;
  semResposta: number;
  esperas: number[];
  turnosSemResposta: number;
  porDia: Map<number, { recebidas: number; enviadas: number }>;
  mapa: number[][];
  assuntos: Map<string, { conversas: Set<string>; mensagens: number }>;
  perguntas: number;
  temasPergunta: Map<string, number>;
  frequentes: Map<string, { pessoas: Set<string>; formas: Map<string, number> }>;
  interacoes: DirectMes["interacoes"];
  emojis: Map<string, number>;
  tamanhos: number[];
};

const novo = (): Acumulado => ({
  recebidas: 0,
  enviadas: 0,
  conversas: new Set(),
  pessoas: new Set(),
  iniciadas: 0,
  iniciadasPeloPublico: 0,
  solicitacoes: 0,
  semResposta: 0,
  esperas: [],
  turnosSemResposta: 0,
  porDia: new Map(),
  mapa: Array.from({ length: 7 }, () => Array(24).fill(0)),
  assuntos: new Map(),
  perguntas: 0,
  temasPergunta: new Map(),
  frequentes: new Map(),
  interacoes: {
    reacoes: 0,
    reacoesConta: 0,
    midias: 0,
    audios: 0,
    figurinhas: 0,
    compartilhamentos: 0,
    respostasStory: 0,
    mencoesStory: 0,
    ligacoes: 0,
    minutosLigacao: 0,
  },
  emojis: new Map(),
  tamanhos: [],
});

const somar = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

function topo(m: Map<string, number>, n: number): Contagem[] {
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([rotulo, n]) => ({ rotulo, n }));
}

function mediana(v: number[]) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Todas as conversas do arquivo → um agregado por mês, só dos meses com
 * alguma mensagem. `dono` é o nome com que a conta aparece no arquivo.
 */
export function resumirDirect(conversas: ConversaBruta[], dono: string) {
  const meses = new Map<string, Acumulado>();
  const mes = (ts: number) => {
    const k = chave(ts);
    let a = meses.get(k);
    if (!a) meses.set(k, (a = novo()));
    return a;
  };
  let ultima = 0;

  for (const c of conversas) {
    const msgs = c.mensagens.filter((m) => m.tipo !== "desfeita").sort((a, b) => a.ts - b.ts);
    if (!msgs.length) continue;
    ultima = Math.max(ultima, msgs.at(-1)!.ts);

    const reais = msgs.filter((m) => m.tipo === "mensagem");
    const primeira = reais[0] ?? msgs[0];
    const inicio = mes(primeira.ts);
    inicio.iniciadas++;
    if (primeira.autor !== dono) inicio.iniciadasPeloPublico++;
    if (c.pasta === "message_requests") inicio.solicitacoes++;

    // Por mês desta conversa: tamanho e a primeira mensagem do público.
    const daConversa = new Map<string, { total: number; primeiraDoPublico: number | null }>();
    let ultimaDaConta = 0;

    for (const m of msgs) {
      const a = mes(m.ts);
      const doPublico = m.autor !== dono;

      for (const r of m.reacoes) {
        const alvo = r.ts ? mes(r.ts) : a;
        if (r.autor === dono) alvo.interacoes.reacoesConta++;
        else {
          alvo.interacoes.reacoes++;
          for (const e of emojisDe(r.emoji)) somar(alvo.emojis, e);
        }
      }

      if (m.tipo === "reacao") {
        if (doPublico) {
          a.interacoes.reacoes++;
          for (const e of (m.feicoes ?? feicoesDoTexto(m.texto)).emojis) somar(a.emojis, e);
        } else a.interacoes.reacoesConta++;
        continue;
      }
      if (m.tipo === "ligacao") {
        a.interacoes.ligacoes++;
        a.interacoes.minutosLigacao += m.segundosLigacao / 60;
        continue;
      }
      if (m.tipo === "mencao") {
        if (doPublico) a.interacoes.mencoesStory++;
        continue;
      }

      const k = chave(m.ts);
      const q = quando(m.ts);
      const dc = daConversa.get(k) ?? { total: 0, primeiraDoPublico: null };
      dc.total++;
      daConversa.set(k, dc);
      a.conversas.add(c.id);

      const dia = a.porDia.get(q.dia) ?? { recebidas: 0, enviadas: 0 };
      a.porDia.set(q.dia, dia);

      if (!doPublico) {
        a.enviadas++;
        dia.enviadas++;
        ultimaDaConta = m.ts;
        continue;
      }

      a.recebidas++;
      dia.recebidas++;
      a.mapa[q.semana][q.hora]++;
      a.pessoas.add(m.autor);
      if (dc.primeiraDoPublico === null) dc.primeiraDoPublico = m.ts;

      a.interacoes.midias += m.midias;
      a.interacoes.audios += m.audios;
      a.interacoes.figurinhas += m.figurinhas;
      if (m.compartilhamento) a.interacoes.compartilhamentos++;
      if (m.respostaStory) a.interacoes.respostasStory++;
      const fe = m.feicoes ?? feicoesDoTexto(m.texto);
      for (const e of fe.emojis) somar(a.emojis, e);
      if (!fe.texto) continue;

      const temas = fe.temas.length ? fe.temas : ["Outros"];
      for (const t of temas) {
        const s = a.assuntos.get(t) ?? { conversas: new Set<string>(), mensagens: 0 };
        s.conversas.add(c.id);
        s.mensagens++;
        a.assuntos.set(t, s);
      }

      if (fe.pergunta) {
        a.perguntas++;
        for (const t of temas) somar(a.temasPergunta, t);
        if (fe.frase && fe.forma) {
          const f = a.frequentes.get(fe.frase) ?? { pessoas: new Set<string>(), formas: new Map<string, number>() };
          f.pessoas.add(m.autor);
          somar(f.formas, fe.forma);
          a.frequentes.set(fe.frase, f);
        }
      }
    }

    // Resposta: cada vez que o público escreve depois de a conta ter falado
    // (ou abrindo a conversa) começa uma espera, que termina na próxima
    // mensagem da conta. Espera sem fim é mensagem sem resposta.
    let pendente: number | null = null;
    for (const m of reais) {
      if (m.autor === dono) {
        if (pendente !== null) {
          mes(pendente).esperas.push((m.ts - pendente) / 60000);
          pendente = null;
        }
      } else if (pendente === null) pendente = m.ts;
    }
    if (pendente !== null) mes(pendente).turnosSemResposta++;

    for (const [k, dc] of daConversa) {
      const a = meses.get(k)!;
      a.tamanhos.push(dc.total);
      if (dc.primeiraDoPublico !== null && !(ultimaDaConta > dc.primeiraDoPublico)) a.semResposta++;
    }
  }

  const ate = ultima ? new Date(ultima).toISOString() : "";

  return [...meses].map(([k, a]) => {
    const [ano, m] = k.split("-").map(Number);
    const respondidas = a.esperas.length;
    const turnos = respondidas + a.turnosSemResposta;
    const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate();

    const dados: DirectMes = {
      recebidas: a.recebidas,
      enviadas: a.enviadas,
      conversas: a.conversas.size,
      pessoas: a.pessoas.size,
      iniciadas: a.iniciadas,
      iniciadasPeloPublico: a.iniciadasPeloPublico,
      solicitacoes: a.solicitacoes,
      semResposta: a.semResposta,
      respostas: {
        respondidas,
        semResposta: a.turnosSemResposta,
        mediaMin: respondidas ? a.esperas.reduce((s, x) => s + x, 0) / respondidas : null,
        medianaMin: mediana(a.esperas),
        faixas: turnos
          ? FAIXAS_RESPOSTA.map((f, i) => ({
              rotulo: f.rotulo,
              n: a.esperas.filter((e) => e <= f.ateMin && (i === 0 || e > FAIXAS_RESPOSTA[i - 1].ateMin)).length,
            })).concat({ rotulo: "Sem resposta", n: a.turnosSemResposta })
          : [],
      },
      porDia: Array.from({ length: dias }, (_, i) => ({
        dia: i + 1,
        recebidas: a.porDia.get(i + 1)?.recebidas ?? 0,
        enviadas: a.porDia.get(i + 1)?.enviadas ?? 0,
      })),
      mapa: a.mapa,
      assuntos: [...a.assuntos]
        .map(([rotulo, s]) => ({ rotulo, conversas: s.conversas.size, mensagens: s.mensagens }))
        .sort((x, y) => (x.rotulo === "Outros" ? 1 : y.rotulo === "Outros" ? -1 : y.conversas - x.conversas)),
      duvidas: {
        total: a.perguntas,
        temas: topo(a.temasPergunta, 10),
        frequentes: [...a.frequentes.values()]
          .filter((f) => f.pessoas.size >= 3)
          .sort((x, y) => y.pessoas.size - x.pessoas.size)
          .slice(0, 6)
          .map((f) => ({ texto: topo(f.formas, 1)[0].rotulo, pessoas: f.pessoas.size })),
      },
      interacoes: { ...a.interacoes, minutosLigacao: Math.round(a.interacoes.minutosLigacao) },
      emojis: topo(a.emojis, 10),
      porConversa: {
        media: a.tamanhos.length ? a.tamanhos.reduce((s, x) => s + x, 0) / a.tamanhos.length : 0,
        mediana: mediana(a.tamanhos) ?? 0,
        faixas: a.tamanhos.length
          ? FAIXAS_CONVERSA.map((f, i) => ({
              rotulo: f.rotulo,
              n: a.tamanhos.filter((t) => t <= f.ate && (i === 0 || t > FAIXAS_CONVERSA[i - 1].ate)).length,
            }))
          : [],
      },
      arquivoAte: ate,
      fonte: "arquivo",
      completo: true,
    };
    return { ano, mes: m, dados };
  });
}

/* ------------------------------------------------------------ normalização */

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOuNulo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const contagens = (v: unknown): Contagem[] =>
  lista(v)
    .map(obj)
    .map((c) => ({ rotulo: String(c.rotulo ?? ""), n: num(c.n) }))
    .filter((c) => c.rotulo);

/** Fronteira do Json guardado: forma garantida, nunca lança. */
export function comoDirect(v: unknown): DirectMes | null {
  const d = obj(v);
  if (!("recebidas" in d)) return null;
  const r = obj(d.respostas);
  const du = obj(d.duvidas);
  const it = obj(d.interacoes);
  const pc = obj(d.porConversa);
  const mapa = lista(d.mapa);
  return {
    recebidas: num(d.recebidas),
    enviadas: num(d.enviadas),
    conversas: num(d.conversas),
    pessoas: num(d.pessoas),
    iniciadas: num(d.iniciadas),
    iniciadasPeloPublico: num(d.iniciadasPeloPublico),
    solicitacoes: num(d.solicitacoes),
    semResposta: num(d.semResposta),
    respostas: {
      respondidas: num(r.respondidas),
      semResposta: num(r.semResposta),
      mediaMin: numOuNulo(r.mediaMin),
      medianaMin: numOuNulo(r.medianaMin),
      faixas: contagens(r.faixas),
    },
    porDia: lista(d.porDia)
      .map(obj)
      .map((p) => ({ dia: num(p.dia), recebidas: num(p.recebidas), enviadas: num(p.enviadas) })),
    mapa: Array.from({ length: 7 }, (_, s) => Array.from({ length: 24 }, (_, h) => num(lista(mapa[s])[h]))),
    assuntos: lista(d.assuntos)
      .map(obj)
      .map((a) => ({ rotulo: String(a.rotulo ?? ""), conversas: num(a.conversas), mensagens: num(a.mensagens) }))
      .filter((a) => a.rotulo),
    duvidas: {
      total: num(du.total),
      temas: contagens(du.temas),
      frequentes: lista(du.frequentes)
        .map(obj)
        .map((f) => ({ texto: String(f.texto ?? ""), pessoas: num(f.pessoas) }))
        .filter((f) => f.texto),
    },
    interacoes: {
      reacoes: num(it.reacoes),
      reacoesConta: num(it.reacoesConta),
      midias: num(it.midias),
      audios: num(it.audios),
      figurinhas: num(it.figurinhas),
      compartilhamentos: num(it.compartilhamentos),
      respostasStory: num(it.respostasStory),
      mencoesStory: num(it.mencoesStory),
      ligacoes: num(it.ligacoes),
      minutosLigacao: num(it.minutosLigacao),
    },
    emojis: contagens(d.emojis),
    porConversa: { media: num(pc.media), mediana: num(pc.mediana), faixas: contagens(pc.faixas) },
    arquivoAte: typeof d.arquivoAte === "string" ? d.arquivoAte : "",
    fonte: d.fonte === "api" ? "api" : "arquivo",
    completo: d.completo !== false,
  };
}

/* --------------------------------------------------------------- no deck */

export type PontoDirect = { ano: number; mes: number; recebidas: number; enviadas: number; conversas: number };

export type DirectDeck = {
  atual: DirectMes;
  /** O mesmo mês do ano anterior, quando o arquivo chega até lá. */
  anterior: DirectMes | null;
  /** Todos os meses deste ano e do anterior que têm dado. */
  serie: PontoDirect[];
};

export function montarDirect(
  linhas: { ano: number; mes: number; dados: unknown }[],
  ano: number,
  mes: number,
): DirectDeck | null {
  const lidas = linhas
    .map((l) => ({ ...l, d: comoDirect(l.dados) }))
    .filter((l): l is typeof l & { d: DirectMes } => !!l.d);
  const atual = lidas.find((l) => l.ano === ano && l.mes === mes)?.d;
  if (!atual) return null;
  return {
    atual,
    anterior: lidas.find((l) => l.ano === ano - 1 && l.mes === mes)?.d ?? null,
    serie: lidas.map((l) => ({
      ano: l.ano,
      mes: l.mes,
      recebidas: l.d.recebidas,
      enviadas: l.d.enviadas,
      conversas: l.d.conversas,
    })),
  };
}

/** Pico da semana e do dia, a partir do mapa. */
export function picos(mapa: number[][]) {
  const porSemana = mapa.map((h) => h.reduce((s, x) => s + x, 0));
  const porHora = Array.from({ length: 24 }, (_, h) => mapa.reduce((s, d) => s + (d[h] ?? 0), 0));
  const maior = (v: number[]) => v.reduce((m, x, i) => (x > v[m] ? i : m), 0);
  let celula = { semana: 0, hora: 0, n: 0 };
  mapa.forEach((h, s) =>
    h.forEach((n, hora) => {
      if (n > celula.n) celula = { semana: s, hora, n };
    }),
  );
  return { porSemana, porHora, semana: maior(porSemana), hora: maior(porHora), celula };
}

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
