import { nomeDoMes } from "./relatorio";

/* ============================================================================
   Rascunho da conclusão, escrito a partir dos números do mês.

   É o ponto de partida do slide "Conclusão", no tom do modelo da agência:
   uma frase por achado. Só entra quando a conclusão está vazia — o que alguém
   escreveu nunca é sobrescrito — e a revisão continua sendo da equipe: o
   contexto do mês (lançamento, evento, campanha) a API não conhece.
   ========================================================================== */

type Destaque = { rotulo: string; valor: number; imagemUrl?: string; nota?: string };

export type NumerosDoMes = {
  mes: number;
  visualizacoes?: number;
  alcance?: number;
  seguidores?: number;
  seguidoresDelta?: number;
  taxaCrescimento?: number;
  taxaEngajamento?: number;
  interacoes?: number;
  posts?: number;
  feeds?: number;
  reels?: number;
  formatoTop?: string;
  topVisualizacoes?: Destaque[];
  topInteracoes?: Destaque[];
};

const n = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function variacao(atual: number, antes: number) {
  const x = ((atual - antes) / antes) * 100;
  if (Math.abs(x) < 3) return "ficaram estáveis";
  return `${x > 0 ? "subiram" : "caíram"} ${pct(Math.abs(x))}%`;
}

/** "Legenda do post · 22/10" → "“Legenda do post” (22/10)". */
function descrever(d: Destaque) {
  const [legenda, data] = (d.nota ?? "").split(" · ");
  if (legenda && data) return `“${legenda}” (${data})`;
  if (legenda) return `“${legenda}”`;
  return `um ${d.rotulo.toLowerCase()}`;
}

export function rascunhoDaConclusao(
  m: NumerosDoMes,
  anterior?: { mes: number; visualizacoes: number; alcance: number } | null,
): string {
  const frases: string[] = [];
  const mes = nomeDoMes(m.mes);

  if (m.visualizacoes !== undefined && m.alcance) {
    let f = `${mes} somou ${n(m.visualizacoes)} visualizações e alcançou ${n(m.alcance)} contas.`;
    if (m.seguidores && m.alcance / m.seguidores >= 1.5) {
      f += ` Com ${n(m.seguidores)} seguidores, o conteúdo chegou a ${pct(
        Math.round((m.alcance / m.seguidores) * 10) / 10,
      )} vezes o tamanho da própria base.`;
    }
    frases.push(f);
  }

  if (m.seguidores !== undefined && m.seguidoresDelta !== undefined && m.seguidoresDelta !== 0) {
    const inicio = m.seguidores - m.seguidoresDelta;
    const ganho = m.seguidoresDelta > 0;
    let f = `Os seguidores foram de ${n(inicio)} para ${n(m.seguidores)}, ${
      ganho ? "um ganho" : "uma perda"
    } de ${n(Math.abs(m.seguidoresDelta))}`;
    if (m.taxaCrescimento !== undefined) {
      f += ` (${ganho ? "+" : "−"}${pct(Math.abs(m.taxaCrescimento))}%)`;
    }
    frases.push(f + ".");
  }

  if (anterior && anterior.visualizacoes > 0 && anterior.alcance > 0 && m.visualizacoes && m.alcance) {
    frases.push(
      `Em relação a ${nomeDoMes(anterior.mes).toLowerCase()}, as visualizações ${variacao(
        m.visualizacoes,
        anterior.visualizacoes,
      )} e o alcance ${variacao(m.alcance, anterior.alcance).replace("ficaram", "ficou").replace("subiram", "subiu").replace("caíram", "caiu")}.`,
    );
  }

  if (m.taxaEngajamento) {
    frases.push(
      `A taxa de engajamento do perfil ficou em ${pct(m.taxaEngajamento)}%${
        m.interacoes ? `, com ${n(m.interacoes)} interações no mês` : ""
      }.`,
    );
  }

  if (m.posts) {
    let f = `Foram ${m.posts} publicações no feed (${m.feeds ?? 0} posts e ${m.reels ?? 0} reels)`;
    if (m.formatoTop) f += `, e ${m.formatoTop.toLowerCase()} foi o formato com mais interações por post`;
    frases.push(f + ".");
  }

  const topV = m.topVisualizacoes?.[0];
  const topI = m.topInteracoes?.[0];
  if (topV) {
    frases.push(`O conteúdo mais visto do mês foi ${descrever(topV)}, com ${n(topV.valor)} visualizações.`);
  }
  if (topI) {
    const parcela = topI.nota?.match(/([\d.,]+)% das interações/)?.[1];
    const resto = `${n(topI.valor)} interações${
      parcela ? `, ${parcela}% de tudo o que os posts do mês geraram` : ""
    }`;
    frases.push(
      topV && topI.imagemUrl === topV.imagemUrl
        ? `O mesmo post liderou as interações, com ${resto}.`
        : `O post com mais interações foi ${descrever(topI)}, com ${resto}.`,
    );
  }

  return frases.join("\n");
}
