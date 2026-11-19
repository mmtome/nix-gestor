/**
 * O deck do relatório de resultados.
 *
 * Slides 16:9 no padrão das apresentações que a agência já entrega. Os que
 * dependem de dado opcional (horários, destaques, formatos, comunidade,
 * comparativos, conclusão) só aparecem quando há dado, e a numeração segue o
 * que foi impresso.
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
  duracao,
} from "@/lib/relatorio";
import type {
  Comparativo,
  Destaque,
  ExtrasRelatorio,
  Fatia,
  MediaPorGrupo,
  PontoHora,
} from "@/lib/relatorio";
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
  extras: ExtrasRelatorio;
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

/**
 * O ano em pé, como marca d'água das capas. Cada algarismo tem posição fixa
 * num SVG: empilhar spans com entrelinha apertada dependia da métrica da
 * fonte, e em algumas telas e na impressão os números se sobrepunham.
 */
function AnoVertical({ ano, className, opacidade }: { ano: number; className: string; opacidade: number }) {
  const digitos = String(ano).split("");
  const PASSO = 96;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 64 ${digitos.length * PASSO}`}
      className={`pointer-events-none absolute top-1/2 h-[40em] -translate-y-1/2 overflow-visible ${className}`}
    >
      {digitos.map((n, i) => (
        <text
          key={i}
          x="32"
          y={(i + 1) * PASSO - 10}
          textAnchor="middle"
          fontSize="104"
          className="deck-display"
          fill="#fff"
          fillOpacity={opacidade}
        >
          {n}
        </text>
      ))}
    </svg>
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

/** Barras horizontais de média por post; a maior em âmbar. */
function BarrasMedia({ grupos }: { grupos: MediaPorGrupo[] }) {
  const max = Math.max(...grupos.map((g) => g.interacoes), 1);
  return (
    <ul className="flex flex-col gap-[0.55em]">
      {grupos.map((g) => (
        <li key={g.rotulo} className="grid grid-cols-[9.5em_1fr_4.2em] items-center gap-[0.8em] text-[1.1em]">
          <span className="truncate text-[#4E4257]">{g.rotulo}</span>
          <div className="h-[0.55em] overflow-hidden rounded-full bg-[#EFE7F3]">
            <div
              className={`h-full rounded-full ${g.interacoes === max ? "bg-[#FFAB00]" : "bg-[#8013A8]"}`}
              style={{ width: `${(g.interacoes / max) * 100}%` }}
            />
          </div>
          <span className="text-right font-semibold tabular-nums text-[#231A28]">{numero(g.interacoes)}</span>
        </li>
      ))}
    </ul>
  );
}

const TIPOS: Record<string, string> = {
  STORY: "Stories",
  REEL: "Reels",
  POST: "Posts",
  CAROUSEL_CONTAINER: "Carrosséis",
  AD: "Anúncios",
};

/* ------------------------------------------------------------------- deck */

export function Deck({ d }: { d: DadosDeck }) {
  const multiplo = multiploDeAlcance(d.alcance, d.seguidores);
  const ex = d.extras;
  const com = ex.comunidade;
  const porTipo = Object.entries(ex.viewsPorTipo ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  // Numeração na ordem do que aparece: slide sem dado não deixa buraco.
  let contador = 1;
  const proximo = () => ++contador;
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
        <AnoVertical ano={d.ano} className="right-[9em]" opacidade={0.13} />
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
      <Slide numeroSlide={proximo()}>
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

          {porTipo.length > 1 && (
            <div className="mt-[2.2em] flex flex-wrap gap-[1em]">
              {porTipo.map(([tipo, v]) => (
                <span key={tipo} className="rounded-[0.5em] bg-[#F2ECF4] px-[1em] py-[0.45em] text-[1.2em] text-[#4E4257]">
                  <strong className="tabular-nums text-[#231A28]">{numero(v)}</strong> visualizações em{" "}
                  {(TIPOS[tipo] ?? tipo).toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      </Slide>

      {/* 03 — Visão geral ------------------------------------------------ */}
      <Slide numeroSlide={proximo()}>
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
                    // Stories só entram quando alguém preencheu: a API não os guarda.
                    ...(d.stories ? [{ rotulo: "Stories", valor: d.stories }] : []),
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
              <Metrica
                rotulo="Média de visualização · stories"
                valor={d.mediaViewStories ? numero(d.mediaViewStories) : "—"}
                nota={ex.respostasStories ? `${numero(ex.respostasStories)} respostas aos stories` : undefined}
              />
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
      <Slide numeroSlide={proximo()}>
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
        <Slide numeroSlide={proximo()}>
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
          numeroSlide={proximo()}
          titulo="Desempenho de visualizações"
          topo={d.topVisualizacoes}
          piores={d.piorVisualizacoes}
          rotuloPiores="Top 2 menor visualização"
        />
      )}
      {d.topInteracoes.length > 0 && (
        <SlideDesempenho
          numeroSlide={proximo()}
          titulo="Desempenho de interações"
          topo={d.topInteracoes}
          piores={d.piorInteracoes}
          rotuloPiores="Top 2 menor interação"
        />
      )}

      {/* Formatos e horários --------------------------------------------- */}
      {(ex.formatos?.length ?? 0) > 0 && (
        <Slide numeroSlide={proximo()}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Formatos e horários</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              Média por post publicado no mês
            </p>

            <div className="mt-[2em] grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] gap-[2.6em]">
              <div>
                <div className="grid grid-cols-[1.4fr_0.6fr_1fr_1fr] bg-[#8013A8] px-[1em] py-[0.6em] text-[1.1em] font-bold uppercase tracking-[0.04em] text-white">
                  <span>Formato</span>
                  <span className="text-right">Posts</span>
                  <span className="text-right">Visualizações</span>
                  <span className="text-right">Interações</span>
                </div>
                {ex.formatos!.map((f, i) => (
                  <div
                    key={f.rotulo}
                    className="grid grid-cols-[1.4fr_0.6fr_1fr_1fr] items-baseline border-b border-[#E5DBE9] px-[1em] py-[0.9em] text-[1.45em] tabular-nums"
                  >
                    <span className={`font-bold ${i === 0 ? "text-[#FB7601]" : "text-[#231A28]"}`}>{f.rotulo}</span>
                    <span className="text-right text-[#4E4257]">{numero(f.posts)}</span>
                    <span className="text-right text-[#231A28]">{numero(f.views)}</span>
                    <span className="text-right font-bold text-[#231A28]">{numero(f.interacoes)}</span>
                  </div>
                ))}
                <p className="mt-[1em] text-[1.05em] text-[#6E6377]">
                  Em laranja, o formato com mais interações por post.
                </p>
              </div>

              <div className="flex min-h-0 flex-col gap-[1.4em]">
                {(ex.dias?.length ?? 0) > 0 && (
                  <Cartao titulo="Interações por dia da postagem">
                    <BarrasMedia grupos={ex.dias!} />
                  </Cartao>
                )}
                {(ex.faixas?.length ?? 0) > 0 && (
                  <Cartao titulo="Interações por horário da postagem">
                    <BarrasMedia grupos={ex.faixas!} />
                  </Cartao>
                )}
              </div>
            </div>
          </div>
        </Slide>
      )}

      {/* Comunidade ------------------------------------------------------- */}
      {com && com.comentarios > 0 && (
        <Slide numeroSlide={proximo()}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Comunidade</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              Comentários nos posts do mês, sem contar os da própria conta
            </p>

            <div className="mt-[1.8em] grid grid-cols-4 gap-[1.8em]">
              <Metrica
                rotulo="Comentários"
                valor={numero(com.comentarios)}
                nota={com.perguntas ? `${numero(com.perguntas)} com pergunta` : undefined}
              />
              <Metrica rotulo="Pessoas diferentes" valor={numero(com.pessoas)} />
              <Metrica
                rotulo="Respondidos pela conta"
                valor={porcento((com.respondidos / com.comentarios) * 100, 1)}
                nota={`${numero(com.respondidos)} comentários`}
              />
              <Metrica
                rotulo="Tempo de resposta"
                valor={com.tempoRespostaMin != null ? duracao(com.tempoRespostaMin) : "—"}
                nota="mediana até a resposta da conta"
                tom="ambar"
              />
            </div>

            <div className="mt-[2em] grid min-h-0 flex-1 grid-cols-3 gap-[1.8em]">
              <Cartao titulo="Quem mais comentou">
                <ul className="flex flex-col gap-[0.6em]">
                  {com.topPessoas.map((p) => (
                    <li key={p.rotulo} className="flex items-baseline justify-between gap-[1em] text-[1.25em]">
                      <span className="truncate text-[#231A28]">{p.rotulo}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#8013A8]">{numero(p.n)}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
              <Cartao titulo="O que mais aparece">
                <div className="flex flex-wrap gap-[0.5em]">
                  {com.palavras.map((p) => (
                    <span key={p.rotulo} className="rounded-[0.4em] bg-[#F2ECF4] px-[0.7em] py-[0.25em] text-[1.1em] text-[#4E4257]">
                      {p.rotulo} <strong className="tabular-nums text-[#231A28]">{p.n}</strong>
                    </span>
                  ))}
                </div>
                {com.emojis.length > 0 && (
                  <p className="mt-[1em] flex flex-wrap gap-[0.9em] text-[1.5em]">
                    {com.emojis.map((e) => (
                      <span key={e.rotulo}>
                        {e.rotulo}
                        <span className="ml-[0.2em] text-[0.7em] tabular-nums text-[#6E6377]">{e.n}</span>
                      </span>
                    ))}
                  </p>
                )}
              </Cartao>
              <Cartao titulo="Mais curtidos">
                <ul className="flex flex-col gap-[0.9em]">
                  {com.maisCurtidos.map((c, i) => (
                    <li key={i} className="text-[1.1em] leading-snug">
                      <p className="text-[#231A28]">“{c.texto}”</p>
                      <p className="mt-[0.2em] text-[0.9em] text-[#6E6377]">
                        {c.usuario} · {numero(c.curtidas)} curtidas
                      </p>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </div>
          </div>
        </Slide>
      )}

      {/* 08 e 09 — Comparativos ------------------------------------------ */}
      {principais.length > 0 && (
        <Slide numeroSlide={proximo()}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Comparativos</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              {d.ano} · o mês do relatório aparece em âmbar
            </p>
            <div
              className="mt-[1.6em] grid min-h-0 flex-1 gap-[2em]"
              style={{ gridTemplateColumns: `repeat(${principais.length}, minmax(0, 1fr))` }}
            >
              {principais.map((c) => (
                <GraficoBarras key={c.chave} serie={c.serie} titulo={c.titulo} destaque={d.mes} />
              ))}
            </div>
          </div>
        </Slide>
      )}

      {secundarios.length > 0 && (
        <Slide numeroSlide={proximo()}>
          <div className="flex h-full flex-col px-[4em] pb-[5em] pt-[3.4em]">
            <Titulo>Comparativos</Titulo>
            <p className="mt-[0.4em] text-[1.4em] text-[#4E4257]">
              Interações detalhadas por mês
            </p>
            <div
              className="mt-[1.6em] grid min-h-0 flex-1 gap-[1.6em]"
              style={{ gridTemplateColumns: `repeat(${secundarios.length}, minmax(0, 1fr))` }}
            >
              {secundarios.map((c) => (
                <GraficoBarras key={c.chave} serie={c.serie} titulo={c.titulo} destaque={d.mes} />
              ))}
            </div>
          </div>
        </Slide>
      )}

      {/* 10 — Conclusão --------------------------------------------------- */}
      {bullets.length > 0 && (
        <Slide numeroSlide={proximo()}>
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
        <AnoVertical ano={d.ano} className="left-[13em]" opacidade={0.1} />
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
