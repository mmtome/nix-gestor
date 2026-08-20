import "server-only";

/**
 * Importação de métricas do Instagram (Graph API).
 *
 * A metade automática do relatório híbrido: quando o projeto tem conta
 * conectada, isto preenche o que a API entrega e deixa o resto para a mão.
 *
 * O QUE A API NÃO ENTREGA — e por isso alguns campos continuam manuais:
 *
 * - **Histórico mês a mês.** As métricas de conta só voltam ~2 anos e os
 *   agregados por mês precisam ser somados dia a dia. O comparativo anual do
 *   relatório sai dos nossos próprios registros, um por mês, não da API.
 * - **Curva de seguidores online por horário.** A métrica `online_followers`
 *   foi descontinuada. O gráfico de horários é preenchido à mão, a partir do
 *   painel do próprio Instagram.
 * - **Demografia com base pequena.** `follower_demographics` só responde com
 *   100+ seguidores; abaixo disso a Meta devolve vazio, não erro.
 * - **Stories além de 24h.** Insights de story expiram. Se a importação rodar
 *   depois do fim do mês, os stories antigos já não respondem.
 *
 * Nada aqui lança para o chamador: sem credencial ou com a API fora, a função
 * devolve o motivo e a UI segue funcionando no modo manual.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type ResultadoImportacao =
  | { ok: true; dados: DadosImportados; avisos: string[] }
  | { ok: false; motivo: string };

export type DadosImportados = {
  seguidores?: number;
  alcance?: number;
  visualizacoes?: number;
  posts?: number;
  feeds?: number;
  reels?: number;
  curtidas?: number;
  comentarios?: number;
  compartilhamentos?: number;
  salvos?: number;
  interacoes?: number;
  mediaViewReels?: number;
  idades?: { rotulo: string; pct: number }[];
  localizacoes?: { rotulo: string; pct: number }[];
  generos?: { rotulo: string; pct: number }[];
};

type Credencial = { igUserId: string; token: string };

/** A conta do projeto tem precedência; a global é o fallback de conta única. */
export function credencialDaConta(
  conta: { igUserId: string | null; accessToken: string | null } | null,
): Credencial | null {
  const igUserId = conta?.igUserId || process.env.INSTAGRAM_USER_ID || "";
  const token = conta?.accessToken || process.env.INSTAGRAM_PUBLISH_TOKEN || "";
  if (!igUserId || !token) return null;
  return { igUserId, token };
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

/** Primeiro e último instante do mês, em ISO, para os parâmetros de período. */
function janela(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59));
  return {
    since: Math.floor(inicio.getTime() / 1000),
    until: Math.floor(fim.getTime() / 1000),
    inicio,
    fim,
  };
}

type SerieInsight = {
  data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
};

type Media = {
  id: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights?: SerieInsight;
};

/** Soma os valores diários de uma métrica de conta na janela pedida. */
async function somaDiaria(
  metrica: string,
  cred: Credencial,
  since: number,
  until: number,
): Promise<number | undefined> {
  try {
    const r = await buscar<SerieInsight>(
      `${cred.igUserId}/insights?metric=${metrica}&period=day&since=${since}&until=${until}`,
      cred,
    );
    const valores = r.data?.[0]?.values ?? [];
    if (!valores.length) return undefined;
    return valores.reduce((s, v) => s + (v.value || 0), 0);
  } catch {
    return undefined;
  }
}

/** `follower_demographics` vem como um total_value com breakdowns. */
async function demografia(
  cred: Credencial,
  quebra: "age" | "city" | "gender",
): Promise<{ rotulo: string; pct: number }[] | undefined> {
  try {
    const r = await buscar<{
      data?: {
        total_value?: {
          breakdowns?: {
            results?: { dimension_values?: string[]; value?: number }[];
          }[];
        };
      }[];
    }>(
      `${cred.igUserId}/insights?metric=follower_demographics&period=lifetime` +
        `&metric_type=total_value&breakdown=${quebra}`,
      cred,
    );
    const linhas = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    if (!linhas.length) return undefined;

    const total = linhas.reduce((s, l) => s + (l.value || 0), 0);
    if (!total) return undefined;

    return linhas
      .map((l) => ({
        rotulo: l.dimension_values?.[0] ?? "—",
        pct: ((l.value || 0) / total) * 100,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, quebra === "city" ? 5 : 8);
  } catch {
    return undefined;
  }
}

export async function importarMes(
  conta: { igUserId: string | null; accessToken: string | null } | null,
  ano: number,
  mes: number,
): Promise<ResultadoImportacao> {
  const cred = credencialDaConta(conta);
  if (!cred) {
    return {
      ok: false,
      motivo:
        "Nenhuma conta do Instagram conectada a este projeto, e não há credencial global configurada.",
    };
  }

  const { since, until, inicio, fim } = janela(ano, mes);
  const avisos: string[] = [];
  const dados: DadosImportados = {};

  /* ------------------------------- perfil ------------------------------- */
  try {
    const perfil = await buscar<{ followers_count?: number }>(
      `${cred.igUserId}?fields=followers_count,username`,
      cred,
    );
    dados.seguidores = perfil.followers_count;
  } catch (e) {
    return {
      ok: false,
      motivo: e instanceof Error ? e.message : "Não foi possível falar com a Graph API",
    };
  }

  /* --------------------------- métricas de conta ------------------------- */
  dados.alcance = await somaDiaria("reach", cred, since, until);
  if (dados.alcance === undefined) {
    avisos.push("Alcance não veio da API — preencha à mão.");
  }

  /* ------------------------------- mídias -------------------------------- */
  try {
    const campos =
      "id,media_type,media_product_type,timestamp,like_count,comments_count" +
      ",insights.metric(views,shares,saved,total_interactions)";
    let url = `${cred.igUserId}/media?fields=${campos}&limit=100`;
    const midias: Media[] = [];

    // A janela é um mês, mas a listagem vem em ordem decrescente de data:
    // paginamos até passar do início do mês e paramos.
    for (let pagina = 0; pagina < 10; pagina++) {
      const r = await buscar<{ data?: Media[]; paging?: { next?: string } }>(url, cred);
      const lote = r.data ?? [];
      midias.push(...lote);

      const maisAntiga = lote.at(-1)?.timestamp;
      if (!r.paging?.next || !maisAntiga || new Date(maisAntiga) < inicio) break;
      url = r.paging.next.replace(`${GRAPH}/`, "").replace(/[?&]access_token=[^&]+/, "");
    }

    const doMes = midias.filter((m) => {
      if (!m.timestamp) return false;
      const t = new Date(m.timestamp);
      return t >= inicio && t <= fim;
    });

    const valor = (m: Media, nome: string) =>
      m.insights?.data?.find((d) => d.name === nome)?.values?.[0]?.value ?? 0;

    const reels = doMes.filter((m) => m.media_product_type === "REELS");
    const feeds = doMes.filter((m) => m.media_product_type !== "REELS");

    dados.posts = doMes.length;
    dados.reels = reels.length;
    dados.feeds = feeds.length;
    dados.visualizacoes = doMes.reduce((s, m) => s + valor(m, "views"), 0);
    dados.curtidas = doMes.reduce((s, m) => s + (m.like_count || 0), 0);
    dados.comentarios = doMes.reduce((s, m) => s + (m.comments_count || 0), 0);
    dados.compartilhamentos = doMes.reduce((s, m) => s + valor(m, "shares"), 0);
    dados.salvos = doMes.reduce((s, m) => s + valor(m, "saved"), 0);
    dados.interacoes = doMes.reduce((s, m) => s + valor(m, "total_interactions"), 0);
    dados.mediaViewReels = reels.length
      ? Math.round(reels.reduce((s, m) => s + valor(m, "views"), 0) / reels.length)
      : 0;

    avisos.push(
      "Stories não entram na contagem automática: os insights deles expiram em 24h.",
    );
  } catch (e) {
    avisos.push(
      `Não foi possível somar as mídias do mês (${
        e instanceof Error ? e.message : "erro"
      }). Os totais de post ficaram em branco.`,
    );
  }

  /* ----------------------------- demografia ------------------------------ */
  const [idades, localizacoes, generos] = await Promise.all([
    demografia(cred, "age"),
    demografia(cred, "city"),
    demografia(cred, "gender"),
  ]);
  if (idades) dados.idades = idades;
  if (localizacoes) dados.localizacoes = localizacoes;
  if (generos) dados.generos = generos;
  if (!idades && !localizacoes && !generos) {
    avisos.push(
      "Demografia indisponível — a Meta só responde com 100+ seguidores na conta.",
    );
  }

  avisos.push(
    "A curva de horários é sempre manual: a métrica online_followers foi descontinuada pela Meta.",
  );

  return { ok: true, dados, avisos };
}
