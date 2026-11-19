import "server-only";
/* Login unificado: graph.facebook.com com o id da conta no caminho. O token
   vem do "Conectar com Instagram" (api/instagram/callback) e fica cifrado. */
import { GRAPH, decifrar } from "./meta";

/**
 * Importação de métricas do Instagram (Graph API).
 *
 * A metade automática do relatório híbrido: quando o projeto tem conta
 * conectada, isto preenche o que a API entrega e deixa o resto para a mão.
 *
 * DE ONDE VEM CADA NÚMERO
 *
 * - **Totais do mês** (visualizações, alcance, interações, curtidas…) são
 *   métricas de conta com `metric_type=total_value`: o que aconteceu no mês,
 *   em qualquer conteúdo — é o mesmo número do painel do Instagram. O alcance
 *   vem deduplicado; só somamos fatias quando o mês passa de 30 dias, que é o
 *   limite de janela da Meta.
 * - **Posts, reels, destaques e formato** vêm das mídias publicadas no mês.
 * - **Seguidores no fim do mês**: a API só dá o número de hoje; descontamos o
 *   saldo de `follows_and_unfollows` entre o fim do mês e agora.
 * - **Taxas** são calculadas: engajamento = contas engajadas ÷ alcance,
 *   frequência = visualizações ÷ alcance, crescimento = saldo ÷ seguidores do
 *   início do mês.
 *
 * O QUE A API NÃO ENTREGA
 *
 * - **Stories passados.** Os insights de story somem em 24 h.
 * - **Demografia histórica.** `follower_demographics` é sempre a de agora, e
 *   só responde com 100+ seguidores.
 * - **Horários antigos.** `online_followers` cobre só os últimos 30 dias.
 *
 * Cada métrica é pedida sozinha: a Meta recusa a requisição inteira se uma
 * métrica dela não existir, e assim uma recusa vira aviso em vez de derrubar o
 * resto. Nada aqui lança para o chamador.
 */

export type ResultadoImportacao =
  | { ok: true; dados: DadosImportados; avisos: string[] }
  | { ok: false; motivo: string };

type Fatia = { rotulo: string; pct: number };
type Destaque = { rotulo: string; valor: number; imagemUrl?: string; nota?: string };

export type DadosImportados = {
  seguidores?: number;
  seguidoresDelta?: number;
  taxaCrescimento?: number;
  alcance?: number;
  visualizacoes?: number;
  freqExibicao?: number;
  taxaEngajamento?: number;
  posts?: number;
  feeds?: number;
  reels?: number;
  mediaViewReels?: number;
  formatoTop?: string;
  curtidas?: number;
  comentarios?: number;
  compartilhamentos?: number;
  salvos?: number;
  interacoes?: number;
  cliquesLink?: number;
  idades?: Fatia[];
  localizacoes?: Fatia[];
  generos?: Fatia[];
  horarios?: { hora: number; valor: number }[];
  topVisualizacoes?: Destaque[];
  piorVisualizacoes?: Destaque[];
  topInteracoes?: Destaque[];
  piorInteracoes?: Destaque[];
};

type Credencial = { igUserId: string; token: string };

export function credencialDaConta(
  conta: { igUserId: string | null; accessToken: string | null } | null,
): Credencial | null {
  if (!conta?.igUserId || !conta.accessToken) return null;
  return { igUserId: conta.igUserId, token: decifrar(conta.accessToken) };
}

async function buscar<T>(caminho: string, cred: Credencial): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(
    `${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(cred.token)}`,
    { cache: "no-store" },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message;
    throw new Error(msg || `Graph ${res.status}`);
  }
  return json as T;
}

/** Roda e devolve o erro como texto, para virar aviso. */
async function tentar<T>(f: () => Promise<T>): Promise<{ v?: T; erro?: string }> {
  try {
    return { v: await f() };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "erro" };
  }
}

/* ------------------------------------------------------------ período */

/** O mês em horário de Brasília, com o fim limitado a agora. */
function janela(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3));
  const fimDoMes = new Date(Date.UTC(ano, mes, 1, 3));
  const agora = new Date();
  const fim = fimDoMes < agora ? fimDoMes : agora;
  return {
    inicio,
    fim,
    since: Math.floor(inicio.getTime() / 1000),
    until: Math.floor(fim.getTime() / 1000),
    agora: Math.floor(agora.getTime() / 1000),
  };
}

const FATIA = 30 * 24 * 3600;

type Total = { valor: number; porDimensao: Record<string, number> };

/** `total_value` de uma métrica de conta na janela, em fatias de 30 dias. */
async function total(
  cred: Credencial,
  metrica: string,
  since: number,
  until: number,
  quebra?: string,
): Promise<Total> {
  let valor = 0;
  const porDimensao: Record<string, number> = {};
  for (let de = since; de < until; de += FATIA) {
    const ate = Math.min(de + FATIA, until);
    const r = await buscar<{
      data?: {
        total_value?: {
          value?: number;
          breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[];
        };
      }[];
    }>(
      `${cred.igUserId}/insights?metric=${metrica}&period=day&metric_type=total_value` +
        `&since=${de}&until=${ate}${quebra ? `&breakdown=${quebra}` : ""}`,
      cred,
    );
    const tv = r.data?.[0]?.total_value;
    valor += tv?.value ?? 0;
    for (const l of tv?.breakdowns?.[0]?.results ?? []) {
      const k = l.dimension_values?.[0] ?? "?";
      porDimensao[k] = (porDimensao[k] ?? 0) + (l.value ?? 0);
    }
  }
  return { valor, porDimensao };
}

/** Novos seguidores menos os que deixaram de seguir. */
async function saldoDeSeguidores(cred: Credencial, since: number, until: number) {
  const t = await total(cred, "follows_and_unfollows", since, until, "follow_type");
  const ganhos = t.porDimensao.FOLLOWER ?? 0;
  const perdidos = t.porDimensao.NON_FOLLOWER ?? 0;
  return { ganhos, perdidos, saldo: ganhos - perdidos };
}

/* ----------------------------------------------------------- audiência */

const GENEROS: Record<string, string> = { F: "Feminino", M: "Masculino", U: "Não informado" };

function rotuloDemografia(quebra: "age" | "city" | "gender", bruto: string) {
  if (quebra === "age") return `${bruto} anos`;
  if (quebra === "city") return bruto.split(",")[0].trim();
  return GENEROS[bruto] ?? bruto;
}

/** `follower_demographics` vem como um total_value com breakdowns. */
async function demografia(cred: Credencial, quebra: "age" | "city" | "gender") {
  const r = await buscar<{
    data?: {
      total_value?: {
        breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[];
      };
    }[];
  }>(
    `${cred.igUserId}/insights?metric=follower_demographics&period=lifetime` +
      `&metric_type=total_value&timeframe=this_month&breakdown=${quebra}`,
    cred,
  );
  const linhas = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  const soma = linhas.reduce((s, l) => s + (l.value || 0), 0);
  if (!soma) return undefined;

  return linhas
    .map((l) => ({
      rotulo: rotuloDemografia(quebra, l.dimension_values?.[0] ?? "—"),
      pct: ((l.value || 0) / soma) * 100,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, quebra === "city" ? 5 : 8);
}

/** Diferença em horas entre dois fusos num instante (São Paulo − Pacífico = 5 ou 4). */
function diferencaDeFuso(a: string, b: string, quando: Date) {
  const off = (tz: string) => {
    const nome = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(quando)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = nome?.match(/GMT([+-]\d+)?/);
    return m?.[1] ? Number(m[1]) : 0;
  };
  return off(a) - off(b);
}

/**
 * Média de seguidores online por hora nos últimos 30 dias. A Meta conta as
 * horas no fuso do Pacífico (o dia dela vira à meia-noite de lá); o gráfico
 * mostra no horário de Brasília.
 */
async function horariosOnline(cred: Credencial) {
  const r = await buscar<{
    data?: { values?: { value?: Record<string, number> }[] }[];
  }>(`${cred.igUserId}/insights?metric=online_followers&period=lifetime`, cred);
  const dias = (r.data?.[0]?.values ?? []).filter(
    (d) => d.value && Object.keys(d.value).length,
  );
  if (!dias.length) return undefined;

  const desloca = diferencaDeFuso("America/Sao_Paulo", "America/Los_Angeles", new Date());
  const soma = new Array<number>(24).fill(0);
  for (const d of dias) {
    for (const [h, v] of Object.entries(d.value!)) {
      soma[(Number(h) + desloca + 24) % 24] += v || 0;
    }
  }
  return soma.map((s, hora) => ({ hora, valor: Math.round(s / dias.length) }));
}

/* -------------------------------------------------------------- mídias */

type SerieInsight = {
  data?: { name: string; values?: { value: number }[] }[];
};

export type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights?: SerieInsight;
};

/** As mídias publicadas na janela. A listagem vem da mais nova para a mais
    antiga: paginamos até passar do início e paramos. */
async function midiasDoPeriodo(cred: Credencial, inicio: Date, fim: Date): Promise<Media[]> {
  const campos =
    "id,caption,media_type,media_product_type,timestamp,like_count,comments_count" +
    ",insights.metric(views,shares,saved,total_interactions)";
  let url = `${cred.igUserId}/media?fields=${campos}&limit=100`;
  const midias: Media[] = [];

  for (let pagina = 0; pagina < 30; pagina++) {
    const r = await buscar<{ data?: Media[]; paging?: { next?: string } }>(url, cred);
    const lote = r.data ?? [];
    midias.push(...lote);

    const maisAntiga = lote.at(-1)?.timestamp;
    if (!r.paging?.next || !maisAntiga || new Date(maisAntiga) < inicio) break;
    // O `next` vem com o token embutido; `buscar` põe o dele de novo.
    const prox = new URL(r.paging.next);
    prox.searchParams.delete("access_token");
    url = prox.pathname.replace(/^\/v[\d.]+\//, "") + prox.search;
  }

  return midias.filter((m) => {
    if (!m.timestamp) return false;
    const t = new Date(m.timestamp);
    return t >= inicio && t < fim;
  });
}

const metrica = (m: Media, nome: string) =>
  m.insights?.data?.find((d) => d.name === nome)?.values?.[0]?.value ?? 0;

function formato(m: Media) {
  if (m.media_product_type === "REELS") return "Reels";
  if (m.media_type === "CAROUSEL_ALBUM") return "Carrossel";
  if (m.media_type === "VIDEO") return "Vídeo";
  return "Foto";
}

/** Agrupa por legenda, dia e formato e fica com a cópia mais vista de cada. */
function semRepetidos(midias: Media[]) {
  const melhor = new Map<string, Media>();
  const chave = (m: Media) =>
    [
      formato(m),
      (m.timestamp ?? "").slice(0, 10),
      (m.caption ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    ].join("|");
  for (const m of midias) {
    // Sem legenda não há como afirmar que é repetido.
    if (!m.caption?.trim()) continue;
    const atual = melhor.get(chave(m));
    if (!atual || metrica(m, "views") > metrica(atual, "views")) melhor.set(chave(m), m);
  }
  const repetidos = midias.filter((m) => m.caption?.trim() && melhor.get(chave(m)) !== m);
  return { unicos: midias.filter((m) => !repetidos.includes(m)), repetidos };
}

function destaque(m: Media, valor: number, projectId: string, extra?: string): Destaque {
  const data = m.timestamp
    ? new Date(m.timestamp).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";
  let legenda = (m.caption ?? "").split("\n")[0].replace(/\s+/g, " ").trim();
  if (legenda.length > 60) legenda = legenda.slice(0, 57).trimEnd() + "…";
  return {
    rotulo: m.media_product_type === "REELS" ? "REEL" : m.media_type === "CAROUSEL_ALBUM" ? "CARROSSEL" : "FEED",
    valor,
    imagemUrl: `/api/instagram/midia/${m.id}?projeto=${encodeURIComponent(projectId)}`,
    nota: [legenda, data, extra].filter(Boolean).join(" · ") || undefined,
  };
}

/* ------------------------------------------------------------ importar */

const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Todas as mídias de um trecho do ano, numa listagem só — para os meses
    anteriores não paginarem o perfil inteiro uma vez cada. */
export async function buscarMidias(
  conta: { igUserId: string | null; accessToken: string | null } | null,
  ano: number,
  mesInicial: number,
  mesFinal: number,
): Promise<Media[] | undefined> {
  const cred = credencialDaConta(conta);
  if (!cred) return undefined;
  const r = await tentar(() =>
    midiasDoPeriodo(cred, janela(ano, mesInicial).inicio, janela(ano, mesFinal).fim),
  );
  return r.v;
}

/**
 * @param completo  `false` nos meses anteriores puxados para o comparativo:
 *                  demografia, horários e destaques ficam de fora, e os
 *                  seguidores também (a API só sabe o número de hoje).
 * @param midias    lista já buscada por `buscarMidias`; sem ela, busca aqui.
 */
export async function importarMes(
  projectId: string,
  conta: { igUserId: string | null; accessToken: string | null } | null,
  ano: number,
  mes: number,
  { completo = true, midias }: { completo?: boolean; midias?: Media[] } = {},
): Promise<ResultadoImportacao> {
  const cred = credencialDaConta(conta);
  if (!cred) {
    return {
      ok: false,
      motivo:
        "Nenhuma conta do Instagram conectada a este projeto. Use “Conectar com Instagram” na lista de relatórios.",
    };
  }

  const { inicio, fim, since, until, agora } = janela(ano, mes);
  if (since >= until) return { ok: false, motivo: "Este mês ainda não começou." };

  const avisos: string[] = [];
  const dados: DadosImportados = {};
  const falhou = (oque: string, erro?: string) => {
    if (erro) avisos.push(`${oque} não veio da API (${erro}).`);
  };

  /* ------------------------------- perfil ------------------------------- */
  const perfil = await tentar(() =>
    buscar<{ followers_count?: number }>(`${cred.igUserId}?fields=followers_count`, cred),
  );
  if (perfil.erro) return { ok: false, motivo: perfil.erro };

  /* ----------------------- métricas de conta, em paralelo ----------------- */
  const [views, reach, engajadas, inter, likes, comments, shares, saves, saldo, depois, links] =
    await Promise.all([
      tentar(() => total(cred, "views", since, until)),
      tentar(() => total(cred, "reach", since, until)),
      tentar(() => total(cred, "accounts_engaged", since, until)),
      tentar(() => total(cred, "total_interactions", since, until)),
      tentar(() => total(cred, "likes", since, until)),
      tentar(() => total(cred, "comments", since, until)),
      tentar(() => total(cred, "shares", since, until)),
      tentar(() => total(cred, "saves", since, until)),
      tentar(() => saldoDeSeguidores(cred, since, until)),
      completo && until < agora
        ? tentar(() => saldoDeSeguidores(cred, until, agora))
        : Promise.resolve({ v: { ganhos: 0, perdidos: 0, saldo: 0 }, erro: undefined }),
      tentar(() => total(cred, "website_clicks", since, until)),
    ]);

  dados.visualizacoes = views.v?.valor;
  dados.alcance = reach.v?.valor;
  dados.interacoes = inter.v?.valor;
  dados.curtidas = likes.v?.valor;
  dados.comentarios = comments.v?.valor;
  dados.compartilhamentos = shares.v?.valor;
  dados.salvos = saves.v?.valor;
  dados.cliquesLink = links.v?.valor;
  falhou("Alcance", reach.erro);
  falhou("Visualizações da conta", views.erro);
  falhou("Interações da conta", inter.erro);
  if (links.erro) avisos.push("Cliques no link da bio não vêm mais da API: preencha à mão.");

  if (reach.v && until - since > FATIA) {
    avisos.push("Alcance: a Meta só deduplica até 30 dias, então o 31º dia foi somado à parte.");
  }

  /* ---------------------------- seguidores ------------------------------ */
  const hoje = perfil.v?.followers_count;
  if (hoje !== undefined && depois.v && completo) {
    dados.seguidores = hoje - depois.v.saldo;
  } else if (hoje !== undefined && completo) {
    dados.seguidores = hoje;
    avisos.push("Seguidores: é o número de hoje, não o do fim do mês.");
  }
  if (saldo.v) {
    dados.seguidoresDelta = saldo.v.saldo;
    if (completo) avisos.push(
      `Seguidores no mês: ${saldo.v.ganhos.toLocaleString("pt-BR")} novos e ${saldo.v.perdidos.toLocaleString("pt-BR")} deixaram de seguir.`,
    );
    const noInicio = (dados.seguidores ?? 0) - saldo.v.saldo;
    if (dados.seguidores !== undefined && noInicio > 0) {
      dados.taxaCrescimento = (saldo.v.saldo / noInicio) * 100;
    }
  } else {
    falhou("Saldo de seguidores", saldo.erro);
  }

  /* ------------------------------- taxas -------------------------------- */
  if (dados.alcance) {
    if (dados.visualizacoes !== undefined) dados.freqExibicao = dados.visualizacoes / dados.alcance;
    if (engajadas.v) {
      dados.taxaEngajamento = (engajadas.v.valor / dados.alcance) * 100;
    } else if (dados.interacoes !== undefined) {
      dados.taxaEngajamento = (dados.interacoes / dados.alcance) * 100;
      avisos.push("Engajamento calculado por interações ÷ alcance: contas engajadas não veio.");
    }
  }

  /* ------------------------------- mídias -------------------------------- */
  const lista = midias
    ? { v: midias.filter((m) => m.timestamp && new Date(m.timestamp) >= inicio && new Date(m.timestamp) < fim), erro: undefined }
    : await tentar(() => midiasDoPeriodo(cred, inicio, fim));
  if (lista.v) {
    const doMes = lista.v;
    const reels = doMes.filter((m) => m.media_product_type === "REELS");
    dados.posts = doMes.length;
    dados.reels = reels.length;
    dados.feeds = doMes.length - reels.length;
    dados.mediaViewReels = reels.length
      ? Math.round(reels.reduce((s, m) => s + metrica(m, "views"), 0) / reels.length)
      : 0;

    // Sem as métricas de conta, os totais saem da soma dos posts do mês.
    const somaPosts = (nome: string) => doMes.reduce((s, m) => s + metrica(m, nome), 0);
    dados.visualizacoes ??= somaPosts("views");
    dados.interacoes ??= somaPosts("total_interactions");
    dados.curtidas ??= doMes.reduce((s, m) => s + (m.like_count || 0), 0);
    dados.comentarios ??= doMes.reduce((s, m) => s + (m.comments_count || 0), 0);
    dados.compartilhamentos ??= somaPosts("shares");
    dados.salvos ??= somaPosts("saved");

    if (doMes.length) {
      // Formato com mais interações por post, entre os que apareceram no mês.
      const grupos = new Map<string, number[]>();
      for (const m of doMes) {
        const f = formato(m);
        grupos.set(f, [...(grupos.get(f) ?? []), metrica(m, "total_interactions")]);
      }
      const medias = [...grupos].map(([f, v]) => [f, v.reduce((s, x) => s + x, 0) / v.length] as const);
      dados.formatoTop = medias.sort((a, b) => b[1] - a[1])[0][0];
    }

    // Post repetido (mesma legenda, dia e formato — repostagem ou teste de
    // reels) entra nos totais, mas não nos destaques: a cópia fraca aparecia
    // entre os piores ao lado da boa entre os melhores.
    const { unicos, repetidos } = semRepetidos(doMes);
    for (const m of repetidos) {
      avisos.push(
        `Post repetido fora dos destaques: ${destaque(m, metrica(m, "views"), projectId).nota ?? m.id} (${metrica(
          m,
          "views",
        ).toLocaleString("pt-BR")} visualizações).`,
      );
    }

    if (completo && unicos.length >= 2) {
      const porViews = [...unicos].sort((a, b) => metrica(b, "views") - metrica(a, "views"));
      const porInter = [...unicos].sort(
        (a, b) => metrica(b, "total_interactions") - metrica(a, "total_interactions"),
      );
      const totalPosts = doMes.reduce((s, m) => s + metrica(m, "total_interactions"), 0);

      dados.topVisualizacoes = porViews.slice(0, 3).map((m) => destaque(m, metrica(m, "views"), projectId));
      dados.piorVisualizacoes = porViews
        .slice(-2)
        .reverse()
        .map((m) => destaque(m, metrica(m, "views"), projectId));
      dados.topInteracoes = porInter.slice(0, 3).map((m, i) => {
        const v = metrica(m, "total_interactions");
        return destaque(
          m,
          v,
          projectId,
          i === 0 && totalPosts
            ? `${pct((v / totalPosts) * 100)}% das interações dos posts`
            : undefined,
        );
      });
      dados.piorInteracoes = porInter
        .slice(-2)
        .reverse()
        .map((m) => destaque(m, metrica(m, "total_interactions"), projectId));
    }
  } else {
    avisos.push(`Posts do mês não vieram da API (${lista.erro}).`);
  }

  if (!completo) return { ok: true, dados, avisos };

  /* ------------------------ audiência e horários ------------------------ */
  const [idades, cidades, generos] = await Promise.all([
    tentar(() => demografia(cred, "age")),
    tentar(() => demografia(cred, "city")),
    tentar(() => demografia(cred, "gender")),
  ]);
  if (idades.v) dados.idades = idades.v;
  if (cidades.v) dados.localizacoes = cidades.v;
  if (generos.v) dados.generos = generos.v;
  if (!idades.v && !cidades.v && !generos.v) {
    avisos.push("Demografia indisponível: a Meta só responde com 100+ seguidores na conta.");
  }

  // A curva cobre os últimos 30 dias: só serve ao mês que acabou de fechar.
  if (agora - until < 40 * 24 * 3600) {
    const horas = await tentar(() => horariosOnline(cred));
    if (horas.v) {
      dados.horarios = horas.v;
      avisos.push("Horários: média dos últimos 30 dias, no horário de Brasília.");
    } else {
      avisos.push(`Horários não vieram da API${horas.erro ? ` (${horas.erro})` : ""}: preencha à mão.`);
    }
  }

  avisos.push("Stories não entram: a Meta apaga os números deles em 24 h.");
  return { ok: true, dados, avisos };
}
