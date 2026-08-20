"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Pencil,
  Presentation,
  RefreshCw,
} from "lucide-react";
import { salvarRelatorio, importarDaApi } from "@/actions/relatorio";
import { montarComparativos, nomeDoMes } from "@/lib/relatorio";
import type { LinhaComparativa } from "@/lib/relatorio";
import { Deck, type DadosDeck } from "./Deck";
import { Editor, type EstadoRelatorio } from "./Editor";

/* ============================================================================
   A tela do relatório: alterna entre apresentar e editar.

   Os comparativos são recalculados no cliente a cada digitação, usando as
   linhas dos outros meses vindas do servidor mais o estado atual deste mês.
   Assim o gráfico do ano se move junto com o campo que está sendo editado, em
   vez de só depois de salvar.
   ========================================================================== */

export function RelatorioView({
  id,
  projectId,
  projeto,
  ano,
  mes,
  fonte,
  inicial,
  outrosMeses,
  contaConectada,
}: {
  id: string;
  projectId: string;
  projeto: string;
  ano: number;
  mes: number;
  fonte: string;
  inicial: EstadoRelatorio;
  /** Linhas dos demais meses do ano — este mês vem do estado local. */
  outrosMeses: LinhaComparativa[];
  contaConectada: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoRelatorio>(inicial);
  const [modo, setModo] = useState<"apresentar" | "editar">("apresentar");
  const [sujo, setSujo] = useState(false);
  const [salvando, iniciarSalvar] = useTransition();
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const set = <K extends keyof EstadoRelatorio>(k: K, v: EstadoRelatorio[K]) => {
    setEstado((e) => ({ ...e, [k]: v }));
    setSujo(true);
    setAviso(null);
  };

  const dados: DadosDeck = useMemo(() => {
    const linhas: LinhaComparativa[] = [
      ...outrosMeses.filter((l) => l.mes !== mes),
      {
        mes,
        visualizacoes: estado.visualizacoes,
        interacoes: estado.interacoes,
        curtidas: estado.curtidas,
        comentarios: estado.comentarios,
        compartilhamentos: estado.compartilhamentos,
        salvos: estado.salvos,
        cliquesLink: estado.cliquesLink,
      },
    ];

    return {
      cliente: estado.cliente || projeto,
      projeto,
      ano,
      mes,
      posts: estado.posts,
      feeds: estado.feeds,
      reels: estado.reels,
      stories: estado.stories,
      visualizacoes: estado.visualizacoes,
      alcance: estado.alcance,
      mediaViewReels: estado.mediaViewReels,
      mediaViewStories: estado.mediaViewStories,
      freqExibicao: estado.freqExibicao,
      taxaEngajamento: estado.taxaEngajamento,
      taxaCrescimento: estado.taxaCrescimento,
      formatoTop: estado.formatoTop || null,
      seguidores: estado.seguidores,
      seguidoresDelta: estado.seguidoresDelta,
      idades: estado.idades,
      localizacoes: estado.localizacoes,
      generos: estado.generos,
      horarios: estado.horarios,
      notaAudiencia: estado.notaAudiencia || null,
      topVisualizacoes: estado.topVisualizacoes,
      piorVisualizacoes: estado.piorVisualizacoes,
      topInteracoes: estado.topInteracoes,
      piorInteracoes: estado.piorInteracoes,
      conclusao: estado.conclusao || null,
      fonte,
      comparativos: montarComparativos(linhas),
    };
  }, [estado, outrosMeses, mes, ano, projeto, fonte]);

  function salvar() {
    iniciarSalvar(async () => {
      const r = await salvarRelatorio(id, {
        ...estado,
        cliente: estado.cliente || null,
        formatoTop: estado.formatoTop || null,
        notaAudiencia: estado.notaAudiencia || null,
        conclusao: estado.conclusao || null,
      });
      if (r.ok) {
        setSujo(false);
        setAviso({ tom: "ok", texto: "Relatório salvo." });
        router.refresh();
      } else {
        setAviso({ tom: "erro", texto: r.erro ?? "Não foi possível salvar." });
      }
    });
  }

  async function importar() {
    setImportando(true);
    setAviso(null);
    const r = await importarDaApi(id);
    setImportando(false);

    if (!r.ok) {
      setAviso({ tom: "erro", texto: r.erro ?? "Falha na importação." });
      return;
    }
    setAviso({
      tom: "ok",
      texto: `${r.campos} campos importados. ${r.avisos.join(" ")}`,
    });
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barra de ações — fora da impressão */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3 print:hidden">
        <Link
          href={`/projects/${projectId}/relatorio`}
          className="rounded p-1.5 text-muted transition hover:bg-surface hover:text-text"
          aria-label="Voltar para a lista de relatórios"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-semibold tracking-tight">
            {nomeDoMes(mes)} de {ano}
          </h1>
          <p className="text-[11.5px] text-muted">
            {projeto} ·{" "}
            {fonte === "api"
              ? "importado da API"
              : fonte === "misto"
                ? "importado e ajustado à mão"
                : "preenchido à mão"}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {aviso && (
            <span
              className={`max-w-[42ch] truncate text-[11.5px] ${
                aviso.tom === "ok" ? "text-ok" : "text-warn"
              }`}
              title={aviso.texto}
            >
              {aviso.texto}
            </span>
          )}

          {contaConectada && (
            <button onClick={importar} disabled={importando} className="btn-ghost">
              {importando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Importar da API
            </button>
          )}

          <button
            onClick={() => setModo(modo === "editar" ? "apresentar" : "editar")}
            className="btn-ghost"
          >
            {modo === "editar" ? (
              <>
                <Presentation className="h-3.5 w-3.5" /> Apresentar
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </>
            )}
          </button>

          <button onClick={() => window.print()} className="btn-ghost">
            <Download className="h-3.5 w-3.5" /> Baixar PDF
          </button>

          <button onClick={salvar} disabled={!sujo || salvando} className="btn-primary">
            {salvando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {sujo ? "Salvar" : "Salvo"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        {modo === "editar" ? (
          <Editor estado={estado} set={set} />
        ) : (
          <div className="mx-auto max-w-6xl px-6 py-6 print:max-w-none print:p-0">
            <p className="mb-4 text-[11.5px] text-faint print:hidden">
              “Baixar PDF” abre a impressão do navegador — escolha <b>Salvar como PDF</b>,
              layout paisagem e marque <b>Gráficos de fundo</b>. Cada slide sai numa página.
            </p>
            <Deck d={dados} />
          </div>
        )}
      </div>
    </div>
  );
}
