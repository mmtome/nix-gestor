import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertProjectAccess } from "@/lib/permissions";
import { comoDestaques, comoFatias, comoHorarios } from "@/lib/relatorio";
import { RelatorioView } from "@/components/relatorio/RelatorioView";
import type { EstadoRelatorio } from "@/components/relatorio/Editor";

export default async function RelatorioPage({
  params,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
}) {
  const user = await requireUser();
  const { projectId, reportId } = await params;
  await assertProjectAccess(user, projectId, false);

  const r = await db.relatorioMensal.findUnique({
    where: { id: reportId },
    include: { project: { select: { id: true, name: true } } },
  });

  // Confere o vínculo: um id de relatório de outro projeto não pode ser aberto
  // por quem só tem acesso a este.
  if (!r || r.projectId !== projectId) notFound();

  const [outros, conta] = await Promise.all([
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
      outrosMeses={outros}
      contaConectada={!!(conta?.igUserId && conta?.accessToken)}
    />
  );
}
