/**
 * Relatório de resultados — tipos e cálculos.
 *
 * Os blocos de tamanho variável do relatório ficam em Json no banco. Este
 * módulo é o contrato desses campos: quem lê e quem escreve passam por aqui,
 * então uma mudança de forma quebra na compilação em vez de em produção.
 *
 * Tudo aqui é puro — nada de acesso a banco, para poder rodar no cliente
 * (o editor e o deck usam os mesmos tipos e as mesmas formatações).
 */

/* ------------------------------------------------------------------ blocos */

export type Fatia = { rotulo: string; pct: number };
export type PontoHora = { hora: number; valor: number };

/** Um card de destaque nos slides de desempenho. */
export type Destaque = {
  rotulo: string; // FEED · REEL · STORY
  valor: number;
  /** Anexo já existente no projeto, usado como miniatura. */
  anexoId?: string;
  /** Alternativa ao anexo: imagem hospedada em outro lugar. */
  imagemUrl?: string;
  nota?: string;
};

export const ROTULOS_DESTAQUE = ["FEED", "REEL", "STORY"] as const;

/* ------------------------------------------------------------------ extras */

/* O que a importação traz a mais e não tem coluna própria fica em
   `RelatorioMensal.extras`. Cada bloco é opcional: relatório antigo ou
   preenchido à mão simplesmente não tem, e o slide correspondente some. */

export type Contagem = { rotulo: string; n: number };

/** Comentários nos posts do mês, sem contar os da própria conta. */
export type Comunidade = {
  comentarios: number;
  pessoas: number;
  respondidos: number;
  perguntas: number;
  /** Mediana, em minutos, entre o comentário e a primeira resposta da conta. */
  tempoRespostaMin: number | null;
  topPessoas: Contagem[];
  emojis: Contagem[];
  palavras: Contagem[];
  maisCurtidos: { texto: string; usuario: string; curtidas: number }[];
};

/** Médias por post de um grupo (formato, dia da semana, faixa de horário). */
export type MediaPorGrupo = {
  rotulo: string;
  posts: number;
  views: number;
  interacoes: number;
};

export type ExtrasRelatorio = {
  comunidade?: Comunidade;
  formatos?: MediaPorGrupo[];
  dias?: MediaPorGrupo[];
  faixas?: MediaPorGrupo[];
  /** Visualizações do mês por tipo de conteúdo (POST, REEL, STORY…). */
  viewsPorTipo?: Record<string, number>;
  respostasStories?: number;
};

const objeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter(objeto) as T[]) : []);

/** Fronteira do Json `extras`: forma garantida, nunca lança. */
export function comoExtras(v: unknown): ExtrasRelatorio {
  if (!objeto(v)) return {};
  const c = objeto(v.comunidade) ? v.comunidade : null;
  return {
    comunidade: c
      ? {
          comentarios: Number(c.comentarios) || 0,
          pessoas: Number(c.pessoas) || 0,
          respondidos: Number(c.respondidos) || 0,
          perguntas: Number(c.perguntas) || 0,
          tempoRespostaMin: typeof c.tempoRespostaMin === "number" ? c.tempoRespostaMin : null,
          topPessoas: lista<Contagem>(c.topPessoas),
          emojis: lista<Contagem>(c.emojis),
          palavras: lista<Contagem>(c.palavras),
          maisCurtidos: lista<Comunidade["maisCurtidos"][number]>(c.maisCurtidos),
        }
      : undefined,
    formatos: lista<MediaPorGrupo>(v.formatos),
    dias: lista<MediaPorGrupo>(v.dias),
    faixas: lista<MediaPorGrupo>(v.faixas),
    viewsPorTipo: objeto(v.viewsPorTipo) ? (v.viewsPorTipo as Record<string, number>) : undefined,
    respostasStories: typeof v.respostasStories === "number" ? v.respostasStories : undefined,
  };
}

/** "1h07", "35 min", "2 dias" — tempo de resposta legível. */
export function duracao(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  return `${Math.round(min / 1440)} dias`;
}

/* ------------------------------------------------------------- normalização */

/**
 * Prisma devolve Json como `unknown`. Estas funções são a fronteira: garantem
 * a forma antes do dado entrar na UI, e nunca lançam — um relatório com um
 * campo estranho renderiza vazio em vez de derrubar a página.
 */
export function comoFatias(v: unknown): Fatia[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      rotulo: String(f.rotulo ?? ""),
      pct: Number(f.pct) || 0,
    }))
    .filter((f) => f.rotulo !== "");
}

export function comoHorarios(v: unknown): PontoHora[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({ hora: Number(p.hora) || 0, valor: Number(p.valor) || 0 }))
    .filter((p) => p.hora >= 0 && p.hora <= 23)
    .sort((a, b) => a.hora - b.hora);
}

export function comoDestaques(v: unknown): Destaque[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      rotulo: String(d.rotulo ?? "FEED"),
      valor: Number(d.valor) || 0,
      anexoId: d.anexoId ? String(d.anexoId) : undefined,
      imagemUrl: d.imagemUrl ? String(d.imagemUrl) : undefined,
      nota: d.nota ? String(d.nota) : undefined,
    }));
}

/* -------------------------------------------------------------- formatação */

const PT = "pt-BR";

/** 1245310 → "1.245.310" */
export const numero = (n: number) => new Intl.NumberFormat(PT).format(Math.round(n));

/** 5.14 → "5,14%" */
export const porcento = (n: number, casas = 2) =>
  `${new Intl.NumberFormat(PT, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n)}%`;

/** 9.43 → "9,43" */
export const decimal = (n: number, casas = 2) =>
  new Intl.NumberFormat(PT, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n);

/** +23701 → "+23.701" · -412 → "−412" */
export const comSinal = (n: number) =>
  n >= 0 ? `+${numero(n)}` : `−${numero(Math.abs(n))}`;

/** Números grandes viram "1,2 mi" nos eixos dos gráficos. */
export function compacto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${decimal(n / 1_000_000, 1)} mi`;
  if (Math.abs(n) >= 1_000) return `${decimal(n / 1_000, 0)} mil`;
  return numero(n);
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const nomeDoMes = (mes: number) => MESES[mes - 1] ?? "";

/** "01 de julho a 31 de julho" — o subtítulo do slide de visão geral. */
export function periodoPorExtenso(ano: number, mes: number): string {
  const ultimo = new Date(ano, mes, 0).getDate();
  const nome = nomeDoMes(mes).toLowerCase();
  return `01 de ${nome} a ${ultimo} de ${nome}`;
}

/* --------------------------------------------------------------- derivados */

/**
 * Quantas vezes o alcance superou a própria base de seguidores. É a leitura
 * que dá sentido ao número de alcance: 1,2 milhão de contas com 40 mil
 * seguidores significa que o conteúdo saiu da bolha 30 vezes.
 */
export function multiploDeAlcance(alcance: number, seguidores: number): number | null {
  if (!seguidores || !alcance) return null;
  return alcance / seguidores;
}

/** Crescimento percentual a partir da base do mês anterior. */
export function taxaDeCrescimento(seguidores: number, delta: number): number | null {
  const base = seguidores - delta;
  if (base <= 0) return null;
  return (delta / base) * 100;
}

/* ------------------------------------------------------------ comparativos */

export type SerieAnual = { mes: number; valor: number };

export type Comparativo = {
  chave: string;
  titulo: string;
  serie: SerieAnual[];
};

/** Uma linha do banco reduzida ao que os gráficos comparativos consomem. */
export type LinhaComparativa = {
  mes: number;
  visualizacoes: number;
  interacoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvos: number;
  cliquesLink: number;
};

const SERIES: { chave: keyof Omit<LinhaComparativa, "mes">; titulo: string }[] = [
  { chave: "visualizacoes", titulo: "Visualizações" },
  { chave: "interacoes", titulo: "Interações" },
  { chave: "curtidas", titulo: "Curtidas" },
  { chave: "comentarios", titulo: "Comentários" },
  { chave: "compartilhamentos", titulo: "Compartilhamentos" },
  { chave: "salvos", titulo: "Salvos" },
  { chave: "cliquesLink", titulo: "Cliques em links" },
];

/**
 * Monta as 7 séries do ano com os 12 meses sempre presentes.
 *
 * Os meses sem relatório entram com zero de propósito: o gráfico do ano
 * inteiro mostra onde houve pico e onde não houve trabalho, e uma série que
 * pula meses esconde exatamente essa leitura.
 */
export function montarComparativos(linhas: LinhaComparativa[]): Comparativo[] {
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  return SERIES.map(({ chave, titulo }) => ({
    chave,
    titulo,
    serie: Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      valor: porMes.get(i + 1)?.[chave] ?? 0,
    })),
  }));
}

/** Um comparativo só vale a pena desenhar se algum mês tem número. */
export const temDados = (c: Comparativo) => c.serie.some((p) => p.valor > 0);
