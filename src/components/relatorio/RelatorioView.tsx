"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  History,
  Loader2,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  salvarRelatorio,
  importarDaApi,
  importarMesesAnteriores,
  excluirRelatorio,
} from "@/actions/relatorio";
import { montarComparativos, nomeDoMes } from "@/lib/relatorio";
import type { ExtrasRelatorio, LinhaComparativa } from "@/lib/relatorio";
import type { DirectDeck } from "@/lib/direct";
import { Deck, type DadosDeck } from "./Deck";
import { Editor, type EstadoRelatorio } from "./Editor";
import { ImportarDirect } from "./ImportarDirect";

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
  gerarAoAbrir = false,
  extrasIniciais,
  direct,
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
  /** Veio do "Gerar relatório": puxa tudo da API assim que abre. */
  gerarAoAbrir?: boolean;
  /** Comunidade, formatos e o resto que não é editado à mão. */
  extrasIniciais: ExtrasRelatorio;
  /** Do arquivo exportado; vale para o projeto, não muda com a edição. */
  direct: DirectDeck | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoRelatorio>(inicial);
  const [extras, setExtras] = useState<ExtrasRelatorio>(extrasIniciais);
  const [modo, setModo] = useState<"apresentar" | "editar">("apresentar");
  const [sujo, setSujo] = useState(false);
  const [salvando, iniciarSalvar] = useTransition();
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  /** Os avisos da importação: o que a API não entregou e de onde veio cada número. */
  const [notas, setNotas] = useState<string[] | null>(null);
  const [buscandoMeses, setBuscandoMeses] = useState(false);
  /** Etapa do "Gerar relatório" em andamento, mostrada no lugar do aviso. */
  const [etapa, setEtapa] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, iniciarExclusao] = useTransition();

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
      extras,
      direct,
    };
  }, [estado, extras, outrosMeses, mes, ano, projeto, fonte, direct]);

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

  /** Libera o mês: dá para gerar de novo do zero pela lista. O Direct fica. */
  function excluir() {
    iniciarExclusao(async () => {
      const r = await excluirRelatorio(id);
      if (!r.ok) {
        setConfirmarExclusao(false);
        setAviso({ tom: "erro", texto: r.erro ?? "Não foi possível excluir." });
        return;
      }
      router.push(`/projects/${projectId}/relatorio`);
      router.refresh();
    });
  }

  /* As duas importações devolvem as notas em vez de só mostrá-las, para o
     "Gerar relatório" juntar as duas numa lista. */

  async function importar(sozinho = true): Promise<string[] | null> {
    setImportando(true);
    setAviso(null);
    const r = await importarDaApi(id);
    setImportando(false);

    if (!r.ok) {
      setAviso({ tom: "erro", texto: r.erro ?? "Falha na importação." });
      return null;
    }
    const { extras: novos, ...campos } = r.dados as Partial<EstadoRelatorio> & {
      extras?: ExtrasRelatorio;
    };
    setEstado((e) => ({ ...e, ...campos }));
    if (novos) setExtras((x) => ({ ...x, ...novos }));
    setAviso({ tom: "ok", texto: `${r.campos} campos importados.` });
    if (sozinho) setNotas(r.avisos);
    router.refresh();
    return r.avisos;
  }

  async function mesesAnteriores(sozinho = true): Promise<string[] | null> {
    setBuscandoMeses(true);
    setAviso(null);
    const r = await importarMesesAnteriores(id);
    setBuscandoMeses(false);

    if (!r.ok) {
      setAviso({ tom: "erro", texto: r.erro ?? "Falha ao buscar os meses anteriores." });
      return null;
    }
    const nomes = (ms: number[]) => ms.map((m) => nomeDoMes(m).toLowerCase()).join(", ");
    setAviso({
      tom: "ok",
      texto: r.criados.length
        ? `${r.criados.length} meses criados para o comparativo.`
        : "Nenhum mês novo para criar.",
    });
    const lista = [
      ...(r.criados.length
        ? [`Comparativo: ${nomes(r.criados)} criados e importados (sem destaques nem demografia; abra o mês e use Importar da API para completar).`]
        : []),
      ...(r.vazios.length ? [`Sem nenhum post, não viraram relatório: ${nomes(r.vazios)}.`] : []),
      ...r.falhas.map((f) => `Falhou o mês ${f}`),
    ];
    if (sozinho) setNotas(lista);
    router.refresh();
    return lista;
  }

  /** Meses anteriores primeiro: a conclusão compara com o mês passado. */
  async function gerar() {
    setNotas(null);
    let antes: string[] | null = [];
    if (mes > 1) {
      setEtapa("Gerando: buscando os meses anteriores para o comparativo…");
      antes = await mesesAnteriores(false);
    }
    setEtapa(`Gerando: importando os números de ${nomeDoMes(mes).toLowerCase()}…`);
    const depois = await importar(false);
    setEtapa(null);
    if (depois) {
      setAviso({ tom: "ok", texto: "Relatório gerado com os números da Meta." });
      setNotas([...depois, ...(antes ?? [])]);
    }
  }

  const gerou = useRef(false);
  useEffect(() => {
    if (!gerarAoAbrir || !contaConectada || gerou.current) return;
    gerou.current = true;
    // Tira o ?gerar=1 da barra: recarregar a página não deve importar de novo.
    router.replace(`/projects/${projectId}/relatorio/${id}`, { scroll: false });
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {etapa && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {etapa}
            </span>
          )}

          {!etapa && aviso && (
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
            <button onClick={() => importar()} disabled={importando || !!etapa} className="btn-ghost">
              {importando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Importar da API
            </button>
          )}

          {contaConectada && mes > 1 && (
            <button
              onClick={() => mesesAnteriores()}
              disabled={buscandoMeses || !!etapa}
              className="btn-ghost"
              title="Cria e importa os meses anteriores deste ano que ainda não têm relatório"
            >
              {buscandoMeses ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <History className="h-3.5 w-3.5" />
              )}
              Meses anteriores
            </button>
          )}

          <ImportarDirect projectId={projectId} variante="botao" />

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

          {confirmarExclusao ? (
            <>
              <span className="text-[11.5px] text-warn">Excluir {nomeDoMes(mes).toLowerCase()} de {ano}?</span>
              <button onClick={excluir} disabled={excluindo} className="btn-ghost text-warn">
                {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Sim, excluir
              </button>
              <button onClick={() => setConfirmarExclusao(false)} disabled={excluindo} className="btn-ghost">
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmarExclusao(true)}
              disabled={!!etapa}
              className="btn-ghost"
              title="Exclui este relatório para gerar o mês de novo. O Direct importado continua guardado."
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}

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

      {notas && notas.length > 0 && (
        <div className="flex items-start gap-4 border-b border-line bg-graphite px-6 py-3 print:hidden">
          <ul className="flex min-w-0 flex-1 list-disc flex-col gap-0.5 pl-4 text-[11.5px] leading-relaxed text-muted">
            {notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <button onClick={() => setNotas(null)} className="btn-ghost shrink-0">
            Fechar
          </button>
        </div>
      )}

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
