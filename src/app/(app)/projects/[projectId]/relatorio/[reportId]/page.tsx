import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertProjectAccess } from "@/lib/permissions";
import { comoDestaques, comoExtras, comoFatias, comoHorarios } from "@/lib/relatorio";
import { montarDirect } from "@/lib/direct";
import { RelatorioView } from "@/components/relatorio/RelatorioView";
import type { EstadoRelatorio } from "@/components/relatorio/Editor";

// "Meses anteriores" importa vários meses numa ação só.
export const maxDuration = 300;

export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { projectId, reportId } = await params;
  const { gerar } = await searchParams;
  await assertProjectAccess(user, projectId, false);

  const r = await db.relatorioMensal.findUnique({
    where: { id: reportId },
    include: { project: { select: { id: true, name: true } } },
  });

  // Confere o vínculo: um id de relatório de outro projeto não pode ser aberto
  // por quem só tem acesso a este.
  if (!r || r.projectId !== projectId) notFound();

  const [outros, conta, direct] = await Promise.all([
    db.relatorioMensal.findMany({
      where: { projectId, ano: r.ano },
      select: {
        mes: true,
        visualizacoes: true,
        interacoes: true,
        curtidas: true,
        comentarios: true,
        compartilhamentos: true,
        salvos: true,
        cliquesLink: true,
      },
    }),
    db.instagramAccount.findUnique({
      where: { projectId },
      select: { igUserId: true, accessToken: true },
    }),
    // Este ano e o anterior: o comparativo do Direct é ano contra ano.
    db.dadosExportados.findMany({
      where: { projectId, tipo: "direct", ano: { in: [r.ano - 1, r.ano] } },
      select: { ano: true, mes: true, dados: true },
    }),
  ]);

  const inicial: EstadoRelatorio = {
    cliente: r.cliente ?? r.project.name,
    posts: r.posts,
    feeds: r.feeds,
    reels: r.reels,
    stories: r.stories,
    visualizacoes: r.visualizacoes,
    alcance: r.alcance,
    mediaViewReels: r.mediaViewReels,
    mediaViewStories: r.mediaViewStories,
    freqExibicao: r.freqExibicao,
    taxaEngajamento: r.taxaEngajamento,
    taxaCrescimento: r.taxaCrescimento,
    formatoTop: r.formatoTop ?? "",
    seguidores: r.seguidores,
    seguidoresDelta: r.seguidoresDelta,
    idades: comoFatias(r.idades),
    localizacoes: comoFatias(r.localizacoes),
    generos: comoFatias(r.generos),
    horarios: comoHorarios(r.horarios),
    notaAudiencia: r.notaAudiencia ?? "",
    topVisualizacoes: comoDestaques(r.topVisualizacoes),
    piorVisualizacoes: comoDestaques(r.piorVisualizacoes),
    topInteracoes: comoDestaques(r.topInteracoes),
    piorInteracoes: comoDestaques(r.piorInteracoes),
    interacoes: r.interacoes,
    curtidas: r.curtidas,
    comentarios: r.comentarios,
    compartilhamentos: r.compartilhamentos,
    salvos: r.salvos,
    cliquesLink: r.cliquesLink,
    conclusao: r.conclusao ?? "",
  };

  return (
    <RelatorioView
      id={r.id}
      projectId={projectId}
      projeto={r.project.name}
      ano={r.ano}
      mes={r.mes}
      fonte={r.fonte}
      inicial={inicial}
      extrasIniciais={comoExtras(r.extras)}
      outrosMeses={outros}
      contaConectada={!!(conta?.igUserId && conta?.accessToken)}
      gerarAoAbrir={gerar === "1"}
      direct={montarDirect(direct, r.ano, r.mes)}
    />
  );
}
