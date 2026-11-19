import type { Comunidade, Contagem, MediaPorGrupo } from "./relatorio";

/* ============================================================================
   Comunidade e engajamento — contas feitas sobre o que a API já entregou.

   Puro: recebe os posts e os comentários e devolve os agregados que vão para
   `RelatorioMensal.extras`. O texto dos comentários não é guardado: só as
   contagens, as palavras e emojis mais usados e os três comentários mais
   curtidos (públicos, nos posts do próprio cliente).
   ========================================================================== */

export type ComentarioApi = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  replies?: { data?: { username?: string; timestamp?: string }[] };
};

export type PostResumo = {
  formato: string;
  timestamp?: string;
  views: number;
  interacoes: number;
};

/* Palavras que aparecem em qualquer comentário e não dizem nada sobre ele. */
const VAZIAS = new Set(
  (
    "para pela pelo pelas pelos com como mais muito muita esse essa isso este esta isto aqui " +
    "ainda também tambem quando onde qual quais quem porque porquê pois sobre entre depois antes " +
    "você voce vocês voces nosso nossa nossos nossas meu minha meus minhas seu sua seus suas " +
    "dele dela deles delas eles elas nós nos tem têm tinha ter vai vão vamos foi ser são era " +
    "está estão estou estava fazer faz fica ficar tudo todo toda todos todas nada cada mesmo " +
    "mesma bem bom boa então entao agora hoje sempre nunca já só uma umas uns que não nao sim " +
    "the and https http www"
  ).split(" "),
);

const EMOJI = /\p{Extended_Pictographic}/gu;

function topo(mapa: Map<string, number>, n: number): Contagem[] {
  return [...mapa]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([rotulo, n]) => ({ rotulo, n }));
}

const somar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function mediana(v: number[]) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function resumirComentarios(comentarios: ComentarioApi[], propria: string): Comunidade {
  const eu = propria.toLowerCase();
  const doPublico = comentarios.filter((c) => (c.username ?? "").toLowerCase() !== eu);

  const pessoas = new Map<string, number>();
  const emojis = new Map<string, number>();
  const palavras = new Map<string, number>();
  const esperas: number[] = [];
  let respondidos = 0;
  let perguntas = 0;

  for (const c of doPublico) {
    if (c.username) somar(pessoas, `@${c.username}`);
    const texto = c.text ?? "";
    if (texto.includes("?")) perguntas++;
    for (const e of texto.match(EMOJI) ?? []) somar(emojis, e);
    for (const p of texto.toLowerCase().split(/[^\p{L}\p{N}@#]+/u)) {
      if (p.length >= 4 && !VAZIAS.has(p) && !p.startsWith("@") && !/^\d+$/.test(p)) somar(palavras, p);
    }

    const resposta = (c.replies?.data ?? [])
      .filter((r) => (r.username ?? "").toLowerCase() === eu && r.timestamp)
      .map((r) => new Date(r.timestamp!).getTime())
      .sort((a, b) => a - b)[0];
    if (resposta) {
      respondidos++;
      if (c.timestamp) esperas.push((resposta - new Date(c.timestamp).getTime()) / 60000);
    }
  }

  const curta = (t: string) => (t.length > 110 ? t.slice(0, 107).trimEnd() + "…" : t);

  return {
    comentarios: doPublico.length,
    pessoas: pessoas.size,
    respondidos,
    perguntas,
    tempoRespostaMin: mediana(esperas.filter((m) => m >= 0)),
    topPessoas: topo(pessoas, 5),
    emojis: topo(emojis, 8),
    palavras: topo(palavras, 10),
    maisCurtidos: [...doPublico]
      .filter((c) => (c.like_count ?? 0) > 0 && c.text)
      .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
      .slice(0, 3)
      .map((c) => ({ texto: curta(c.text!.replace(/\s+/g, " ").trim()), usuario: `@${c.username ?? ""}`, curtidas: c.like_count ?? 0 })),
  };
}

/* ------------------------------------------------- formatos, dias e horas */

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const FAIXAS = [
  { rotulo: "Madrugada · 0h–6h", ate: 6 },
  { rotulo: "Manhã · 6h–12h", ate: 12 },
  { rotulo: "Tarde · 12h–18h", ate: 18 },
  { rotulo: "Noite · 18h–24h", ate: 24 },
];

/** Dia da semana (0 = domingo) e hora no horário de Brasília. */
function emBrasilia(iso: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    partes.find((p) => p.type === "weekday")?.value ?? "",
  );
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  return { dia, hora };
}

function medias(grupos: Map<string, PostResumo[]>, ordem?: string[]): MediaPorGrupo[] {
  const chaves = ordem ? ordem.filter((k) => grupos.has(k)) : [...grupos.keys()];
  return chaves.map((rotulo) => {
    const p = grupos.get(rotulo)!;
    return {
      rotulo,
      posts: p.length,
      views: Math.round(p.reduce((s, x) => s + x.views, 0) / p.length),
      interacoes: Math.round(p.reduce((s, x) => s + x.interacoes, 0) / p.length),
    };
  });
}

export function resumirPosts(posts: PostResumo[]) {
  const porFormato = new Map<string, PostResumo[]>();
  const porDia = new Map<string, PostResumo[]>();
  const porFaixa = new Map<string, PostResumo[]>();

  for (const p of posts) {
    porFormato.set(p.formato, [...(porFormato.get(p.formato) ?? []), p]);
    if (!p.timestamp) continue;
    const { dia, hora } = emBrasilia(p.timestamp);
    const d = DIAS[dia];
    if (d) porDia.set(d, [...(porDia.get(d) ?? []), p]);
    const f = FAIXAS.find((x) => hora < x.ate)!.rotulo;
    porFaixa.set(f, [...(porFaixa.get(f) ?? []), p]);
  }

  return {
    formatos: medias(porFormato).sort((a, b) => b.interacoes - a.interacoes),
    dias: medias(porDia, DIAS),
    faixas: medias(porFaixa, FAIXAS.map((f) => f.rotulo)),
  };
}
