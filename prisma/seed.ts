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
import { initialOrders } from "../src/lib/ordering";

const db = new PrismaClient();

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

  console.log("");
  console.log("  Acesso:  matheusmigueltome@gmail.com  ·  senha: nix");
  console.log("  Também:  socio2@agencianix.com.br / social@agencianix.com.br");
  console.log("");
  console.log("  Nenhuma tarefa foi criada — o app começa vazio, de propósito.");
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
