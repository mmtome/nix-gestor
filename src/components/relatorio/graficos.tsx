/**
 * Gráficos do relatório, em SVG puro.
 *
 * Não usam Recharts de propósito: o deck é feito para virar PDF pela impressão
 * do navegador, e componente que mede o container em runtime sai em branco ou
 * cortado na página impressa. SVG com viewBox fixo imprime igual à tela.
 */

import { compacto, numero, porcento, MESES_CURTOS } from "@/lib/relatorio";
import type { Fatia, PontoHora, SerieAnual } from "@/lib/relatorio";

const ROXO = "#8013A8";
const ROXO_CLARO = "#B863E0";
const AMETISTA = "#6E327C";
const AMBAR = "#FFAB00";
const LARANJA = "#FB7601";
const LINHA = "#E5DBE9";
const TEXTO_FRACO = "#6E6377";

/** Cores das fatias — marca primeiro, depois tons que não competem com ela. */
export const CORES_FATIA = [ROXO, AMETISTA, ROXO_CLARO, AMBAR, LARANJA, "#4573D2", "#4FB3A6"];

/* -------------------------------------------------------------------------- */
/* Linha — curva de seguidores online por horário                              */
/* -------------------------------------------------------------------------- */

export function GraficoHorarios({ pontos }: { pontos: PontoHora[] }) {
  if (pontos.length < 2) return null;

  const W = 1000;
  const H = 300;
  const M = { top: 16, right: 20, bottom: 42, left: 62 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const max = Math.max(...pontos.map((p) => p.valor), 1);
  // Teto “redondo” para a régua não terminar num número quebrado.
  const passo = Math.pow(10, Math.floor(Math.log10(max))) / 2;
  const teto = Math.ceil(max / passo) * passo;

  const x = (hora: number) => M.left + (hora / 23) * iw;
  const y = (v: number) => M.top + ih - (v / teto) * ih;

  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(p.hora)},${y(p.valor)}`).join(" ");
  const area = `${d} L${x(pontos.at(-1)!.hora)},${M.top + ih} L${x(pontos[0].hora)},${M.top + ih} Z`;

  const reguas = Array.from({ length: 5 }, (_, i) => (teto / 4) * i);
  const pico = pontos.reduce((a, b) => (b.valor > a.valor ? b : a));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
         aria-label="Seguidores online por horário">
      <defs>
        <linearGradient id="rel-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ROXO} stopOpacity="0.22" />
          <stop offset="1" stopColor={ROXO} stopOpacity="0" />
        </linearGradient>
      </defs>

      {reguas.map((v) => (
        <g key={v}>
          <line x1={M.left} y1={y(v)} x2={W - M.right} y2={y(v)} stroke={LINHA} strokeWidth="1" />
          <text x={M.left - 12} y={y(v) + 4} textAnchor="end" fontSize="13" fill={TEXTO_FRACO}>
            {compacto(v)}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#rel-area)" />
      <path d={d} fill="none" stroke={ROXO} strokeWidth="3.5"
            strokeLinejoin="round" strokeLinecap="round" />

      <circle cx={x(pico.hora)} cy={y(pico.valor)} r="6.5" fill={AMBAR} />
      <text x={x(pico.hora)} y={y(pico.valor) - 16} textAnchor="middle"
            fontSize="14" fontWeight="700" fill={ROXO}>
        {compacto(pico.valor)} · {String(pico.hora).padStart(2, "0")}h
      </text>

      {pontos
        .filter((p) => p.hora % 3 === 0)
        .map((p) => (
          <text key={p.hora} x={x(p.hora)} y={H - 14} textAnchor="middle"
                fontSize="13" fill={TEXTO_FRACO}>
            {String(p.hora).padStart(2, "0")}h
          </text>
        ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Pizza — gênero                                                              */
/* -------------------------------------------------------------------------- */

export function GraficoPizza({ fatias }: { fatias: Fatia[] }) {
  const validas = fatias.filter((f) => f.pct > 0);
  if (!validas.length) return null;

  const total = validas.reduce((s, f) => s + f.pct, 0) || 1;
  const R = 78;
  const C = 100;
  let angulo = -Math.PI / 2;

  const setores = validas.map((f, i) => {
    const fatia = (f.pct / total) * Math.PI * 2;
    const inicio = angulo;
    const fim = angulo + fatia;
    angulo = fim;

    const x1 = C + R * Math.cos(inicio);
    const y1 = C + R * Math.sin(inicio);
    const x2 = C + R * Math.cos(fim);
    const y2 = C + R * Math.sin(fim);
    const maior = fatia > Math.PI ? 1 : 0;

    return {
      d: `M${C},${C} L${x1},${y1} A${R},${R} 0 ${maior} 1 ${x2},${y2} Z`,
      cor: CORES_FATIA[i % CORES_FATIA.length],
      ...f,
    };
  });

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 200 200" className="h-[124px] w-[124px] shrink-0" role="img"
           aria-label="Distribuição por gênero">
        {setores.map((s) => (
          <path key={s.rotulo} d={s.d} fill={s.cor} stroke="#fff" strokeWidth="2" />
        ))}
      </svg>
      <ul className="flex flex-col gap-1.5">
        {setores.map((s) => (
          <li key={s.rotulo} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.cor }} />
            <span className="text-dim">{s.rotulo}</span>
            <span className="font-semibold tabular-nums text-text">{porcento(s.pct, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barras — comparativo do ano                                                 */
/* -------------------------------------------------------------------------- */

export function GraficoBarras({
  serie,
  titulo,
  destaque,
}: {
  serie: SerieAnual[];
  titulo: string;
  /** Mês do relatório aberto — pintado em âmbar para se achar no ano. */
  destaque?: number;
}) {
  const W = 460;
  const H = 260;
  const M = { top: 14, right: 8, bottom: 50, left: 58 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const max = Math.max(...serie.map((p) => p.valor), 1);
  const passo = Math.pow(10, Math.floor(Math.log10(max))) / 2;
  const teto = Math.max(Math.ceil(max / passo) * passo, 1);

  const largura = (iw / 12) * 0.58;
  const x = (mes: number) => M.left + ((mes - 0.5) / 12) * iw - largura / 2;
  const alturaDe = (v: number) => (v / teto) * ih;

  const reguas = Array.from({ length: 4 }, (_, i) => (teto / 3) * i);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-text">
        {titulo}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`${titulo} por mês`}>
        {reguas.map((v) => (
          <g key={v}>
            <line x1={M.left} y1={M.top + ih - alturaDe(v)} x2={W - M.right}
                  y2={M.top + ih - alturaDe(v)} stroke={LINHA} strokeWidth="1" />
            <text x={M.left - 8} y={M.top + ih - alturaDe(v) + 4} textAnchor="end"
                  fontSize="11" fill={TEXTO_FRACO}>
              {compacto(v)}
            </text>
          </g>
        ))}

        {serie.map((p) => {
          const h = alturaDe(p.valor);
          const ativo = p.mes === destaque;
          return (
            <g key={p.mes}>
              {h > 0 && (
                <rect
                  x={x(p.mes)}
                  y={M.top + ih - h}
                  width={largura}
                  height={h}
                  rx="2"
                  fill={ativo ? AMBAR : ROXO}
                />
              )}
              <text
                x={x(p.mes) + largura / 2}
                y={M.top + ih + 16}
                textAnchor="middle"
                fontSize="10"
                fontWeight={ativo ? 700 : 400}
                fill={ativo ? "#231A28" : TEXTO_FRACO}
              >
                {MESES_CURTOS[p.mes - 1]}
              </text>
            </g>
          );
        })}

        {(() => {
          const alvo = serie.find((p) => p.mes === destaque);
          if (!alvo || alvo.valor <= 0) return null;
          return (
            <text
              x={x(alvo.mes) + largura / 2}
              y={M.top + ih - alturaDe(alvo.valor) - 7}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#231A28"
            >
              {compacto(alvo.valor)}
            </text>
          );
        })()}
      </svg>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra horizontal — idade e localização                                      */
/* -------------------------------------------------------------------------- */

export function ListaComBarra({ fatias }: { fatias: Fatia[] }) {
  if (!fatias.length) {
    return <p className="text-[12px] text-faint">Não preenchido.</p>;
  }
  const max = Math.max(...fatias.map((f) => f.pct), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {fatias.map((f, i) => (
        <li key={f.rotulo + i}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] text-dim">{f.rotulo}</span>
            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-text">
              {porcento(f.pct, 2)}
            </span>
          </div>
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(f.pct / max) * 100}%`,
                background: `linear-gradient(90deg, ${ROXO}, ${AMETISTA})`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra de composição — feed / reels / stories                                */
/* -------------------------------------------------------------------------- */

export function BarraComposicao({
  partes,
}: {
  partes: { rotulo: string; valor: number }[];
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return null;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {partes.map((p, i) =>
          p.valor > 0 ? (
            <div
              key={p.rotulo}
              style={{
                width: `${(p.valor / total) * 100}%`,
                background: CORES_FATIA[i % CORES_FATIA.length],
              }}
              title={`${p.rotulo}: ${numero(p.valor)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {partes.map((p, i) => (
          <li key={p.rotulo} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: CORES_FATIA[i % CORES_FATIA.length] }}
            />
            <span className="text-dim">{p.rotulo}</span>
            <span className="ml-auto font-semibold tabular-nums text-text">
              {numero(p.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
