/**
 * O deck do relatório de resultados.
 *
 * Onze slides 16:9, no padrão das apresentações que a agência já entrega.
 *
 * Escala: cada slide é um container de consulta e a fonte-base é 1cqw, então
 * TODA medida interna em `em` vale um percentual da largura do slide. O mesmo
 * componente serve para a tela (largura fluida) e para a impressão (largura de
 * página), sem media query e sem transform: scale.
 */

import Image from "next/image";
import {
  numero,
  porcento,
  decimal,
  comSinal,
  nomeDoMes,
  periodoPorExtenso,
  multiploDeAlcance,
  temDados,
} from "@/lib/relatorio";
import type { Comparativo, Destaque, Fatia, PontoHora } from "@/lib/relatorio";
import {
  GraficoHorarios,
  GraficoPizza,
  GraficoBarras,
  ListaComBarra,
  BarraComposicao,
} from "./graficos";

export type DestaqueResolvido = Destaque & { src?: string };

export type DadosDeck = {
  cliente: string;
  projeto: string;
  ano: number;
  mes: number;

  posts: number;
  feeds: number;
  reels: number;
  stories: number;
  visualizacoes: number;
  alcance: number;
  mediaViewReels: number;
  mediaViewStories: number;
  freqExibicao: number;
  taxaEngajamento: number;
  taxaCrescimento: number;
  formatoTop: string | null;

  seguidores: number;
  seguidoresDelta: number;
  idades: Fatia[];
  localizacoes: Fatia[];
  generos: Fatia[];
  horarios: PontoHora[];
  notaAudiencia: string | null;

  topVisualizacoes: DestaqueResolvido[];
  piorVisualizacoes: DestaqueResolvido[];
  topInteracoes: DestaqueResolvido[];
  piorInteracoes: DestaqueResolvido[];

  conclusao: string | null;
  fonte: string;
  comparativos: Comparativo[];
};

/* -------------------------------------------------------------- primitivas */

function Slide({
  children,
  variante = "claro",
  numeroSlide,
}: {
  children: React.ReactNode;
  variante?: "claro" | "roxo" | "escuro";
  numeroSlide?: number;
}) {
  const fundo =
    variante === "roxo"
      ? "bg-[linear-gradient(135deg,#8013A8_0%,#6E327C_100%)] text-white"
      : variante === "escuro"
        ? "bg-[#15101A] text-[#F3EEF6]"
        : "bg-white text-[#231A28]";

  return (
    <div className="deck-slide-wrap">
      <section className={`deck-slide relative overflow-hidden ${fundo}`}>
        {children}
        <div
          className={`absolute bottom-[2.2em] left-[4em] right-[4em] flex items-center justify-between text-[1.05em] tracking-[0.2em] ${
            variante === "claro" ? "text-[#9A8FA3]" : "text-white/45"
          }`}
        >
          <span>{numeroSlide ? String(numeroSlide).padStart(2, "0") : ""}</span>
          <span>NIX</span>
        </div>
      </section>
    </div>
  );
}

function Titulo({ children, claro = false }: { children: React.ReactNode; claro?: boolean }) {
  return (
    <h2
      className={`deck-display text-[6.4em] leading-[0.92] ${
        claro ? "text-white" : "text-[#8013A8]"
      }`}
    >
      {children}
    </h2>
  );
}

/** O bloco de rótulo violeta sobre o número — a marca visual destes relatórios. */
function Metrica({
  rotulo,
  valor,
  tom = "roxo",
  nota,
}: {
  rotulo: string;
  valor: string;
  tom?: "roxo" | "escuro" | "ambar";
  nota?: string;
}) {
  const fundo =
    tom === "escuro" ? "bg-[#15101A]" : tom === "ambar" ? "bg-[#FB7601]" : "bg-[#8013A8]";
  return (
    <div className="min-w-0">
      <div className={`${fundo} px-[1.1em] py-[0.55em]`}>
        <span className="text-[1.25em] font-bold uppercase leading-tight tracking-[0.04em] text-white">
          {rotulo}
        </span>
      </div>
      <p className="mt-[0.7em] text-[2.5em] font-bold leading-none tabular-nums text-[#231A28]">
        {valor}
      </p>
      {nota && <p className="mt-[0.45em] text-[1.05em] text-[#6E6377]">{nota}</p>}
    </div>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[0.9em] border border-[#231A28] p-[1.5em]">
      <span className="inline-block rounded-[0.5em] bg-[#F2ECF4] px-[0.9em] py-[0.3em] text-[1.15em] font-bold uppercase tracking-[0.1em] text-[#8013A8]">
        {titulo}
      </span>
      <div className="mt-[1.2em]">{children}</div>
    </div>
  );
}

/** Miniatura de post. Sem imagem, o próprio bloco carrega o rótulo. */
function Miniatura({ d, tom }: { d: DestaqueResolvido; tom: "alta" | "baixa" }) {
  const cor = tom === "alta" ? "bg-[#B910FF]" : "bg-[#6E327C]";
  const temImagem = !!(d.src || d.imagemUrl);

  return (
    <figure className="flex min-w-0 flex-col gap-[0.6em]">
      {tom === "alta" && (
        <span
          className={`${cor} self-start px-[0.9em] py-[0.28em] text-[1.35em] font-bold tabular-nums text-white`}
        >
          {numero(d.valor)}
        </span>
      )}
      <div className="relative aspect-square w-full overflow-hidden bg-[#F2ECF4]">
        {d.src ? (
          <Image src={d.src} alt="" fill sizes="240px" className="object-cover" unoptimized />
        ) : d.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imagemUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#8013A8_0%,#6E327C_100%)]">
            <span className="deck-display text-[3.2em] text-white/85">{d.rotulo}</span>
          </div>
        )}
      </div>
      {/* Sem imagem o rótulo já está dentro do bloco; repetir embaixo é ruído. */}
      {temImagem && (
        <figcaption className="deck-display text-[1.7em] text-[#231A28]">{d.rotulo}</figcaption>
      )}
      {tom === "baixa" && (
        <span
          className={`${cor} self-start px-[0.9em] py-[0.28em] text-[1.35em] font-bold tabular-nums text-white`}
        >
          {numero(d.valor)}
        </span>
      )}
      {d.nota && <p className="text-[1.05em] leading-snug text-[#6E6377]">{d.nota}</p>}
    </figure>
  );
}

function SlideDesempenho({
  titulo,
  topo,
  piores,
  rotuloPiores,
  numeroSlide,
}: {
  titulo: string;
  topo: DestaqueResolvido[];
  piores: DestaqueResolvido[];
  rotuloPiores: string;
  numeroSlide: number;
}) {
  return (
    <Slide numeroSlide={numeroSlide}>
      <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
        <Titulo>{titulo}</Titulo>
        <p className="mt-[0.5em] text-[1.5em] text-[#4E4257]">Reels e posts estáticos</p>

        <div className="mt-[2.2em] grid min-h-0 flex-1 grid-cols-[1fr_auto_0.68fr] gap-[2.2em]">
          <div className="grid grid-cols-3 gap-[1.4em]">
            {topo.map((d, i) => (
              <Miniatura key={i} d={d} tom="alta" />
            ))}
          </div>

          <div className="w-px bg-[#E5DBE9]" />

          <div className="flex flex-col">
            <span className="self-end bg-[#8013A8] px-[1em] py-[0.35em] text-[1.15em] font-bold uppercase tracking-[0.08em] text-white">
              {rotuloPiores}
            </span>
            <div className="mt-[1.2em] grid grid-cols-2 gap-[1.4em]">
              {piores.map((d, i) => (
                <Miniatura key={i} d={d} tom="baixa" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
}

/* ------------------------------------------------------------------- deck */

export function Deck({ d }: { d: DadosDeck }) {
  const multiplo = multiploDeAlcance(d.alcance, d.seguidores);
  const mesNome = nomeDoMes(d.mes);

  const principais = d.comparativos
    .filter((c) => ["visualizacoes", "interacoes", "curtidas"].includes(c.chave))
    .filter(temDados);
  const secundarios = d.comparativos
    .filter((c) => ["comentarios", "compartilhamentos", "salvos", "cliquesLink"].includes(c.chave))
    .filter(temDados);

  const bullets = (d.conclusao ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <div className="deck">
      {/* 01 — Capa ------------------------------------------------------- */}
      <Slide variante="roxo">
        <div
          aria-hidden
          className="deck-display pointer-events-none absolute right-[1.4em] top-1/2 flex -translate-y-1/2 flex-col text-[11em] leading-[0.78] text-white/[0.13]"
        >
          {String(d.ano)
            .split("")
            .map((n, i) => (
              <span key={i}>{n}</span>
            ))}
        </div>
        <div className="relative flex h-full flex-col justify-center px-[6em]">
          <svg viewBox="0 0 873.4 806.4" className="h-[5.4em] w-[5.4em]" aria-hidden="true">
            <circle cx="400" cy="406.4" r="322.46" fill="none" stroke="#fff" strokeWidth="155.08" />
            <circle cx="400" cy="406.4" r="82.92" fill="#fff" />
            <circle cx="728.44" cy="144.92" r="144.96" fill="#FFAB00" />
          </svg>
          <h1 className="deck-display mt-[0.5em] text-[8.6em] leading-[0.88] text-white">
            Relatório de
            <br />
            resultados
          </h1>
          <div className="mt-[3em]">
            <p className="text-[1.2em] uppercase tracking-[0.24em] text-white/65">Cliente</p>
            <p className="mt-[0.25em] text-[2.1em] font-bold leading-tight text-white">
              {d.cliente}
            </p>
            <p className="mt-[0.6em] text-[1.35em] text-white/75">
              {mesNome} de {d.ano}
            </p>
          </div>
        </div>
      </Slide>

      {/* 02 — Destaques -------------------------------------------------- */}
      <Slide numeroSlide={2}>
        <div className="flex h-full flex-col justify-center px-[5em] pb-[4em]">
          <p className="text-[1.3em] uppercase tracking-[0.24em] text-[#8013A8]">
            {periodoPorExtenso(d.ano, d.mes)}
          </p>
          <Titulo>Os números do mês</Titulo>

          <div className="mt-[2.6em] grid grid-cols-3 gap-[2.4em]">
            {[
              { v: numero(d.visualizacoes), r: "Visualizações" },
              { v: numero(d.alcance), r: "Contas alcançadas" },
              { v: comSinal(d.seguidoresDelta), r: "Seguidores no mês" },
            ].map((x) => (
              <div key={x.r}>
                <p className="deck-display text-[5.2em] leading-none text-[#231A28]">{x.v}</p>
                <div className="mt-[0.5em] h-[0.28em] w-[3.2em] bg-[#FFAB00]" />
                <p className="mt-[0.7em] text-[1.35em] text-[#4E4257]">{x.r}</p>
              </div>
            ))}
          </div>

          {multiplo && (
            <p className="mt-[3em] max-w-[46em] text-[1.5em] leading-relaxed text-[#4E4257]">
              O alcance de <strong className="text-[#231A28]">{numero(d.alcance)} contas</strong>{" "}
              com {numero(d.seguidores)} seguidores significa que o conteúdo saiu da própria base{" "}
              <strong className="text-[#8013A8]">{decimal(multiplo, 1)} vezes</strong>.
            </p>
          )}
        </div>
      </Slide>

      {/* 03 — Visão geral ------------------------------------------------ */}
      <Slide numeroSlide={3}>
        <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
          <Titulo>Visão geral</Titulo>
          <p className="mt-[0.3em] text-[1.6em] font-bold uppercase tracking-[0.02em] text-[#231A28]">
            {periodoPorExtenso(d.ano, d.mes)}
          </p>

          <div className="mt-[2.2em] grid flex-1 grid-cols-[0.9fr_1fr_1fr] gap-[2.2em]">
            <div>
              <div className="bg-[#6E327C] px-[1.1em] py-[0.55em]">
                <span className="text-[1.25em] font-bold uppercase tracking-[0.04em] text-white">
                  Número de posts
                </span>
              </div>
              <p className="deck-display mt-[0.4em] text-[6em] leading-none text-[#231A28]">
                {numero(d.posts)}
              </p>
              <div className="mt-[1em]">
                <BarraComposicao
                  partes={[
                    { rotulo: "Feeds", valor: d.feeds },
                    { rotulo: "Reels", valor: d.reels },
                    { rotulo: "Stories", valor: d.stories },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <Metrica rotulo="Média de visualização · reels" valor={numero(d.mediaViewReels)} />
              <Metrica
                rotulo="Taxa de engajamento do perfil"
                valor={porcento(d.taxaEngajamento)}
              />
              <Metrica rotulo="Média de visualização · stories" valor={numero(d.mediaViewStories)} />
            </div>

            <div className="flex flex-col justify-between">
              <Metrica rotulo="Frequência de exibição" valor={decimal(d.freqExibicao)} />
              <Metrica
                rotulo="Taxa de crescimento de seguidores"
                valor={`${d.taxaCrescimento >= 0 ? "+" : "−"}${porcento(Math.abs(d.taxaCrescimento))}`}
              />
              <Metrica
                rotulo="Formato com maior engajamento"
                valor={d.formatoTop || "—"}
                tom="ambar"
              />
            </div>
          </div>
        </div>
      </Slide>

      {/* 04 — Audiência -------------------------------------------------- */}
      <Slide numeroSlide={4}>
        <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
          <div className="flex items-start justify-between gap-[3em]">
            <Titulo>Audiência</Titulo>
            <div className="shrink-0 text-right">
              <div className="bg-[#6E327C] px-[1.2em] py-[0.5em]">
                <span className="text-[1.25em] font-bold uppercase tracking-[0.04em] text-white">
                  Número de seguidores
                </span>
              </div>
              <p className="deck-display mt-[0.3em] text-[5.4em] leading-none text-[#231A28]">
                {numero(d.seguidores)}
              </p>
              <p className="mt-[0.3em] text-[1.15em] text-[#6E6377]">
                {comSinal(d.seguidoresDelta)} em relação ao mês anterior
              </p>
            </div>
          </div>

          <div className="mt-[2em] grid flex-1 grid-cols-3 gap-[1.8em]">
            <Cartao titulo="Idade">
              <ListaComBarra fatias={d.idades} />
            </Cartao>
            <Cartao titulo="Localizações">
              <ListaComBarra fatias={d.localizacoes} />
            </Cartao>
            <Cartao titulo="Gênero">
              {d.generos.length ? (
                <GraficoPizza fatias={d.generos} />
              ) : (
                <p className="text-[12px] text-[#9A8FA3]">Não preenchido.</p>
              )}
            </Cartao>
          </div>

          {d.notaAudiencia && (
            <p className="mt-[1.4em] max-w-[62em] text-[1.25em] leading-relaxed text-[#4E4257]">
              {d.notaAudiencia}
            </p>
          )}
        </div>
      </Slide>

      {/* 05 — Horários --------------------------------------------------- */}
      {d.horarios.length >= 2 && (
        <Slide numeroSlide={5}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Horários</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              Seguidores online por hora do dia
            </p>
            <div className="mt-[1.6em] flex-1">
              <GraficoHorarios pontos={d.horarios} />
            </div>
          </div>
        </Slide>
      )}

      {/* 06 e 07 — Desempenho -------------------------------------------- */}
      {d.topVisualizacoes.length > 0 && (
        <SlideDesempenho
          numeroSlide={6}
          titulo="Desempenho de visualizações"
          topo={d.topVisualizacoes}
          piores={d.piorVisualizacoes}
          rotuloPiores="Top 2 menor visualização"
        />
      )}
      {d.topInteracoes.length > 0 && (
        <SlideDesempenho
          numeroSlide={7}
          titulo="Desempenho de interações"
          topo={d.topInteracoes}
          piores={d.piorInteracoes}
          rotuloPiores="Top 2 menor interação"
        />
      )}

      {/* 08 e 09 — Comparativos ------------------------------------------ */}
      {principais.length > 0 && (
        <Slide numeroSlide={8}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Comparativos</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              {d.ano} · o mês do relatório aparece em âmbar
            </p>
            <div className="mt-[1.6em] grid min-h-0 flex-1 grid-cols-3 gap-[2em]">
              {principais.map((c) => (
                <GraficoBarras key={c.chave} serie={c.serie} titulo={c.titulo} destaque={d.mes} />
              ))}
            </div>
          </div>
        </Slide>
      )}

      {secundarios.length > 0 && (
        <Slide numeroSlide={9}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Comparativos</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              Interações detalhadas por mês
            </p>
            <div className="mt-[1.6em] grid min-h-0 flex-1 grid-cols-4 gap-[1.6em]">
              {secundarios.map((c) => (
                <GraficoBarras key={c.chave} serie={c.serie} titulo={c.titulo} destaque={d.mes} />
              ))}
            </div>
          </div>
        </Slide>
      )}

      {/* 10 — Conclusão --------------------------------------------------- */}
      {bullets.length > 0 && (
        <Slide numeroSlide={10}>
          <div className="flex h-full gap-[3em] px-[4em] pb-[5em] pt-[3.4em]">
            <div className="flex min-w-0 flex-1 flex-col">
              <Titulo>Conclusão</Titulo>
              <ul className="mt-[1.4em] flex flex-col gap-[0.8em]">
                {bullets.map((b, i) => (
                  <li key={i} className="flex gap-[0.8em] text-[1.32em] leading-[1.45]">
                    <span className="mt-[0.55em] h-[0.42em] w-[0.42em] shrink-0 rounded-full bg-[#8013A8]" />
                    <span className="text-[#231A28]">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex w-[26%] shrink-0 items-center justify-center bg-[linear-gradient(135deg,#8013A8_0%,#6E327C_100%)]">
              <svg viewBox="0 0 873.4 806.4" className="w-[58%]" aria-hidden="true">
                <circle cx="400" cy="406.4" r="322.46" fill="none" stroke="#fff" strokeWidth="155.08" />
                <circle cx="400" cy="406.4" r="82.92" fill="#fff" />
                <circle cx="728.44" cy="144.92" r="144.96" fill="#FFAB00" />
              </svg>
            </div>
          </div>
        </Slide>
      )}

      {/* 11 — Obrigado ---------------------------------------------------- */}
      <Slide variante="roxo">
        <div
          aria-hidden
          className="deck-display pointer-events-none absolute left-[1.4em] top-1/2 flex -translate-y-1/2 flex-col text-[11em] leading-[0.78] text-white/[0.10]"
        >
          {String(d.ano)
            .split("")
            .map((n, i) => (
              <span key={i}>{n}</span>
            ))}
        </div>
        <div className="relative flex h-full flex-col items-center justify-center">
          <svg viewBox="0 0 873.4 806.4" className="h-[6.5em] w-[6.5em]" aria-hidden="true">
            <circle cx="400" cy="406.4" r="322.46" fill="none" stroke="#fff" strokeWidth="155.08" />
            <circle cx="400" cy="406.4" r="82.92" fill="#fff" />
            <circle cx="728.44" cy="144.92" r="144.96" fill="#FFAB00" />
          </svg>
          <p className="deck-display mt-[0.35em] text-[7.5em] leading-none text-white">Obrigado</p>
          <p className="mt-[1.6em] text-[1.3em] uppercase tracking-[0.3em] text-white/60">
            Agência NIX · {d.cliente}
          </p>
        </div>
      </Slide>
    </div>
  );
}
