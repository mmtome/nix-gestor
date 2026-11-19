"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { refreshAll } from "@/lib/revalidate";
import { importarMes } from "@/lib/insights";

/* ============================================================================
   Relatório de resultados — criação, edição e importação.

   A edição é campo a campo pelo editor, então `salvarRelatorio` recebe um
   objeto parcial: o formulário manda só o que mudou. Isso importa no modo
   híbrido — a importação da API não pode apagar o que foi preenchido à mão.
   ========================================================================== */

const fatia = z.object({ rotulo: z.string().trim().max(60), pct: z.number() });
const pontoHora = z.object({ hora: z.number().int().min(0).max(23), valor: z.number() });
const destaque = z.object({
  rotulo: z.string().trim().max(20),
  valor: z.number(),
  anexoId: z.string().optional(),
  imagemUrl: z.string().trim().max(500).optional(),
  nota: z.string().trim().max(200).optional(),
});

const camposSchema = z.object({
  cliente: z.string().trim().max(120).nullable().optional(),

  posts: z.number().int().min(0).optional(),
  feeds: z.number().int().min(0).optional(),
  reels: z.number().int().min(0).optional(),
  stories: z.number().int().min(0).optional(),
  visualizacoes: z.number().int().min(0).optional(),
  alcance: z.number().int().min(0).optional(),
  mediaViewReels: z.number().int().min(0).optional(),
  mediaViewStories: z.number().int().min(0).optional(),
  freqExibicao: z.number().min(0).optional(),
  taxaEngajamento: z.number().optional(),
  taxaCrescimento: z.number().optional(),
  formatoTop: z.string().trim().max(40).nullable().optional(),

  seguidores: z.number().int().min(0).optional(),
  seguidoresDelta: z.number().int().optional(),
  idades: z.array(fatia).max(12).optional(),
  localizacoes: z.array(fatia).max(12).optional(),
  generos: z.array(fatia).max(6).optional(),
  horarios: z.array(pontoHora).max(24).optional(),
  notaAudiencia: z.string().trim().max(600).nullable().optional(),

  topVisualizacoes: z.array(destaque).max(3).optional(),
  piorVisualizacoes: z.array(destaque).max(2).optional(),
  topInteracoes: z.array(destaque).max(3).optional(),
  piorInteracoes: z.array(destaque).max(2).optional(),

  interacoes: z.number().int().min(0).optional(),
  curtidas: z.number().int().min(0).optional(),
  comentarios: z.number().int().min(0).optional(),
  compartilhamentos: z.number().int().min(0).optional(),
  salvos: z.number().int().min(0).optional(),
  cliquesLink: z.number().int().min(0).optional(),

  conclusao: z.string().trim().max(4000).nullable().optional(),
});

export type CamposRelatorio = z.infer<typeof camposSchema>;

/* --------------------------------------------------------------- criar */

export async function criarRelatorio(projectId: string, ano: number, mes: number) {
  const user = await requireUser();
  await assertProjectAccess(user, projectId, true);

  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
    return { ok: false as const, erro: "Mês ou ano inválido." };
  }

  const existente = await db.relatorioMensal.findUnique({
    where: { projectId_ano_mes: { projectId, ano, mes } },
    select: { id: true },
  });
  if (existente) return { ok: true as const, id: existente.id, jaExistia: true };

  const projeto = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });

  const criado = await db.relatorioMensal.create({
    data: { projectId, ano, mes, cliente: projeto?.name ?? null },
    select: { id: true },
  });

  refreshAll();
  return { ok: true as const, id: criado.id, jaExistia: false };
}

/* --------------------------------------------------------------- salvar */

export async function salvarRelatorio(id: string, campos: CamposRelatorio) {
  const user = await requireUser();

  const alvo = await db.relatorioMensal.findUnique({
    where: { id },
    select: { projectId: true, fonte: true },
  });
  if (!alvo) return { ok: false as const, erro: "Relatório não encontrado." };
  await assertProjectAccess(user, alvo.projectId, true);

  const dados = camposSchema.parse(campos);

  await db.relatorioMensal.update({
    where: { id },
    data: {
      ...dados,
      // Editar à mão um relatório importado o torna misto — o rodapé mostra
      // isso, para ninguém apresentar um número ajustado como se fosse da API.
      fonte: alvo.fonte === "api" ? "misto" : alvo.fonte,
    },
  });

  refreshAll();
  return { ok: true as const };
}

/* -------------------------------------------------------------- excluir */

export async function excluirRelatorio(id: string) {
  const user = await requireUser();
  const alvo = await db.relatorioMensal.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!alvo) return { ok: false as const, erro: "Relatório não encontrado." };
  await assertProjectAccess(user, alvo.projectId, true);

  await db.relatorioMensal.delete({ where: { id } });
  refreshAll();
  return { ok: true as const };
}

/* ------------------------------------------------------------- importar */

/**
 * Puxa da Graph API o que ela souber responder e grava por cima.
 *
 * Só sobrescreve campo que veio com valor: se a API não respondeu alcance, o
 * que estava preenchido à mão continua lá. É o que torna o modo híbrido
 * seguro de usar mais de uma vez no mesmo relatório.
 */
export async function importarDaApi(id: string) {
  const user = await requireUser();

  const alvo = await db.relatorioMensal.findUnique({
    where: { id },
    select: { projectId: true, ano: true, mes: true },
  });
  if (!alvo) return { ok: false as const, erro: "Relatório não encontrado." };
  await assertProjectAccess(user, alvo.projectId, true);

  const conta = await db.instagramAccount.findUnique({
    where: { projectId: alvo.projectId },
    select: { igUserId: true, accessToken: true },
  });

  const r = await importarMes(alvo.projectId, conta, alvo.ano, alvo.mes);
  if (!r.ok) return { ok: false as const, erro: r.motivo };

  const preenchidos = soComValor(r.dados);

  if (Object.keys(preenchidos).length === 0) {
    return { ok: false as const, erro: "A API não devolveu nenhum número para este mês." };
  }

  await db.relatorioMensal.update({
    where: { id },
    data: { ...preenchidos, fonte: "api" },
  });

  refreshAll();
  return {
    ok: true as const,
    campos: Object.keys(preenchidos).length,
    // A tela guarda o relatório em estado local: sem os valores de volta, ela
    // continuaria mostrando o que havia antes da importação.
    dados: preenchidos as Partial<CamposRelatorio>,
    avisos: r.avisos,
  };
}

function soComValor(dados: object) {
  return Object.fromEntries(
    Object.entries(dados).filter(([, v]) => v !== undefined && v !== null),
  );
}

/**
 * Cria, já importados, os relatórios dos meses anteriores do mesmo ano que
 * ainda não existem — é o que monta o comparativo do ano sem digitar nada.
 * A Meta guarda dois anos de métricas e de posts.
 *
 * Mês que já tem relatório não é tocado, e mês sem post nem visualização
 * (a conta ainda não existia, por exemplo) não vira relatório vazio.
 */
export async function importarMesesAnteriores(id: string) {
  const user = await requireUser();

  const alvo = await db.relatorioMensal.findUnique({
    where: { id },
    select: { projectId: true, ano: true, mes: true, cliente: true },
  });
  if (!alvo) return { ok: false as const, erro: "Relatório não encontrado." };
  await assertProjectAccess(user, alvo.projectId, true);

  const [conta, existentes] = await Promise.all([
    db.instagramAccount.findUnique({
      where: { projectId: alvo.projectId },
      select: { igUserId: true, accessToken: true },
    }),
    db.relatorioMensal.findMany({
      where: { projectId: alvo.projectId, ano: alvo.ano },
      select: { mes: true },
    }),
  ]);
  const ocupados = new Set(existentes.map((e) => e.mes));
  const faltando = Array.from({ length: alvo.mes - 1 }, (_, i) => i + 1).filter(
    (m) => !ocupados.has(m),
  );
  if (!faltando.length) {
    return { ok: true as const, criados: [] as number[], vazios: [] as number[], falhas: [] as string[] };
  }

  const criados: number[] = [];
  const vazios: number[] = [];
  const falhas: string[] = [];

  // Três meses por vez: rápido o bastante sem esbarrar no limite da Meta.
  for (let i = 0; i < faltando.length; i += 3) {
    await Promise.all(
      faltando.slice(i, i + 3).map(async (mes) => {
        const r = await importarMes(alvo.projectId, conta, alvo.ano, mes, false);
        if (!r.ok) {
          falhas.push(`${mes}: ${r.motivo}`);
          return;
        }
        if (!r.dados.posts && !r.dados.visualizacoes) {
          vazios.push(mes);
          return;
        }
        try {
          await db.relatorioMensal.create({
            data: {
              projectId: alvo.projectId,
              ano: alvo.ano,
              mes,
              cliente: alvo.cliente,
              ...soComValor(r.dados),
              fonte: "api",
            },
          });
          criados.push(mes);
        } catch {
          // Criado em paralelo (clique duplo): o que já existe fica.
        }
      }),
    );
  }

  refreshAll();
  return {
    ok: true as const,
    criados: criados.sort((a, b) => a - b),
    vazios: vazios.sort((a, b) => a - b),
    falhas,
  };
}

/* --------------------------------------------------------- conta do IG */

/**
 * Desliga a conta do projeto: apaga o token e o id, mantém o @ para a próxima
 * conexão escolher a mesma conta. Os relatórios já gerados não mudam.
 *
 * A conexão em si não passa por aqui: é o "Conectar com Instagram", que vai
 * ao login da Meta e volta em /api/instagram/callback.
 */
export async function desconectarInstagram(projectId: string) {
  const user = await requireUser();
  await assertProjectAccess(user, projectId, true);

  await db.instagramAccount.updateMany({
    where: { projectId },
    data: { igUserId: null, accessToken: null, conectadoEm: null },
  });

  refreshAll();
  return { ok: true as const };
}
