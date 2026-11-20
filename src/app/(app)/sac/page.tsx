import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { credenciais, lerConfig } from "@/lib/sac/config";
import { estadoConexao } from "@/lib/sac/evolution";
import type { SacStatus } from "@/lib/sac/core";
import type { CardSac, ConexaoSac, Contagem, FiltrosSac, MetricasSac, TagSac, TipoTag } from "@/lib/sac/tipos";
import { QuadroSac } from "@/components/sac/QuadroSac";

/* ============================================================================
   Aba SAC: quadro dos prints de dúvidas que chegam do grupo do WhatsApp
   (docs/sac/SAC_WHATSAPP_SPEC.md).
   ========================================================================== */

const DIA = 24 * 3600 * 1000;
const LIMITE = 400;

type Busca = Partial<Record<"q" | "canal" | "categoria" | "evento" | "prioridade" | "periodo" | "arquivados", string>>;

export default async function SacPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filtros: FiltrosSac = {
    q: (sp.q ?? "").trim().slice(0, 100),
    canal: sp.canal ?? "",
    categoria: sp.categoria ?? "",
    evento: sp.evento ?? "",
    prioridade: sp.prioridade ?? "",
    periodo: ["7", "30", "90", "tudo"].includes(sp.periodo ?? "") ? sp.periodo! : "",
    arquivados: sp.arquivados === "1",
  };

  const config = await lerConfig();
  const [cards, tags, conexao, metricas] = await Promise.all([
    carregarCards(filtros),
    db.sacTag.findMany({ orderBy: [{ type: "asc" }, { sort: "asc" }, { label: "asc" }] }),
    lerConexao(config),
    carregarMetricas(30),
  ]);

  return (
    <QuadroSac
      cards={cards}
      tags={tags.map((t) => ({ ...t, type: t.type as TipoTag }) satisfies TagSac)}
      filtros={filtros}
      sla={{ amarelo: config.slaAmareloHoras, vermelho: config.slaVermelhoHoras }}
      conexao={conexao}
      metricas={metricas}
      admin={user.role === "ADMIN"}
    />
  );
}

async function carregarCards(f: FiltrosSac): Promise<CardSac[]> {
  const agora = Date.now();
  const where: Prisma.SacCardWhereInput = {
    status: { in: f.arquivados ? ["novo", "respondido_grupo", "resolvido", "arquivado"] : ["novo", "respondido_grupo", "resolvido"] },
    ...(f.canal ? { canal: f.canal } : {}),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.evento ? { evento: f.evento } : {}),
    ...(f.prioridade ? { prioridade: f.prioridade } : {}),
    AND: [
      f.q
        ? {
            OR: [
              { titulo: { contains: f.q, mode: "insensitive" } },
              { legendaOriginal: { contains: f.q, mode: "insensitive" } },
              { comments: { some: { text: { contains: f.q, mode: "insensitive" } } } },
            ],
          }
        : {},
      // Padrão: os abertos todos; resolvidos e arquivados só da última semana.
      f.periodo === ""
        ? {
            OR: [
              { status: { in: ["novo", "respondido_grupo"] } },
              { status: "resolvido", resolvedAt: { gte: new Date(agora - 7 * DIA) } },
              { status: "arquivado", updatedAt: { gte: new Date(agora - 7 * DIA) } },
            ],
          }
        : f.periodo === "tudo"
          ? {}
          : { receivedAt: { gte: new Date(agora - Number(f.periodo) * DIA) } },
    ],
  };

  const cards = await db.sacCard.findMany({
    where,
    orderBy: { ordem: "asc" },
    take: LIMITE,
    include: {
      attachments: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
      _count: { select: { attachments: true, comments: true } },
    },
  });

  return cards.map((c) => ({
    id: c.id,
    status: c.status as SacStatus,
    titulo: c.titulo,
    canal: c.canal,
    categoria: c.categoria,
    evento: c.evento,
    prioridade: c.prioridade,
    tagsDesconhecidas: c.tagsDesconhecidas,
    temLegenda: !!c.legendaOriginal,
    senderName: c.senderName,
    receivedAt: c.receivedAt.toISOString(),
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    ordem: c.ordem,
    capa: c.attachments[0]?.id ?? null,
    anexos: c._count.attachments,
    comentarios: c._count.comments,
  }));
}

async function lerConexao(config: Awaited<ReturnType<typeof lerConfig>>): Promise<ConexaoSac> {
  const grupo = config.groupJid ? (config.groupNome ?? config.groupJid) : null;
  const c = credenciais(config);
  if (!c) return { estado: "sem-config", grupo };
  try {
    // Curto: a tela se atualiza a cada 15 s e não pode travar se a Evolution cair.
    return { estado: await estadoConexao(c, 3_500), grupo };
  } catch (e) {
    return { estado: "erro", grupo, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

/** Fase 6: volume por canal, categoria e evento; tempo até a 1ª resposta e até resolver. */
async function carregarMetricas(dias: number): Promise<MetricasSac> {
  const desde = new Date(Date.now() - dias * DIA);
  const [cards, tags] = await Promise.all([
    db.sacCard.findMany({
      where: { receivedAt: { gte: desde }, status: { not: "arquivado" } },
      select: {
        canal: true,
        categoria: true,
        evento: true,
        receivedAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        status: true,
      },
    }),
    db.sacTag.findMany({ select: { slug: true, label: true, color: true } }),
  ]);
  const porSlug = new Map(tags.map((t) => [t.slug, t]));

  const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null);
  const contar = (campo: "canal" | "categoria" | "evento"): Contagem[] => {
    const totais = new Map<string, number>();
    for (const c of cards) {
      const slug = c[campo] ?? "";
      totais.set(slug, (totais.get(slug) ?? 0) + 1);
    }
    return [...totais]
      .map(([slug, total]) => ({
        slug: slug || "—",
        label: slug ? (porSlug.get(slug)?.label ?? `#${slug}`) : "Sem tag",
        color: slug ? (porSlug.get(slug)?.color ?? null) : "#766a80",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  };

  return {
    dias,
    recebidos: cards.length,
    resolvidos: cards.filter((c) => c.status === "resolvido").length,
    primeiraRespostaMin: media(
      cards.flatMap((c) => (c.firstResponseAt ? [(c.firstResponseAt.getTime() - c.receivedAt.getTime()) / 60_000] : [])),
    ),
    resolucaoMin: media(
      cards.flatMap((c) =>
        c.status === "resolvido" && c.resolvedAt ? [(c.resolvedAt.getTime() - c.receivedAt.getTime()) / 60_000] : [],
      ),
    ),
    porCanal: contar("canal"),
    porCategoria: contar("categoria"),
    porEvento: contar("evento"),
  };
}
