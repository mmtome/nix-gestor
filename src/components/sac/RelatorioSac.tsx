"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet, StickyNote, MessageCircle } from "lucide-react";
import { fmtTZ } from "@/lib/dates";
import type { SacStatus } from "@/lib/sac/core";
import type { ItemRelatorio, Quebra, RelatorioSac as Dados } from "@/lib/sac/relatorio";
import { NOME_STATUS, type TipoTag } from "@/lib/sac/tipos";
import { duracao } from "./pecas";

/* ============================================================================
   Relatório do SAC. A barra de cima (período, filtros, downloads) é do app; a
   folha é clara, igual na tela e no PDF ("Baixar PDF" abre a impressão do
   navegador — A4 retrato, ver .folha-sac em globals.css). "Baixar planilha"
   gera um CSV que abre direto no Excel.
   ========================================================================== */

// Cores de status sobre a folha branca (validadas para daltonismo; sempre com nome e número ao lado).
const COR_STATUS: Record<SacStatus, string> = {
  novo: "#D4920A",
  respondido_grupo: "#8013A8",
  resolvido: "#0B6E47",
  arquivado: "#A39BAA",
};
const ORDEM: SacStatus[] = ["novo", "respondido_grupo", "resolvido", "arquivado"];
const TITULO_GRUPO: Record<SacStatus, string> = {
  novo: "Sem resposta (aguardando)",
  respondido_grupo: "Respondidas no grupo — falta repassar ao cliente",
  resolvido: "Resolvidas",
  arquivado: "Arquivadas (descartadas ou print apagado)",
};
const COMO: Record<string, string> = {
  reacao: "reação no grupo",
  resposta: "resposta “ok” no grupo",
  gestor: "pelo gestor",
  sistema: "automático",
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const dataHora = (iso: string) => fmtTZ(new Date(iso), "dd/MM/yyyy HH:mm");

function periodo(de: string, ate: string) {
  const a = new Date(`${de}T12:00:00Z`);
  const b = new Date(`${ate}T12:00:00Z`);
  if (de === ate) return fmtTZ(a, "d 'de' MMMM 'de' yyyy");
  if (de.slice(0, 7) === ate.slice(0, 7)) return `${fmtTZ(a, "d")} a ${fmtTZ(b, "d 'de' MMMM 'de' yyyy")}`;
  return `${fmtTZ(a, "dd/MM/yyyy")} a ${fmtTZ(b, "dd/MM/yyyy")}`;
}

export function RelatorioSac({
  dados,
  hoje,
  tags,
}: {
  dados: Dados;
  hoje: string;
  tags: { slug: string; type: TipoTag; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [prints, setPrints] = useState(true);
  const f = dados.filtros;
  const n = dados.numeros;

  function navegar(muda: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(muda)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`/sac/relatorio?${p.toString()}`, { scroll: false });
  }

  function atalho(qual: "mes" | "passado" | "7" | "30") {
    const [a, m] = hoje.split("-").map(Number);
    const menos = (dias: number) =>
      new Date(Date.UTC(a, m - 1, Number(hoje.slice(8)) - dias, 12)).toISOString().slice(0, 10);
    if (qual === "mes") return navegar({ de: `${hoje.slice(0, 8)}01`, ate: hoje });
    if (qual === "passado") {
      const ini = new Date(Date.UTC(a, m - 2, 1, 12)).toISOString().slice(0, 10);
      const fim = new Date(Date.UTC(a, m - 1, 0, 12)).toISOString().slice(0, 10);
      return navegar({ de: ini, ate: fim });
    }
    navegar({ de: menos(Number(qual) - 1), ate: hoje });
  }

  const filtrosAtivos = (["canal", "categoria", "evento"] as const)
    .filter((k) => f[k])
    .map((k) => tags.find((t) => t.slug === f[k])?.label ?? `#${f[k]}`);

  return (
    <div className="print:bg-white">
      {/* Barra de controles (some no PDF) */}
      <div className="sticky top-0 z-10 border-b border-line bg-ink/95 px-6 py-3 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/sac" className="mr-2 inline-flex items-center gap-1 text-[12px] text-faint transition hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" /> Quadro
          </Link>
          {(
            [
              ["mes", "Este mês"],
              ["passado", "Mês passado"],
              ["7", "7 dias"],
              ["30", "30 dias"],
            ] as const
          ).map(([k, nome]) => (
            <button key={k} onClick={() => atalho(k)} className="btn-ghost px-2.5 py-1 text-[12px]">
              {nome}
            </button>
          ))}
          <input
            type="date"
            value={f.de}
            max={f.ate}
            onChange={(e) => e.target.value && navegar({ de: e.target.value })}
            className="field w-auto! py-1! text-[12.5px]!"
          />
          <span className="text-[12px] text-faint">a</span>
          <input
            type="date"
            value={f.ate}
            min={f.de}
            onChange={(e) => e.target.value && navegar({ ate: e.target.value })}
            className="field w-auto! py-1! text-[12.5px]!"
          />
          {(["canal", "categoria", "evento"] as const).map((tipo) => {
            const opcoes = tags.filter((t) => t.type === tipo);
            if (!opcoes.length) return null;
            return (
              <select
                key={tipo}
                value={f[tipo]}
                onChange={(e) => navegar({ [tipo]: e.target.value })}
                className={`field w-auto! py-1! text-[12.5px]! ${f[tipo] ? "border-accent!" : ""}`}
              >
                <option value="">
                  {tipo === "canal" ? "Todos os canais" : tipo === "categoria" ? "Todas as categorias" : "Todos os eventos"}
                </option>
                {opcoes.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            );
          })}
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-dim">
            <input type="checkbox" checked={prints} onChange={(e) => setPrints(e.target.checked)} className="accent-[#8013a8]" />
            Prints na lista
          </label>
          <span className="flex-1" />
          <button onClick={() => baixarPlanilha(dados)} className="btn-ghost py-1.5 text-[12px]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Baixar planilha
          </button>
          <button onClick={() => window.print()} className="btn-primary py-1.5 text-[12.5px]">
            <Download className="h-3.5 w-3.5" /> Baixar PDF
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-faint">
          “Baixar PDF” abre a impressão do navegador — escolha <b>Salvar como PDF</b>. A planilha traz uma linha por
          dúvida, com as respostas e as notas.
        </p>
      </div>

      {/* Folha */}
      <div className="px-6 py-6 print:p-0">
        <article className="folha-sac mx-auto max-w-[920px] rounded-lg bg-white px-10 py-9 text-[13px] leading-relaxed text-[#1d1724] shadow-2xl">
          <header className="flex items-start justify-between gap-6 border-b border-[#e7e2eb] pb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8013A8]">NIX · SAC</p>
              <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Relatório de atendimento</h1>
              <p className="mt-0.5 text-[14px] text-[#4a4252]">{periodo(f.de, f.ate)}</p>
              {filtrosAtivos.length > 0 && (
                <p className="mt-1 text-[12px] text-[#6f6678]">Filtro: {filtrosAtivos.join(" · ")}</p>
              )}
            </div>
            <p className="text-right text-[11px] text-[#6f6678]">
              Gerado em
              <br />
              {dataHora(dados.geradoEm)}
            </p>
          </header>

          {n.recebidos === 0 ? (
            <p className="py-16 text-center text-[#6f6678]">Nenhuma dúvida recebida neste período.</p>
          ) : (
            <>
              {dados.cortado && (
                <p className="mt-4 rounded bg-[#fff5e0] px-3 py-2 text-[12px] text-[#7a5200]">
                  O período tem muitas dúvidas: o relatório mostra as primeiras 3.000. Use um período menor.
                </p>
              )}

              {/* 1. Resumo */}
              <Secao titulo="Resumo">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
                  <Numero rotulo="Dúvidas recebidas" valor={n.recebidos} nota={n.arquivados ? `${n.arquivados} arquivadas` : "nenhuma arquivada"} />
                  <Numero rotulo="Resolvidas" valor={n.resolvidos} nota={`${pct(n.resolvidos, n.validos)} das válidas`} cor={COR_STATUS.resolvido} />
                  <Numero rotulo="Respondidas no grupo" valor={n.respondidos} nota={`${pct(n.respondidos, n.validos)} · ${n.respondidoGrupo} falta repassar`} cor={COR_STATUS.respondido_grupo} />
                  <Numero rotulo="Sem resposta" valor={n.aguardando} nota={n.atrasados ? `${n.atrasados} há mais de ${dados.sla.vermelho} h` : "nenhuma atrasada"} cor={COR_STATUS.novo} />
                  <Numero rotulo="Até a 1ª resposta" valor={duracao(n.primeiraResposta.mediana)} nota={`mediana · média ${duracao(n.primeiraResposta.media)}`} />
                  <Numero rotulo="Até resolver" valor={duracao(n.resolucao.mediana)} nota={`mediana · média ${duracao(n.resolucao.media)}`} />
                  <Numero rotulo={`Respondidas em até ${dados.sla.amarelo} h`} valor={pct(n.respondidosNoPrazo, n.validos)} nota={`${n.respondidosNoPrazo} de ${n.validos}`} />
                  <Numero rotulo="Respostas escritas" valor={n.comRespostaEscrita} nota={`dúvidas com resposta dos donos · ${n.notasInternas} notas internas`} />
                </div>

                <ComposicaoStatus n={n} />

                {n.resolvidos > 0 && (
                  <p className="mt-3 text-[12px] text-[#4a4252]">
                    <b className="font-semibold text-[#1d1724]">Como foram resolvidas:</b>{" "}
                    {Object.entries(n.vias)
                      .filter(([, v]) => v > 0)
                      .map(([via, v]) => `${v} por ${COMO[via]}`)
                      .join(" · ") || "—"}
                  </p>
                )}
              </Secao>

              {/* 2. Volume */}
              <Secao titulo="Quando as dúvidas chegaram">
                <div className="grid gap-6 print:grid-cols-1">
                  <div className="evitar-quebra">
                    <p className="mb-1 text-[12px] font-semibold text-[#4a4252]">
                      Por {dados.serie.porSemana ? "semana" : "dia"}
                    </p>
                    <Barras
                      valores={dados.serie.pontos.map((p) => p.total)}
                      rotulos={dados.serie.pontos.map((p) =>
                        fmtTZ(new Date(`${p.dia}T12:00:00Z`), dados.serie.porSemana ? "dd/MM" : "d/MM"),
                      )}
                      dica={(i) =>
                        `${dados.serie.porSemana ? "Semana de " : ""}${fmtTZ(new Date(`${dados.serie.pontos[i].dia}T12:00:00Z`), "EEE, dd/MM")}: ${dados.serie.pontos[i].total}`
                      }
                    />
                  </div>
                  <div className="evitar-quebra">
                    <p className="mb-1 text-[12px] font-semibold text-[#4a4252]">Por horário (Brasília)</p>
                    <Barras
                      valores={dados.porHora}
                      rotulos={dados.porHora.map((_, h) => `${h}h`)}
                      dica={(i) => `${i}h–${i + 1}h: ${dados.porHora[i]}`}
                      altura={110}
                    />
                  </div>
                </div>
              </Secao>

              {/* 3. Quebras */}
              <Secao titulo="Por canal, categoria e evento">
                <div className="space-y-5">
                  <TabelaQuebra titulo="Canal" linhas={dados.porCanal} />
                  <TabelaQuebra titulo="Categoria" linhas={dados.porCategoria} />
                  <TabelaQuebra titulo="Evento" linhas={dados.porEvento} />
                  {dados.porPrioridade.some((p) => p.slug !== "—") && (
                    <TabelaQuebra titulo="Prioridade" linhas={dados.porPrioridade} />
                  )}
                </div>
              </Secao>

              {/* 4. Pessoas */}
              {dados.pessoas.length > 0 && (
                <Secao titulo="Quem respondeu e resolveu">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[#e7e2eb] text-left text-[11px] uppercase tracking-wider text-[#6f6678]">
                        <th className="py-1.5 font-semibold">Pessoa</th>
                        <th className="py-1.5 text-right font-semibold">Respostas escritas</th>
                        <th className="py-1.5 text-right font-semibold">Dúvidas respondidas</th>
                        <th className="py-1.5 text-right font-semibold">Resolveu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.pessoas.map((p) => (
                        <tr key={p.nome} className="border-b border-[#f0edf2]">
                          <td className="py-1.5">{p.nome}</td>
                          <td className="py-1.5 text-right tabular-nums">{p.respostas}</td>
                          <td className="py-1.5 text-right tabular-nums">{p.cards}</td>
                          <td className="py-1.5 text-right tabular-nums">{p.resolveu}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Secao>
              )}

              {/* 5. Tags não cadastradas */}
              {dados.desconhecidas.length > 0 && (
                <Secao titulo="Tags usadas que não estão cadastradas">
                  <p className="text-[12.5px] text-[#4a4252]">
                    {dados.desconhecidas.map((d) => `#${d.tag} (${d.total})`).join(" · ")}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#6f6678] print:hidden">
                    Cadastre em SAC → Configurações → Tags para elas virarem canal, categoria ou evento.
                  </p>
                </Secao>
              )}

              {/* 6. Lista */}
              {ORDEM.map((status) => {
                const lista = dados.itens.filter((i) => i.status === status);
                if (!lista.length) return null;
                return (
                  <Secao key={status} titulo={`${TITULO_GRUPO[status]} · ${lista.length}`} cor={COR_STATUS[status]}>
                    <ol className="space-y-3">
                      {lista.map((item) => (
                        <Item key={item.id} item={item} prints={prints} />
                      ))}
                    </ol>
                  </Secao>
                );
              })}
            </>
          )}
        </article>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Secao({ titulo, cor, children }: { titulo: string; cor?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: cor ?? "#8013A8" }} />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: number | string; nota: string; cor?: string }) {
  return (
    <div className="evitar-quebra rounded-md border border-[#e7e2eb] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] text-[#6f6678]">
        {cor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />}
        {rotulo}
      </p>
      <p className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight">
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
      <p className="text-[11px] leading-snug text-[#6f6678]">{nota}</p>
    </div>
  );
}

/** Barra única com a situação atual de todas as dúvidas do período. */
function ComposicaoStatus({ n }: { n: Dados["numeros"] }) {
  const partes = [
    { status: "novo" as const, v: n.aguardando },
    { status: "respondido_grupo" as const, v: n.respondidoGrupo },
    { status: "resolvido" as const, v: n.resolvidos },
    { status: "arquivado" as const, v: n.arquivados },
  ].filter((p) => p.v > 0);
  return (
    <div className="evitar-quebra mt-5">
      <p className="mb-1.5 text-[12px] font-semibold text-[#4a4252]">Situação hoje</p>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded">
        {partes.map((p) => (
          <div
            key={p.status}
            title={`${NOME_STATUS[p.status]}: ${p.v}`}
            style={{ flexGrow: p.v, backgroundColor: COR_STATUS[p.status] }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#4a4252]">
        {partes.map((p) => (
          <span key={p.status} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: COR_STATUS[p.status] }} />
            {NOME_STATUS[p.status]} <b className="font-semibold text-[#1d1724]">{p.v}</b> ({pct(p.v, n.recebidos)})
          </span>
        ))}
      </div>
    </div>
  );
}

/** Colunas simples (uma série): passar o mouse mostra o valor. */
function Barras({
  valores,
  rotulos,
  dica,
  altura = 140,
}: {
  valores: number[];
  rotulos: string[];
  dica: (i: number) => string;
  altura?: number;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 840;
  const esq = 28;
  const base = altura - 20;
  const topo = 14;
  const max = Math.max(1, ...valores);
  const passo = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const teto = Math.ceil(max / passo) * passo;
  const y = (v: number) => base - ((base - topo) * v) / teto;
  const larguraPasso = (L - esq) / valores.length;
  const largura = Math.max(2, Math.min(26, larguraPasso - 2));
  const pular = Math.ceil(valores.length / 16);
  const maior = valores.indexOf(max);
  const marcas = Array.from({ length: Math.floor(teto / passo) + 1 }, (_, i) => i * passo);

  return (
    <svg viewBox={`0 0 ${L} ${altura}`} className="w-full" role="img" aria-label={valores.map((v, i) => dica(i)).join("; ")}>
      {marcas.map((m) => (
        <g key={m}>
          <line x1={esq} x2={L} y1={y(m)} y2={y(m)} stroke={m === 0 ? "#cfc8d6" : "#efebf2"} strokeWidth={1} />
          <text x={esq - 6} y={y(m) + 3.5} textAnchor="end" fontSize={10} fill="#8a8293">
            {m}
          </text>
        </g>
      ))}
      {valores.map((v, i) => {
        const cx = esq + larguraPasso * i + larguraPasso / 2;
        const h = base - y(v);
        const r = Math.min(4, h / 2, largura / 2);
        const x = cx - largura / 2;
        return (
          <g key={i} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
            <rect x={cx - larguraPasso / 2} y={topo - 10} width={larguraPasso} height={base - topo + 10} fill="transparent" />
            {v > 0 && (
              <path
                d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + largura - r} Q${x + largura},${base - h} ${x + largura},${base - h + r} V${base} Z`}
                fill="#8013A8"
                opacity={foco === null || foco === i ? 1 : 0.45}
              >
                <title>{dica(i)}</title>
              </path>
            )}
            {(foco === i || (foco === null && i === maior && v > 0)) && (
              <text x={cx} y={base - h - 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#1d1724">
                {v}
              </text>
            )}
            {i % pular === 0 && (
              <text x={cx} y={altura - 5} textAnchor="middle" fontSize={10} fill="#8a8293">
                {rotulos[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TabelaQuebra({ titulo, linhas }: { titulo: string; linhas: Quebra[] }) {
  if (!linhas.length) return null;
  const max = Math.max(...linhas.map((l) => l.total));
  return (
    <div className="evitar-quebra">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-[#e7e2eb] text-left text-[11px] uppercase tracking-wider text-[#6f6678]">
            <th className="w-[34%] py-1.5 font-semibold">{titulo}</th>
            <th className="py-1.5 font-semibold">Dúvidas</th>
            <th className="py-1.5 text-right font-semibold">Respondidas</th>
            <th className="py-1.5 text-right font-semibold">Resolvidas</th>
            <th className="py-1.5 text-right font-semibold">Sem resposta</th>
            <th className="py-1.5 text-right font-semibold">1ª resposta</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.slug} className="border-b border-[#f0edf2]">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: l.color ?? "#cfc8d6" }} />
                  {l.label}
                </span>
              </td>
              <td className="py-1.5">
                <span className="flex items-center gap-2">
                  <span className="w-6 text-right tabular-nums">{l.total}</span>
                  <span className="h-1.5 rounded-full bg-[#8013A8]/70" style={{ width: `${(l.total / max) * 90}px` }} />
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{l.respondidos}</td>
              <td className="py-1.5 text-right tabular-nums">
                {l.resolvidos} <span className="text-[#6f6678]">({pct(l.resolvidos, l.total)})</span>
              </td>
              <td className={`py-1.5 text-right tabular-nums ${l.aguardando ? "font-semibold text-[#9a6200]" : ""}`}>
                {l.aguardando}
              </td>
              <td className="py-1.5 text-right tabular-nums">{duracao(l.medianaRespostaMin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Item({ item, prints }: { item: ItemRelatorio; prints: boolean }) {
  const como = [item.resolvidoVia ? (COMO[item.resolvidoVia] ?? item.resolvidoVia) : null, item.resolvidoPor]
    .filter(Boolean)
    .join(", ");
  const linhaTempo = [
    `Recebida ${dataHora(item.recebidoEm)}${item.remetente ? ` · ${item.remetente}` : ""}`,
    item.primeiraRespostaMin !== null ? `1ª resposta em ${duracao(item.primeiraRespostaMin)}` : null,
    item.resolvidoEm ? `resolvida em ${duracao(item.resolvidoMin)}${como ? ` (${como})` : ""}` : null,
  ].filter(Boolean);

  return (
    <li className="evitar-quebra flex gap-3 rounded-md border border-[#e7e2eb] p-3">
      {prints && item.anexos.length > 0 && (
        <div className="flex shrink-0 gap-1">
          {item.anexos.slice(0, 3).map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={`/api/sac/imagem/${id}`}
              alt=""
              loading="lazy"
              className="h-24 w-[60px] rounded border border-[#e7e2eb] object-cover object-top"
            />
          ))}
          {item.anexos.length > 3 && (
            <span className="self-end text-[10.5px] text-[#6f6678]">+{item.anexos.length - 3}</span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`font-semibold ${item.titulo ? "" : "italic text-[#6f6678]"}`}>{item.titulo || "Sem título"}</p>
          {item.selos.map((s) => (
            <span key={s.tipo} className="flex items-center gap-1 rounded border border-[#e7e2eb] px-1.5 text-[10.5px] text-[#4a4252]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color ?? "#cfc8d6" }} />
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-0.5 text-[11.5px] text-[#6f6678]">{linhaTempo.join(" · ")}</p>
        {item.legenda && item.legenda !== item.titulo && (
          <p className="mt-0.5 text-[11.5px] text-[#8a8293]">Legenda: {item.legenda}</p>
        )}
        {item.comentarios.length > 0 && (
          <ul className="mt-2 space-y-1.5 border-l-2 border-[#efebf2] pl-3">
            {item.comentarios.map((c, i) => (
              <li key={i} className="text-[12.5px]">
                <span className="flex items-center gap-1 text-[11px] text-[#6f6678]">
                  {c.fonte === "gestor" ? (
                    <StickyNote className="h-3 w-3 text-[#9a6200]" />
                  ) : (
                    <MessageCircle className="h-3 w-3 text-[#0B6E47]" />
                  )}
                  <b className="font-semibold text-[#4a4252]">{c.autor}</b>
                  {c.fonte === "gestor" ? "nota interna" : "no grupo"} · {dataHora(c.em)}
                </span>
                <span className="whitespace-pre-wrap">{c.texto}</span>
              </li>
            ))}
          </ul>
        )}
        {item.status === "novo" && item.comentarios.length === 0 && (
          <p className="mt-1.5 text-[11.5px] font-semibold text-[#9a6200]">Ninguém respondeu ainda.</p>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* planilha                                                                    */
/* -------------------------------------------------------------------------- */

function baixarPlanilha(d: Dados) {
  const cel = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const selo = (i: ItemRelatorio, tipo: TipoTag) => i.selos.find((s) => s.tipo === tipo)?.label ?? "";
  const min = (v: number | null) => (v === null ? "" : Math.round(v));
  const cabecalho = [
    "Recebida em",
    "Situação",
    "Canal",
    "Categoria",
    "Evento",
    "Prioridade",
    "Título",
    "Legenda",
    "Quem mandou",
    "1ª resposta (min)",
    "Resolvida em",
    "Até resolver (min)",
    "Resolvida por",
    "Como resolveu",
    "Respostas no grupo",
    "Notas internas",
    "Fotos",
  ];
  const linhas = d.itens.map((i) => [
    dataHora(i.recebidoEm),
    NOME_STATUS[i.status],
    selo(i, "canal"),
    selo(i, "categoria"),
    selo(i, "evento"),
    selo(i, "prioridade"),
    i.titulo,
    i.legenda,
    i.remetente,
    min(i.primeiraRespostaMin),
    i.resolvidoEm ? dataHora(i.resolvidoEm) : "",
    min(i.resolvidoMin),
    i.resolvidoPor,
    i.resolvidoVia ? (COMO[i.resolvidoVia] ?? i.resolvidoVia) : "",
    i.comentarios
      .filter((c) => c.fonte === "whatsapp")
      .map((c) => `${c.autor} (${dataHora(c.em)}): ${c.texto}`)
      .join("\n"),
    i.comentarios
      .filter((c) => c.fonte === "gestor")
      .map((c) => `${c.autor} (${dataHora(c.em)}): ${c.texto}`)
      .join("\n"),
    i.anexos.length,
  ]);
  // ";" e BOM: o Excel em português abre com as colunas e os acentos certos.
  const csv = "﻿" + [cabecalho, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `sac-${d.filtros.de}-a-${d.filtros.ate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
