/**
 * Relatório de exemplo — Uberaba Rodeo Show, julho/2026.
 *
 * Os números vêm do relatório que a agência já entregou ao cliente. Serve
 * como referência viva do formato: abrir a aba Relatório deste projeto mostra
 * exatamente o nível de apresentação que a ferramenta produz.
 *
 * PROCEDÊNCIA DOS DADOS — importa para ninguém tratar estimativa como medição:
 *
 * - Tudo que está escrito por extenso no relatório original entrou exato:
 *   volume de posts, alcance, visualizações, seguidores, taxas, demografia,
 *   destaques de desempenho e a conclusão.
 * - A curva de horários foi lida do gráfico, não de uma tabela. A forma está
 *   certa; os valores são aproximados.
 * - Os totais de interação do mês (curtidas, comentários, compartilhamentos,
 *   salvos) ficaram ZERADOS de propósito: no original eles só existem como
 *   barra de gráfico, e chutar número de cliente para preencher tela é
 *   exatamente o que um relatório não pode fazer. Ficam para preenchimento na
 *   aba "Totais do mês".
 * - Cliques em links é 0 de verdade: o relatório original registra o mês com
 *   zero cliques, por causa de um link errado na divulgação.
 */

import type { PrismaClient } from "@prisma/client";

export const URS_PROJETO = {
  name: "Uberaba Rodeo Show",
  color: "#FB7601",
  icon: "instagram",
  description: `Conta de cliente. **Julho/2026 foi o mês de pico**: anúncio de line-up e abertura de vendas.

O relatório de julho está na aba **Relatório** — é o modelo do que a agência entrega ao cliente todo mês.`,
};

export const URS_RELATORIO = {
  ano: 2026,
  mes: 7,
  cliente: "Uberaba Rodeo Show",

  posts: 210,
  feeds: 25,
  reels: 24,
  stories: 161,

  visualizacoes: 11_743_068,
  alcance: 1_245_310,
  mediaViewReels: 57_396,
  mediaViewStories: 14_552,
  freqExibicao: 9.43,
  taxaEngajamento: 5.14,
  taxaCrescimento: 137.01,
  formatoTop: "Reels",

  seguidores: 40_408,
  seguidoresDelta: 23_701,

  idades: [
    { rotulo: "25-34 anos", pct: 39.7 },
    { rotulo: "35-44 anos", pct: 25.3 },
    { rotulo: "18-24 anos", pct: 20.7 },
    { rotulo: "45-54 anos", pct: 10.1 },
    { rotulo: "55-64 anos", pct: 1.9 },
  ],
  localizacoes: [
    { rotulo: "Uberaba", pct: 57.29 },
    { rotulo: "Uberlândia", pct: 6.16 },
    { rotulo: "Araxá", pct: 5.47 },
    { rotulo: "Conceição", pct: 2.61 },
    { rotulo: "Igarapava", pct: 2.42 },
  ],
  generos: [
    { rotulo: "Feminino", pct: 62.9 },
    { rotulo: "Masculino", pct: 28.3 },
    { rotulo: "Não informado", pct: 8.8 },
  ],

  // Lida do gráfico do relatório original — forma correta, valores aproximados.
  horarios: [
    { hora: 0, valor: 2500 },
    { hora: 1, valor: 4000 },
    { hora: 2, valor: 8000 },
    { hora: 3, valor: 11500 },
    { hora: 4, valor: 13500 },
    { hora: 5, valor: 14500 },
    { hora: 6, valor: 15500 },
    { hora: 7, valor: 17000 },
    { hora: 8, valor: 18300 },
    { hora: 9, valor: 17600 },
    { hora: 10, valor: 17100 },
    { hora: 11, valor: 17300 },
    { hora: 12, valor: 17800 },
    { hora: 13, valor: 18300 },
    { hora: 14, valor: 18900 },
    { hora: 15, valor: 19000 },
    { hora: 16, valor: 19000 },
    { hora: 17, valor: 18700 },
    { hora: 18, valor: 16800 },
    { hora: 19, valor: 12000 },
    { hora: 20, valor: 8000 },
    { hora: 21, valor: 5200 },
    { hora: 22, valor: 3400 },
    { hora: 23, valor: 2500 },
  ],

  notaAudiencia:
    "Houve mudança no ranking de localizações: em junho o 5º lugar era de Frutal, que perdeu espaço para Igarapava.",

  topVisualizacoes: [
    { rotulo: "FEED", valor: 927_055, nota: "Anúncio da line-up · 22/07" },
    { rotulo: "REEL", valor: 292_904, nota: "Anúncio Zé Neto & Cristiano · 20/07" },
    { rotulo: "FEED", valor: 299_038, nota: "3 dias de show" },
  ],
  piorVisualizacoes: [
    { rotulo: "FEED", valor: 26_079 },
    { rotulo: "FEED", valor: 25_117, nota: "Venda aberta" },
  ],
  topInteracoes: [
    { rotulo: "FEED", valor: 47_541, nota: "36,36% de todas as interações do mês" },
    { rotulo: "REEL", valor: 17_806 },
    { rotulo: "FEED", valor: 13_051 },
  ],
  piorInteracoes: [
    { rotulo: "REEL", valor: 204 },
    { rotulo: "REEL", valor: 289 },
  ],

  cliquesLink: 0,

  conclusao: [
    "Julho foi um mês absolutamente positivo para o perfil do URS. Os seguidores foram de 16.707 para 40.408, um crescimento de +137,01%.",
    "O pico de ganho de seguidores ficou concentrado entre 20 e 24/07, exatamente os dias de anúncio da line-up e precedendo a abertura de vendas.",
    "O alcance de 1.245.310 contas com 40.408 seguidores significa que o conteúdo alcançou mais de 30 vezes além do público próprio.",
    "A taxa de engajamento do perfil ficou em 5,14% e a média por post em 6,75%.",
    "O post de anúncio da line-up (22/07) é o melhor conteúdo do mês e responde sozinho por 36,36% de todas as interações. Ele gerou 2.936 novos seguidores e 10.637 visitas ao perfil.",
    "O reel de anúncio de Zé Neto & Cristiano (20/07) foi o mais visto do mês.",
    "Carrossel foi o formato com melhor desempenho: alcance médio de 82.188 e 4.056 interações em média — o dobro do alcance de uma foto única (36.105).",
    "O mês registrou 0 cliques em links do perfil. Houve um equívoco no link enviado para a divulgação, já sanado.",
    "Para agosto, a expectativa é de neutralização após o pico, já que não há mais novidades como line-up e início de vendas. O ideal é manter o ritmo com conteúdos virais, contagem regressiva, lotes e sorteios pontuais para incentivar comentários e compartilhamentos.",
  ].join("\n"),
};

/**
 * Cria (ou atualiza) o projeto de exemplo e seu relatório.
 * Idempotente: rodar de novo não duplica nada.
 */
export async function aplicarExemploUrs(
  db: PrismaClient,
  membros: { userId: string; role: "OWNER" | "EDITOR" | "VIEWER" }[],
) {
  const existente = await db.project.findFirst({
    where: { name: URS_PROJETO.name },
    select: { id: true },
  });

  const projeto =
    existente ??
    (await db.project.create({
      data: {
        ...URS_PROJETO,
        status: "ON_TRACK",
        members: { create: membros.map((m) => ({ userId: m.userId, role: m.role })) },
      },
      select: { id: true },
    }));

  const { ano, mes, ...campos } = URS_RELATORIO;

  await db.relatorioMensal.upsert({
    where: { projectId_ano_mes: { projectId: projeto.id, ano, mes } },
    create: { projectId: projeto.id, ano, mes, ...campos, fonte: "manual" },
    update: { ...campos, fonte: "manual" },
  });

  return projeto.id;
}
