/**
 * Seed do NIX Gestor.
 *
 * Deixa o app pronto para uso, mas VAZIO de conteúdo: cria a equipe e um
 * projeto-modelo com a estrutura de trabalho da agência (seções, tags e o
 * fluxo de produção como template de subtarefas). Nenhuma tarefa é criada.
 *
 * A ideia é duplicar o projeto-modelo a cada cliente novo, em vez de remontar
 * a estrutura na mão toda vez.
 *
 * Rodar:  npm run db:seed   (apaga e recria os dados)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { initialOrders, between } from "../src/lib/ordering";
import { POSTS, STORIES, BACKLOG } from "./conteudo-nix-setembro";

const db = new PrismaClient();

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Data local de 2026 no formato (dia, mês, hora, minuto). */
const d = (day: number, month: number, hour = 18, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute, 0, 0);

/** Gera chaves de rank fracionado em sequência (ver src/lib/ordering.ts). */
class Order {
  private last: string | null = null;
  next() {
    this.last = between(this.last, null);
    return this.last;
  }
}

/* -------------------------------------------------------------------------- */
/* estrutura de trabalho da agência                                            */
/* -------------------------------------------------------------------------- */

/** Os 4 tipos de conteúdo — o eixo funcional de qualquer planejamento. */
const TIPOS: [string, string][] = [
  ["ALCANCE", "#4573D2"],
  ["AUTORIDADE", "#FFAB00"],
  ["RELACIONAMENTO", "#6FDCA5"],
  ["VENDAS", "#8013A8"],
];

/** Formatos de peça. */
const FORMATOS: [string, string][] = [
  ["REELS", "#8D84E8"],
  ["CARROSSEL", "#4FB3A6"],
  ["ESTÁTICO", "#A8C466"],
  ["STORIES", "#F9AAEF"],
];

const SECOES = [
  "Semana 1",
  "Semana 2",
  "Semana 3",
  "Semana 4",
  "Banco de pautas",
  "Publicado",
];

/* -------------------------------------------------------------------------- */
/* seed                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("Limpando dados anteriores…");
  await db.notification.deleteMany();
  await db.activityLog.deleteMany();
  await db.comment.deleteMany();
  await db.attachment.deleteMany();
  await db.taskTag.deleteMany();
  await db.taskDependency.deleteMany();
  await db.taskCollaborator.deleteMany();
  await db.taskProject.deleteMany();
  await db.task.deleteMany();
  await db.tag.deleteMany();
  await db.section.deleteMany();
  await db.viewPreference.deleteMany();
  await db.subtaskTemplate.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.user.deleteMany();

  /* ------------------------------- usuários ------------------------------- */

  const pass = await bcrypt.hash("nix", 10);

  const matheus = await db.user.create({
    data: {
      name: "Matheus Tomé",
      email: "matheusmigueltome@gmail.com",
      passwordHash: pass,
      role: "ADMIN",
      avatarColor: "#8013A8",
    },
  });

  // Contas de exemplo — renomeie em Membros do projeto ao definir a equipe.
  const socio = await db.user.create({
    data: {
      name: "Sócio 2",
      email: "socio2@agencianix.com.br",
      passwordHash: pass,
      avatarColor: "#FB7601",
    },
  });

  const social = await db.user.create({
    data: {
      name: "Social Media",
      email: "social@agencianix.com.br",
      passwordHash: pass,
      avatarColor: "#4573D2",
    },
  });

  console.log("Usuários criados: 3");

  /* --------------------------- projeto-modelo ----------------------------- */

  const project = await db.project.create({
    data: {
      name: "Modelo · Planejamento de Conteúdo",
      color: "#8013A8",
      icon: "layout-list",
      status: "ON_TRACK",
      description: `Projeto-modelo da Agência NIX. **Duplique este projeto a cada cliente novo** em vez de montar a estrutura na mão.

**O que já vem pronto**
- **6 seções**: quatro semanas de ciclo, um banco de pautas e uma coluna de publicados.
- **8 tags**: os 4 tipos de conteúdo (ALCANCE · AUTORIDADE · RELACIONAMENTO · VENDAS) e os 4 formatos (REELS · CARROSSEL · ESTÁTICO · STORIES).
- **Template "Fluxo de Produção"**: aplique em qualquer tarefa e ela ganha as 6 etapas — DEMANDAR, TRÁFEGO INTERNO, EDIÇÃO, LEGENDA, APROVAÇÃO e PUBLICAÇÃO — já com prazos relativos à data de publicação.

**Como usar**
1. Duplique o projeto e renomeie com o nome do cliente.
2. Ajuste as datas das seções ao ciclo contratado.
3. Cadastre as pautas no banco e puxe para as semanas conforme forem aprovadas.
4. Em cada peça, aplique o Fluxo de Produção e atribua os responsáveis.

**Rodízio de tipos**: manter a ordem ALCANCE › AUTORIDADE › RELACIONAMENTO › VENDAS dá previsibilidade ao feed mesmo quando o dia da semana varia.`,
      members: {
        create: [
          { userId: matheus.id, role: "OWNER", favorite: true },
          { userId: socio.id, role: "EDITOR", favorite: true },
          { userId: social.id, role: "EDITOR", favorite: false },
        ],
      },
    },
  });

  /* -------------------------------- seções -------------------------------- */

  const ordens = initialOrders(SECOES.length);
  await Promise.all(
    SECOES.map((name, i) =>
      db.section.create({ data: { projectId: project.id, name, order: ordens[i] } }),
    ),
  );
  console.log(`Seções criadas: ${SECOES.length}`);

  /* --------------------------------- tags --------------------------------- */

  for (const [name, color] of [...TIPOS, ...FORMATOS]) {
    await db.tag.create({ data: { name, color, projectId: project.id } });
  }
  console.log(`Tags criadas: ${TIPOS.length + FORMATOS.length} (4 tipos + 4 formatos)`);

  /* ----------------------- template do fluxo de produção ------------------- */

  await db.subtaskTemplate.create({
    data: {
      projectId: project.id,
      name: "Fluxo de Produção",
      items: [
        { title: "DEMANDAR", offsetDays: -6, defaultAssigneeEmail: matheus.email },
        { title: "TRÁFEGO INTERNO", offsetDays: -5, defaultAssigneeEmail: socio.email },
        { title: "EDIÇÃO", offsetDays: -4, defaultAssigneeEmail: social.email },
        { title: "LEGENDA", offsetDays: -3, defaultAssigneeEmail: matheus.email },
        { title: "APROVAÇÃO", offsetDays: -1, defaultAssigneeEmail: matheus.email },
        { title: "PUBLICAÇÃO", offsetDays: 0, defaultAssigneeEmail: social.email },
      ],
    },
  });
  console.log("Template criado: Fluxo de Produção (6 etapas)");

  /* ======================================================================== */
  /* projeto de exemplo: Planejamento NIX — setembro/2026                     */
  /* ======================================================================== */

  const nix = await db.project.create({
    data: {
      name: "Planejamento NIX",
      color: "#8013A8",
      icon: "instagram",
      status: "ON_TRACK",
      startDate: d(1, 9, 0, 0),
      endDate: d(30, 9, 23, 59),
      description: `Planejamento editorial do Instagram **da própria agência** — ciclo de setembro/2026. @agencianix

**Cadência: dia sim, dia não.** Feed nos dias ímpares (01, 03, 05… 29) e stories nos dias pares, para o "dia não" nunca ficar mudo.

**07/09 fica sem feed de propósito.** É feriado nacional, o alcance despenca e a peça queima sem retorno. O dia é coberto por um story institucional curto.

**A âncora é o tipo, não o dia da semana.** Com publicação em dias alternados o dia da semana varia, então a previsibilidade vem do rodízio:
ALCANCE › AUTORIDADE › RELACIONAMENTO › VENDAS › repete.

**Mix de formatos do ciclo:** 5 carrosséis, 5 estáticos e 4 reels. Carrossel carrega profundidade, reels carrega alcance e estático carrega frase — nenhum dos três sozinho sustenta um mês.

**O que se vende aqui é o Diagnóstico de Marca**, não a gestão mensal. A gestão é consequência de um diagnóstico bem feito; vender o contrato direto encurta o funil no lugar errado.

**Duas travas de marca, obrigatórias em toda legenda**
1. Nunca prometer resultado em prazo fechado. Caso é caso, não é promessa.
2. Palavras banidas: milagre, revolucionário, fórmula, segredo, "explodir suas vendas".

**Régua de ouro:** se a peça não gera salvamento, compartilhamento ou conversa no direct, ela não fez nada — por mais curtida que tenha.`,
      members: {
        create: [
          { userId: matheus.id, role: "OWNER", favorite: true },
          { userId: socio.id, role: "EDITOR", favorite: true },
          { userId: social.id, role: "EDITOR", favorite: true },
        ],
      },
    },
  });

  /* ------------------------------- seções --------------------------------- */

  const nixSecoes = [
    "Semana 1 · 01–07/set",
    "Semana 2 · 08–14/set",
    "Semana 3 · 15–21/set",
    "Semana 4 · 22–30/set",
    "Banco de pautas",
    "Publicado",
  ];
  const nixOrdens = initialOrders(nixSecoes.length);
  const secoes = await Promise.all(
    nixSecoes.map((name, i) =>
      db.section.create({ data: { projectId: nix.id, name, order: nixOrdens[i] } }),
    ),
  );
  const semana = (w: number) => secoes[w - 1].id;
  const bancoDePautas = secoes[4].id;

  /* -------------------------------- tags ---------------------------------- */

  const tagTipo: Record<string, string> = {};
  for (const [name, color] of TIPOS) {
    const t = await db.tag.create({ data: { name, color, projectId: nix.id } });
    tagTipo[name] = t.id;
  }
  const tagFormato: Record<string, string> = {};
  for (const [name, color] of FORMATOS) {
    const t = await db.tag.create({ data: { name, color, projectId: nix.id } });
    tagFormato[name] = t.id;
  }

  /* --------------------------- fluxo de produção -------------------------- */

  const etapas = [
    { title: "DEMANDAR", offsetDays: -6, assignee: matheus.id },
    { title: "TRÁFEGO INTERNO", offsetDays: -5, assignee: socio.id },
    { title: "EDIÇÃO", offsetDays: -4, assignee: social.id },
    { title: "LEGENDA", offsetDays: -3, assignee: matheus.id },
    { title: "APROVAÇÃO", offsetDays: -1, assignee: matheus.id },
    { title: "PUBLICAÇÃO", offsetDays: 0, assignee: social.id },
  ];

  await db.subtaskTemplate.create({
    data: {
      projectId: nix.id,
      name: "Fluxo de Produção",
      items: etapas.map((e) => ({
        title: e.title,
        offsetDays: e.offsetDays,
        defaultAssigneeEmail:
          e.assignee === matheus.id
            ? matheus.email
            : e.assignee === socio.id
              ? socio.email
              : social.email,
      })),
    },
  });

  /* -------------------------------- feed ---------------------------------- */

  const donos = { estrategia: matheus, social };
  const ordemPorSemana = new Map<number, Order>();
  let peças = 0;
  let subtarefas = 0;

  for (const post of POSTS) {
    const ord = ordemPorSemana.get(post.week) ?? new Order();
    ordemPorSemana.set(post.week, ord);

    const publicacao = d(post.day, 9, 18, 0);

    const task = await db.task.create({
      data: {
        title: post.title,
        description: post.description,
        creatorId: matheus.id,
        assigneeId: donos[post.owner].id,
        dueAt: publicacao,
        dueHasTime: true,
        estimatedMinutes: post.estimatedMinutes,
        projects: {
          create: { projectId: nix.id, sectionId: semana(post.week), order: ord.next() },
        },
        tags: {
          create: [{ tagId: tagTipo[post.kind] }, { tagId: tagFormato[post.format] }],
        },
        collaborators: { create: [{ userId: socio.id }] },
      },
    });
    peças++;
    await db.activityLog.create({
      data: { taskId: task.id, actorId: matheus.id, type: "created" },
    });

    // Prazos das etapas contados para trás, a partir da data de publicação.
    const subOrd = new Order();
    for (const etapa of etapas) {
      const prazo = new Date(publicacao);
      prazo.setDate(prazo.getDate() + etapa.offsetDays);
      await db.task.create({
        data: {
          title: etapa.title,
          creatorId: matheus.id,
          parentTaskId: task.id,
          subtaskOrder: subOrd.next(),
          dueAt: prazo,
          dueHasTime: true,
          assigneeId: etapa.assignee,
        },
      });
      subtarefas++;
    }
    await db.activityLog.create({
      data: { taskId: task.id, actorId: matheus.id, type: "template_applied" },
    });
  }

  /* ------------------------------- stories -------------------------------- */

  for (const s of STORIES) {
    const ord = ordemPorSemana.get(s.week) ?? new Order();
    ordemPorSemana.set(s.week, ord);

    const task = await db.task.create({
      data: {
        title: s.title,
        description: s.description,
        creatorId: matheus.id,
        assigneeId: social.id,
        dueAt: d(s.day, 9, s.hour, 0),
        dueHasTime: true,
        estimatedMinutes: 30,
        projects: {
          create: { projectId: nix.id, sectionId: semana(s.week), order: ord.next() },
        },
        tags: {
          create: [{ tagId: tagTipo[s.kind] }, { tagId: tagFormato.STORIES }],
        },
      },
    });
    peças++;
    await db.activityLog.create({
      data: { taskId: task.id, actorId: matheus.id, type: "created" },
    });
  }

  /* ---------------------------- banco de pautas --------------------------- */

  const ordBanco = new Order();
  for (const item of BACKLOG) {
    await db.task.create({
      data: {
        title: item.title,
        creatorId: matheus.id,
        description:
          item.description ??
          "Pauta do banco do ciclo de setembro. Ao puxar para uma semana, definir " +
            "formato, prazo com hora e aplicar o template Fluxo de Produção.",
        projects: {
          create: { projectId: nix.id, sectionId: bancoDePautas, order: ordBanco.next() },
        },
        tags: { create: [{ tagId: tagTipo[item.kind] }] },
      },
    });
    peças++;
  }

  console.log(
    `Planejamento NIX: ${peças} tarefas (${POSTS.length} feed, ${STORIES.length} stories, ` +
      `${BACKLOG.length} pautas) + ${subtarefas} subtarefas de fluxo`,
  );

  console.log("");
  console.log("  Acesso:  matheusmigueltome@gmail.com  ·  senha: nix");
  console.log("  Também:  socio2@agencianix.com.br / social@agencianix.com.br");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
