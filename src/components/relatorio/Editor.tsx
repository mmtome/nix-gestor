"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CamposRelatorio } from "@/actions/relatorio";
import type { Destaque, Fatia, PontoHora } from "@/lib/relatorio";
import { ROTULOS_DESTAQUE } from "@/lib/relatorio";

/* ============================================================================
   Editor do relatório.

   Espelha a ordem dos slides — quem edita está olhando para a apresentação
   que vai sair, então a ordem do formulário é a ordem do deck, não a ordem
   das colunas do banco.
   ========================================================================== */

export type EstadoRelatorio = Required<
  Omit<
    CamposRelatorio,
    "cliente" | "formatoTop" | "notaAudiencia" | "conclusao"
  >
> & {
  cliente: string;
  formatoTop: string;
  notaAudiencia: string;
  conclusao: string;
};

/* ------------------------------------------------------------- primitivas */

function Secao({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="text-[13px] font-semibold tracking-tight text-text">{titulo}</h3>
      {hint && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Campo({
  label,
  valor,
  onChange,
  sufixo,
  decimais = false,
  permiteNegativo = false,
}: {
  label: string;
  valor: number;
  onChange: (n: number) => void;
  sufixo?: string;
  decimais?: boolean;
  permiteNegativo?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-dim">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={decimais ? "0.01" : "1"}
          min={permiteNegativo ? undefined : 0}
          className="field tabular-nums"
          value={Number.isFinite(valor) ? valor : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {sufixo && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
            {sufixo}
          </span>
        )}
      </div>
    </label>
  );
}

function Texto({
  label,
  valor,
  onChange,
  placeholder,
}: {
  label: string;
  valor: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-dim">{label}</span>
      <input
        className="field"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* --------------------------------------------------------- lista de fatias */

function EditorFatias({
  label,
  hint,
  fatias,
  onChange,
  max = 8,
  placeholder = "Rótulo",
}: {
  label: string;
  hint?: string;
  fatias: Fatia[];
  onChange: (f: Fatia[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const soma = fatias.reduce((s, f) => s + f.pct, 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-dim">{label}</span>
        {fatias.length > 0 && (
          <span
            className={`text-[10.5px] tabular-nums ${
              soma > 100.5 ? "text-warn" : "text-faint"
            }`}
          >
            soma {soma.toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <p className="mb-2 text-[11px] text-faint">{hint}</p>}

      <div className="flex flex-col gap-1.5">
        {fatias.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              className="field flex-1"
              placeholder={placeholder}
              value={f.rotulo}
              onChange={(e) => {
                const c = [...fatias];
                c[i] = { ...c[i], rotulo: e.target.value };
                onChange(c);
              }}
            />
            <div className="relative w-24 shrink-0">
              <input
                type="number"
                step="0.01"
                className="field pr-6 tabular-nums"
                value={f.pct}
                onChange={(e) => {
                  const c = [...fatias];
                  c[i] = { ...c[i], pct: Number(e.target.value) || 0 };
                  onChange(c);
                }}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                %
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChange(fatias.filter((_, j) => j !== i))}
              className="rounded p-1.5 text-faint transition hover:bg-surface hover:text-accent"
              aria-label={`Remover ${f.rotulo || "linha"}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {fatias.length < max && (
        <button
          type="button"
          onClick={() => onChange([...fatias, { rotulo: "", pct: 0 }])}
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-accent transition hover:opacity-80"
        >
          <Plus className="h-3 w-3" /> Adicionar linha
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- destaques */

function EditorDestaques({
  label,
  hint,
  itens,
  onChange,
  max,
}: {
  label: string;
  hint: string;
  itens: Destaque[];
  onChange: (d: Destaque[]) => void;
  max: number;
}) {
  return (
    <div>
      <span className="text-[11px] font-medium text-dim">{label}</span>
      <p className="mb-2 mt-0.5 text-[11px] text-faint">{hint}</p>

      <div className="flex flex-col gap-2">
        {itens.map((d, i) => (
          <div key={i} className="rounded-md border border-line bg-surface p-2.5">
            <div className="flex items-center gap-1.5">
              <select
                className="field w-24 shrink-0"
                value={d.rotulo}
                onChange={(e) => {
                  const c = [...itens];
                  c[i] = { ...c[i], rotulo: e.target.value };
                  onChange(c);
                }}
              >
                {ROTULOS_DESTAQUE.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                className="field w-32 shrink-0 tabular-nums"
                placeholder="Valor"
                value={d.valor}
                onChange={(e) => {
                  const c = [...itens];
                  c[i] = { ...c[i], valor: Number(e.target.value) || 0 };
                  onChange(c);
                }}
              />
              <input
                className="field min-w-0 flex-1"
                placeholder="URL da imagem (opcional)"
                value={d.imagemUrl ?? ""}
                onChange={(e) => {
                  const c = [...itens];
                  c[i] = { ...c[i], imagemUrl: e.target.value || undefined };
                  onChange(c);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(itens.filter((_, j) => j !== i))}
                className="rounded p-1.5 text-faint transition hover:bg-surface2 hover:text-accent"
                aria-label="Remover destaque"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {itens.length < max && (
        <button
          type="button"
          onClick={() =>
            onChange([...itens, { rotulo: "FEED", valor: 0 }])
          }
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-accent transition hover:opacity-80"
        >
          <Plus className="h-3 w-3" /> Adicionar destaque
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- horários */

function EditorHorarios({
  horarios,
  onChange,
}: {
  horarios: PontoHora[];
  onChange: (h: PontoHora[]) => void;
}) {
  const mapa = new Map(horarios.map((h) => [h.hora, h.valor]));

  const setHora = (hora: number, valor: number) => {
    const novo = new Map(mapa);
    if (valor > 0) novo.set(hora, valor);
    else novo.delete(hora);
    onChange(
      [...novo.entries()].map(([h, v]) => ({ hora: h, valor: v })).sort((a, b) => a.hora - b.hora),
    );
  };

  return (
    <div>
      <p className="mb-2 text-[11px] text-faint">
        Seguidores online por hora, do painel do Instagram. Deixe em zero as horas que não
        for preencher — o gráfico só aparece com duas ou mais.
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
        {Array.from({ length: 24 }, (_, h) => (
          <label key={h} className="min-w-0">
            <span className="mb-0.5 block text-center text-[10px] tabular-nums text-faint">
              {String(h).padStart(2, "0")}h
            </span>
            <input
              type="number"
              min={0}
              className="field px-1 py-1 text-center text-[11px] tabular-nums"
              value={mapa.get(h) ?? 0}
              onChange={(e) => setHora(h, Number(e.target.value) || 0)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

export function Editor({
  estado,
  set,
}: {
  estado: EstadoRelatorio;
  set: <K extends keyof EstadoRelatorio>(k: K, v: EstadoRelatorio[K]) => void;
}) {
  const [aba, setAba] = useState<"geral" | "audiencia" | "destaques" | "totais" | "conclusao">(
    "geral",
  );

  const ABAS = [
    { id: "geral", label: "Visão geral" },
    { id: "audiencia", label: "Audiência" },
    { id: "destaques", label: "Destaques" },
    { id: "totais", label: "Totais do mês" },
    { id: "conclusao", label: "Conclusão" },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <nav className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 pb-2 pt-1 text-[12.5px] transition ${
              aba === a.id
                ? "border-accent font-medium text-text"
                : "border-transparent text-muted hover:text-dim"
            }`}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {aba === "geral" && (
          <>
            <Secao titulo="Identificação">
              <div className="grid gap-3 sm:grid-cols-2">
                <Texto
                  label="Nome do cliente na capa"
                  valor={estado.cliente}
                  onChange={(v) => set("cliente", v)}
                  placeholder="Uberaba Rodeo Show"
                />
                <Texto
                  label="Formato com maior engajamento"
                  valor={estado.formatoTop}
                  onChange={(v) => set("formatoTop", v)}
                  placeholder="Reels"
                />
              </div>
            </Secao>

            <Secao titulo="Volume de publicação">
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Total de posts" valor={estado.posts} onChange={(v) => set("posts", v)} />
                <Campo label="Feeds" valor={estado.feeds} onChange={(v) => set("feeds", v)} />
                <Campo label="Reels" valor={estado.reels} onChange={(v) => set("reels", v)} />
                <Campo label="Stories" valor={estado.stories} onChange={(v) => set("stories", v)} />
              </div>
            </Secao>

            <Secao titulo="Alcance e visualização">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo
                  label="Visualizações"
                  valor={estado.visualizacoes}
                  onChange={(v) => set("visualizacoes", v)}
                />
                <Campo label="Contas alcançadas" valor={estado.alcance} onChange={(v) => set("alcance", v)} />
                <Campo
                  label="Média de view · reels"
                  valor={estado.mediaViewReels}
                  onChange={(v) => set("mediaViewReels", v)}
                />
                <Campo
                  label="Média de view · stories"
                  valor={estado.mediaViewStories}
                  onChange={(v) => set("mediaViewStories", v)}
                />
              </div>
            </Secao>

            <Secao
              titulo="Taxas"
              hint="A frequência de exibição é quantas vezes, em média, a mesma conta viu o conteúdo."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo
                  label="Frequência de exibição"
                  valor={estado.freqExibicao}
                  onChange={(v) => set("freqExibicao", v)}
                  decimais
                />
                <Campo
                  label="Engajamento do perfil"
                  valor={estado.taxaEngajamento}
                  onChange={(v) => set("taxaEngajamento", v)}
                  sufixo="%"
                  decimais
                  permiteNegativo
                />
                <Campo
                  label="Crescimento de seguidores"
                  valor={estado.taxaCrescimento}
                  onChange={(v) => set("taxaCrescimento", v)}
                  sufixo="%"
                  decimais
                  permiteNegativo
                />
              </div>
            </Secao>
          </>
        )}

        {aba === "audiencia" && (
          <>
            <Secao titulo="Base de seguidores">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  label="Seguidores no fim do mês"
                  valor={estado.seguidores}
                  onChange={(v) => set("seguidores", v)}
                />
                <Campo
                  label="Variação no mês"
                  valor={estado.seguidoresDelta}
                  onChange={(v) => set("seguidoresDelta", v)}
                  permiteNegativo
                />
              </div>
            </Secao>

            <Secao titulo="Perfil da audiência">
              <div className="grid gap-5 lg:grid-cols-3">
                <EditorFatias
                  label="Faixa etária"
                  fatias={estado.idades}
                  onChange={(f) => set("idades", f)}
                  placeholder="25-34 anos"
                />
                <EditorFatias
                  label="Localizações"
                  fatias={estado.localizacoes}
                  onChange={(f) => set("localizacoes", f)}
                  placeholder="Uberaba"
                />
                <EditorFatias
                  label="Gênero"
                  fatias={estado.generos}
                  onChange={(f) => set("generos", f)}
                  max={4}
                  placeholder="Feminino"
                />
              </div>
            </Secao>

            <Secao titulo="Horários">
              <EditorHorarios horarios={estado.horarios} onChange={(h) => set("horarios", h)} />
            </Secao>

            <Secao titulo="Observação da audiência" hint="Aparece no rodapé do slide.">
              <textarea
                className="field min-h-[76px] resize-y leading-relaxed"
                value={estado.notaAudiencia}
                placeholder="Ex.: houve mudança no ranking de cidades — Frutal saiu do 5º lugar para Igarapava."
                onChange={(e) => set("notaAudiencia", e.target.value)}
              />
            </Secao>
          </>
        )}

        {aba === "destaques" && (
          <>
            <Secao
              titulo="Desempenho de visualizações"
              hint="Sem URL de imagem, o card mostra um bloco da marca com o rótulo — o slide continua apresentável."
            >
              <div className="flex flex-col gap-5">
                <EditorDestaques
                  label="Mais vistos"
                  hint="Até 3 peças, na ordem em que devem aparecer."
                  itens={estado.topVisualizacoes}
                  onChange={(d) => set("topVisualizacoes", d)}
                  max={3}
                />
                <EditorDestaques
                  label="Menos vistos"
                  hint="Até 2 peças."
                  itens={estado.piorVisualizacoes}
                  onChange={(d) => set("piorVisualizacoes", d)}
                  max={2}
                />
              </div>
            </Secao>

            <Secao titulo="Desempenho de interações">
              <div className="flex flex-col gap-5">
                <EditorDestaques
                  label="Mais interações"
                  hint="Até 3 peças."
                  itens={estado.topInteracoes}
                  onChange={(d) => set("topInteracoes", d)}
                  max={3}
                />
                <EditorDestaques
                  label="Menos interações"
                  hint="Até 2 peças."
                  itens={estado.piorInteracoes}
                  onChange={(d) => set("piorInteracoes", d)}
                  max={2}
                />
              </div>
            </Secao>
          </>
        )}

        {aba === "totais" && (
          <Secao
            titulo="Totais do mês"
            hint="São estes números que alimentam os gráficos comparativos do ano. Um mês sem relatório aparece zerado no gráfico."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Interações" valor={estado.interacoes} onChange={(v) => set("interacoes", v)} />
              <Campo label="Curtidas" valor={estado.curtidas} onChange={(v) => set("curtidas", v)} />
              <Campo label="Comentários" valor={estado.comentarios} onChange={(v) => set("comentarios", v)} />
              <Campo
                label="Compartilhamentos"
                valor={estado.compartilhamentos}
                onChange={(v) => set("compartilhamentos", v)}
              />
              <Campo label="Salvos" valor={estado.salvos} onChange={(v) => set("salvos", v)} />
              <Campo
                label="Cliques em links"
                valor={estado.cliquesLink}
                onChange={(v) => set("cliquesLink", v)}
              />
            </div>
          </Secao>
        )}

        {aba === "conclusao" && (
          <Secao
            titulo="Conclusão"
            hint="Uma linha por tópico — cada linha vira um item do slide de conclusão."
          >
            <textarea
              className="field min-h-[280px] resize-y leading-relaxed"
              value={estado.conclusao}
              placeholder={
                "Julho foi um mês positivo: os seguidores foram de 16.707 para 40.408.\n" +
                "O pico ficou entre 20 e 24/07, nos dias de anúncio da line-up.\n" +
                "Para agosto, a expectativa é de neutralização após o pico."
              }
              onChange={(e) => set("conclusao", e.target.value)}
            />
          </Secao>
        )}
      </div>
    </div>
  );
}
