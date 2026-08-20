"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { refreshAll } from "@/lib/revalidate";
import { importarMes, identificarConta } from "@/lib/insights";

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

  const r = await importarMes(conta, alvo.ano, alvo.mes);
  if (!r.ok) return { ok: false as const, erro: r.motivo };

  const { dados } = r;
  const preenchidos = Object.fromEntries(
    Object.entries(dados).filter(([, v]) => v !== undefined && v !== null),
  );

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
    avisos: r.avisos,
  };
}

/* --------------------------------------------------------- conta do IG */

const contaSchema = z.object({
  username: z.string().trim().max(60).optional(),
  igUserId: z.string().trim().max(60).nullable().optional(),
  accessToken: z.string().trim().max(600).nullable().optional(),
});

/**
 * Salva a conta do projeto.
 *
 * Quando vem token novo, pergunta à Meta quem ele é e grava o id e o usuário
 * daí — é a única forma de garantir que os três campos combinam. Digitar o id
 * à mão é a origem mais comum de "importação não trouxe nada": a Meta aceita
 * um id de outra conta e devolve vazio em vez de erro.
 */
export async function salvarContaInstagram(
  projectId: string,
  input: z.infer<typeof contaSchema>,
) {
  const user = await requireUser();
  await assertProjectAccess(user, projectId, true);
  const dados = contaSchema.parse(input);

  const atual = await db.instagramAccount.findUnique({
    where: { projectId },
    select: { username: true, igUserId: true, accessToken: true },
  });

  const token = dados.accessToken || atual?.accessToken || null;
  let igUserId = dados.igUserId || atual?.igUserId || null;
  let username = dados.username || atual?.username || "";

  // Só interroga a Meta quando há token novo — evita uma chamada de rede a
  // cada edição de nome.
  if (dados.accessToken) {
    const id = await identificarConta(dados.accessToken);
    if (!id.ok) {
      return {
        ok: false as const,
        erro: `A Meta recusou este token: ${id.motivo}`,
      };
    }
    igUserId = id.igUserId;
    if (id.username) username = id.username;
  }

  if (!username) {
    return { ok: false as const, erro: "Informe o usuário da conta." };
  }

  const conectadoEm = igUserId && token ? new Date() : null;

  await db.instagramAccount.upsert({
    where: { projectId },
    create: { projectId, username, igUserId, accessToken: token, conectadoEm },
    update: { username, igUserId, accessToken: token, conectadoEm },
  });

  refreshAll();
  return { ok: true as const, username, igUserId };
}
