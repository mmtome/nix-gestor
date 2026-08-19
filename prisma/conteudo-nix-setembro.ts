/**
 * Planejamento de conteúdo da Agência NIX — Instagram, setembro/2026.
 *
 * Cadência dia sim, dia não: feed nos dias ímpares, stories nos pares.
 * 07/09 é feriado nacional e fica SEM feed de propósito — só story.
 *
 * O rodízio dos 4 tipos (ALCANCE › AUTORIDADE › RELACIONAMENTO › VENDAS) é o
 * que dá previsibilidade ao perfil, já que o dia da semana varia.
 */

export type Kind = "ALCANCE" | "AUTORIDADE" | "RELACIONAMENTO" | "VENDAS";
export type Formato = "REELS" | "CARROSSEL" | "ESTÁTICO" | "STORIES";

export type Post = {
  title: string;
  kind: Kind;
  format: Formato;
  week: number;
  day: number;
  owner: "estrategia" | "social";
  estimatedMinutes: number;
  description: string;
};

/* -------------------------------------------------------------------------- */
/* feed — 14 peças                                                             */
/* -------------------------------------------------------------------------- */

export const POSTS: Post[] = [
  /* ------------------------------ Semana 1 ------------------------------- */
  {
    title: "Sua marca não precisa de mais post. Precisa de mais repetição.",
    kind: "ALCANCE",
    format: "REELS",
    week: 1,
    day: 1,
    owner: "estrategia",
    estimatedMinutes: 120,
    description: `**Reels de 32s · abertura do mês.**

**Gancho (0–3s):** "Você postou 40 vezes esse mês e ninguém lembra da sua marca. O problema não é volume."

**Desenvolvimento:** a diferença entre frequência e consistência. Quarenta posts sobre quarenta assuntos diferentes ensinam o algoritmo — e a pessoa — que a marca não é sobre nada. Três mensagens repetidas de trinta jeitos diferentes constroem lembrança.

**Fechamento:** "Escolha três coisas para ser. Repita até enjoar. Quando você enjoar, o mercado está começando a ouvir."

**CTA:** "Salva esse pra revisar seu planejamento."

**Legenda:** abrir com a frase do gancho, desenvolver em 3 parágrafos curtos e fechar com pergunta: "Quantos assuntos diferentes você postou nos últimos 30 dias?"

**Nota de produção:** gravar na sala de reunião, luz natural, plano fixo. Legenda queimada obrigatória — 85% assiste sem som.`,
  },
  {
    title: "Como a gente decide em qual rede o cliente NÃO vai estar",
    kind: "AUTORIDADE",
    format: "CARROSSEL",
    week: 1,
    day: 3,
    owner: "estrategia",
    estimatedMinutes: 150,
    description: `**Carrossel de 8 cards.** Peça de método — mostra como a NIX pensa, não o que a NIX vende.

**Card 1:** "Toda agência te diz onde estar. A gente começa dizendo onde NÃO estar."
**Card 2:** Estar em cinco redes com equipe para duas é a forma mais cara de não aparecer em nenhuma.
**Card 3:** Critério 1 — onde o comprador já está? Não o público, o COMPRADOR.
**Card 4:** Critério 2 — o formato que a rede premia é um formato que o cliente consegue sustentar? De nada adianta o TikTok premiar vídeo diário se não há quem grave.
**Card 5:** Critério 3 — a rede aceita o tempo de decisão do produto? Ticket alto com ciclo longo não se resolve em rede de descoberta rápida.
**Card 6:** O que a gente faz com a rede cortada: mantém o perfil vivo, com bio, link e nada mais. Perfil abandonado é pior que perfil ausente.
**Card 7:** Exemplo real: cliente de serviço B2B saiu de 4 redes para 2. Mesmo orçamento, dobro de peças por rede.
**Card 8:** CTA — "Quer saber quais redes cortar? Comenta CANAIS que a gente manda o critério completo."

**Legenda:** contextualizar que a pergunta certa não é "onde estar" e sim "o que a gente consegue sustentar por 12 meses".

**Nota:** aplicar o gradiente violeta só na capa; miolo em grafite para não cansar.`,
  },
  {
    title: "O que tem dentro do anel",
    kind: "RELACIONAMENTO",
    format: "ESTÁTICO",
    week: 1,
    day: 5,
    owner: "social",
    estimatedMinutes: 60,
    description: `**Post estático · institucional de marca.**

Apresenta o significado do símbolo para quem chegou agora: o anel é o método — rigoroso, centrado, repetível. O ponto âmbar fora dele é a ideia que não estava no briefing.

**Arte:** símbolo NIX grande, gradiente violeta, sobre grafite. Sem texto na arte além da assinatura.

**Legenda:** contar a leitura do símbolo em 3 parágrafos curtos e fechar com "Uma agência que só tivesse o anel seria previsível. Uma que só tivesse o ponto seria caótica. A gente vive na tensão entre os dois."

**Nota:** este é o post que a gente fixa no perfil. Vale caprichar na legenda — ela vai ser lida por todo visitante novo.`,
  },

  /* ------------------------------ Semana 2 ------------------------------- */
  {
    title: "Diagnóstico de Marca: 60 minutos, 1 relatório, 0 compromisso",
    kind: "VENDAS",
    format: "CARROSSEL",
    week: 2,
    day: 9,
    owner: "estrategia",
    estimatedMinutes: 150,
    description: `**Carrossel de 7 cards.** Primeira oferta explícita do mês.

**Card 1:** "60 minutos para descobrir por que seu marketing não converte."
**Card 2:** O que é: uma sessão de diagnóstico onde a gente audita perfil, posicionamento, oferta e funil na sua frente.
**Card 3:** O que você recebe: um relatório com os 3 gargalos prioritários e o que fazer com cada um — mesmo que você não contrate a gente.
**Card 4:** O que NÃO é: não é reunião de vendas disfarçada. Se o diagnóstico apontar que você não precisa de agência, a gente escreve isso no relatório.
**Card 5:** Para quem serve: empresa que já vende, já posta e mesmo assim sente que o marketing está patinando.
**Card 6:** Para quem não serve: quem ainda não validou o produto. Marketing não conserta oferta ruim.
**Card 7:** CTA — link na bio, ou "manda DIAGNÓSTICO no direct".

**Legenda:** reforçar a gratuidade e a entrega do relatório independentemente de contratação. Encerrar com a vaga limitada real do mês (não inventar escassez).

**Nota:** conferir com a estratégia quantas vagas de diagnóstico cabem em setembro antes de publicar o número.`,
  },
  {
    title: "3 erros de bio que custam seguidor todo dia",
    kind: "ALCANCE",
    format: "REELS",
    week: 2,
    day: 11,
    owner: "social",
    estimatedMinutes: 120,
    description: `**Reels de 28s · formato lista, alto potencial de salvamento.**

**Gancho (0–3s):** "Sua bio tem 150 caracteres para responder uma pergunta. E ela não está respondendo."

**Erro 1:** descrever o que você é ("Agência de marketing digital") em vez de o que você resolve.
**Erro 2:** link para o site genérico. O link tem que levar para a próxima ação, não para a home.
**Erro 3:** nome do perfil sem palavra-chave. O campo "nome" é indexado na busca; o @ não é a única coisa que aparece.

**Fechamento:** "Reescreve sua bio agora. Leva 4 minutos e é a única mudança de marketing com efeito imediato."

**CTA:** "Comenta sua bio nova que a gente comenta de volta." — compromisso real, alguém precisa responder.

**Nota de produção:** gravar com a tela do celular em picture-in-picture mostrando exemplos. Ritmo rápido, corte a cada 3s.`,
  },
  {
    title: "Engajamento não paga boleto. O que a gente mede no lugar.",
    kind: "AUTORIDADE",
    format: "CARROSSEL",
    week: 2,
    day: 13,
    owner: "estrategia",
    estimatedMinutes: 150,
    description: `**Carrossel de 9 cards.** Peça de opinião forte — a que mais tende a gerar discussão no mês.

**Card 1:** "Curtida é a métrica mais cara do marketing: custa caro e não compra nada."
**Card 2:** Por que engajamento virou métrica padrão: é fácil de medir e bonito de mostrar em relatório.
**Card 3:** O que a gente mede — 1. Alcance de não-seguidores. Mede se o conteúdo sai da bolha.
**Card 4:** 2. Salvamentos e compartilhamentos. São os únicos sinais de que o conteúdo teve utilidade.
**Card 5:** 3. Visitas ao perfil vindas de post. Mede intenção, não reflexo.
**Card 6:** 4. Cliques no link. É o degrau antes do dinheiro.
**Card 7:** 5. Conversas iniciadas no direct. A métrica que mais se aproxima de venda em serviço.
**Card 8:** A curtida continua útil para uma coisa só: sinal precoce de que o gancho funcionou.
**Card 9:** CTA — "Qual dessas cinco você acompanha hoje? Responde aí."

**Legenda:** assumir a posição sem meio-termo. Convidar discordância explicitamente — comentário divergente é distribuição.

**Nota:** este post pede resposta em todos os comentários nas primeiras 2 horas.`,
  },

  /* ------------------------------ Semana 3 ------------------------------- */
  {
    title: "Um dia na NIX: da pauta ao post publicado",
    kind: "RELACIONAMENTO",
    format: "REELS",
    week: 3,
    day: 15,
    owner: "social",
    estimatedMinutes: 180,
    description: `**Reels de 45s · bastidor.** Humaniza a operação e, de quebra, vende método sem parecer venda.

**Roteiro por cena:**
1. Reunião de pauta — mesa, post-it, alguém defendendo uma ideia (5s)
2. Briefing sendo escrito no Gestor (5s)
3. Design abrindo o arquivo, grid da marca aparecendo (8s)
4. Revisão — alguém apontando para a tela e pedindo mudança (7s)
5. Aprovação do cliente no celular (5s)
6. Post no ar, contador de views subindo (5s)
7. Card final: "6 etapas. Todo post. Todo cliente." (5s)

**Trilha:** instrumental, sem letra. Legenda queimada narrando cada etapa.

**CTA:** "É assim que a gente trabalha. Quer esse processo rodando na sua marca? Link na bio."

**Nota de produção:** gravar tudo num mesmo dia, com a equipe avisada. Pedir autorização de imagem de quem aparecer.`,
  },
  {
    title: "Gestão de conteúdo NIX: o que entra no plano",
    kind: "VENDAS",
    format: "ESTÁTICO",
    week: 3,
    day: 17,
    owner: "estrategia",
    estimatedMinutes: 90,
    description: `**Post estático · card de serviço.**

Lista o que está incluso na gestão mensal, sem preço na arte — preço vai no direct.

**Conteúdo da arte:**
- Planejamento editorial mensal
- 12 peças de feed + stories diários
- Roteiro, arte e legenda
- Aprovação em painel próprio
- Relatório mensal com as 5 métricas que importam

**Legenda:** explicar que o plano é fechado em ciclos de 90 dias porque conteúdo abaixo disso não gera dado suficiente para decisão. Encerrar com "Manda PLANO no direct que a gente envia a proposta."

**Nota:** arte em fundo claro (Névoa) — quebra a sequência de posts escuros e destaca no feed. Violeta nos títulos, respeitando a regra de contraste do manual.`,
  },
  {
    title: "Marketing não é o que você fala. É o que lembram.",
    kind: "ALCANCE",
    format: "ESTÁTICO",
    week: 3,
    day: 19,
    owner: "social",
    estimatedMinutes: 60,
    description: `**Post estático · frase de marca.** Peça de alto compartilhamento, feita para print.

**Arte:** a frase ocupando quase toda a peça, tipografia grande em Poppins, fundo em gradiente violeta. Assinatura discreta no rodapé.

**Legenda:** desenvolver em 4 parágrafos — a diferença entre mensagem emitida e mensagem retida, por que repetição é o que transforma uma na outra, e o teste prático: peça para três clientes descreverem sua empresa em uma frase. Se vierem três frases diferentes, o problema não é alcance.

**CTA:** "Marca alguém que precisa ler isso."

**Nota:** é a peça mais provável de virar print. Conferir que a assinatura está legível mesmo em captura de tela recortada.`,
  },
  {
    title: "Anatomia de um criativo que performou 4x",
    kind: "AUTORIDADE",
    format: "CARROSSEL",
    week: 3,
    day: 21,
    owner: "estrategia",
    estimatedMinutes: 180,
    description: `**Carrossel de 8 cards.** Estudo de caso com número real — a peça de maior autoridade do mês.

**Card 1:** "Mesmo produto. Mesma verba. Mesmo público. 4x o resultado. A diferença estava em 3 decisões."
**Card 2:** O antes — print do criativo original, com as métricas embaçadas por sigilo.
**Card 3:** Decisão 1 — o gancho saiu do benefício e foi para o problema. Ninguém procura solução antes de reconhecer que tem um problema.
**Card 4:** Decisão 2 — o texto na imagem caiu de 22 palavras para 7. O criativo é lido em movimento, no polegar.
**Card 5:** Decisão 3 — a prova saiu do fim e subiu para o segundo quadro.
**Card 6:** O depois — print do criativo novo.
**Card 7:** O que NÃO mudou: verba, segmentação e página de destino. Isso é o que torna a comparação honesta.
**Card 8:** CTA — "Quer essa análise no seu criativo? Comenta ANÁLISE."

**Legenda:** deixar explícito que o resultado é de um caso e não promessa. Nada de "resultado garantido".

**Nota:** obrigatório pedir autorização do cliente antes de publicar, mesmo com dado embaçado. Sem autorização, o post não sai — trocar pela pauta reserva do banco.`,
  },

  /* ------------------------------ Semana 4 ------------------------------- */
  {
    title: "A pergunta que a gente faz em toda primeira reunião",
    kind: "RELACIONAMENTO",
    format: "ESTÁTICO",
    week: 4,
    day: 23,
    owner: "estrategia",
    estimatedMinutes: 60,
    description: `**Post estático · pergunta em destaque.**

A pergunta: **"Se sua empresa sumisse amanhã, o que faria falta para o seu cliente?"**

**Arte:** a pergunta centralizada, fundo grafite, aspas e detalhe em âmbar. Muito respiro em volta.

**Legenda:** explicar por que essa é a primeira pergunta — ela separa empresa que entrega resultado de empresa que entrega tarefa. Quem responde "nada, ele contrataria outro" tem um problema de posicionamento, não de marketing. Fechar convidando a resposta nos comentários.

**CTA:** "Responde aí. A gente lê todas."

**Nota:** âmbar sobre grafite dá 9,88:1 de contraste — é a combinação mais legível da marca. Aproveitar.`,
  },
  {
    title: "Quando contratar uma agência (e quando não contratar)",
    kind: "VENDAS",
    format: "REELS",
    week: 4,
    day: 25,
    owner: "estrategia",
    estimatedMinutes: 120,
    description: `**Reels de 40s · venda por honestidade.**

**Gancho (0–3s):** "Metade das empresas que me procuram não deveria contratar agência nenhuma. Inclusive a minha."

**Não contrate se:** o produto ainda não vendeu para estranho; não há quem responda o direct em menos de 24h; a expectativa é resultado em 30 dias.

**Contrate se:** já existe venda acontecendo e ela depende de você pessoalmente; existe verba para 6 meses, não para 1; alguém interno consegue aprovar conteúdo semanalmente.

**Fechamento:** "Agência acelera o que já funciona. Ela não inventa o que não existe."

**CTA:** "Se você se viu na segunda lista, chama no direct."

**Nota:** esse tipo de peça converte menos em volume e muito mais em qualidade de lead. Não medir por curtida.`,
  },
  {
    title: "7 sinais de que sua marca está falando com a pessoa errada",
    kind: "ALCANCE",
    format: "CARROSSEL",
    week: 4,
    day: 27,
    owner: "social",
    estimatedMinutes: 150,
    description: `**Carrossel de 9 cards.** Formato lista, feito para salvamento.

**Card 1:** capa com o título.
**Card 2:** 1. Seus posts com mais curtida são os que menos geram direct.
**Card 3:** 2. Quem comenta nunca é quem compra.
**Card 4:** 3. Você explica o preço mais vezes do que explica o resultado.
**Card 5:** 4. Os seguidores crescem e o faturamento não se mexe.
**Card 6:** 5. As dúvidas do direct são sempre de nível iniciante.
**Card 7:** 6. Seu melhor cliente não te achou pelo Instagram.
**Card 8:** 7. Você já pensou "meu público não valoriza". O público não valoriza porque não é o seu público.
**Card 9:** CTA — "Quantos você marcou? Comenta o número."

**Legenda:** a pergunta do último card puxada para o primeiro parágrafo, porque muita gente responde sem chegar ao fim do carrossel.

**Nota:** o card 9 pede resposta simples de propósito — comentário de um caractere ainda é comentário.`,
  },
  {
    title: "O relatório de setembro da NIX, aberto",
    kind: "AUTORIDADE",
    format: "ESTÁTICO",
    week: 4,
    day: 29,
    owner: "estrategia",
    estimatedMinutes: 90,
    description: `**Post estático · transparência de dados.** Fecha o ciclo mostrando os números do próprio perfil.

**Arte:** cartão de números — alcance de não-seguidores, salvamentos, visitas ao perfil, conversas iniciadas. Números grandes em âmbar sobre grafite.

**Legenda:** comentar o que funcionou e, principalmente, o que não funcionou. Uma agência que só publica acerto não é referência, é vitrine. Encerrar antecipando o tema de outubro.

**Nota:** só publicar com os números reais fechados no dia 28. Se o mês foi ruim, publicar assim mesmo — é justamente isso que dá credibilidade à peça.`,
  },
];

/* -------------------------------------------------------------------------- */
/* stories — dias pares                                                        */
/* -------------------------------------------------------------------------- */

export const STORIES: {
  title: string;
  kind: Kind;
  week: number;
  day: number;
  hour: number;
  description: string;
}[] = [
  {
    title: "Story · Bastidor da reunião de pauta",
    kind: "RELACIONAMENTO",
    week: 1,
    day: 2,
    hour: 11,
    description:
      "Sequência de 3 telas mostrando a mesa da reunião de pauta de setembro. Última tela com enquete: “Quer ver o planejamento completo?”",
  },
  {
    title: "Story · 7 de Setembro (sem feed hoje)",
    kind: "RELACIONAMENTO",
    week: 1,
    day: 7,
    hour: 10,
    description: `Feriado nacional — **não há post de feed hoje, de propósito**. Alcance despenca em feriado e a peça queima sem retorno.

Story único, institucional e curto. Nada de venda.`,
  },
  {
    title: "Story · Caixinha: qual sua maior dúvida de marketing?",
    kind: "RELACIONAMENTO",
    week: 2,
    day: 10,
    hour: 14,
    description:
      "Caixinha de perguntas. As respostas viram pauta do banco — é a forma mais barata de descobrir o que o público quer.",
  },
  {
    title: "Story · Enquete: carrossel ou reels?",
    kind: "RELACIONAMENTO",
    week: 2,
    day: 14,
    hour: 12,
    description:
      "Enquete simples para aquecer o perfil no domingo. Resultado entra no relatório de fim de mês.",
  },
  {
    title: "Story · Repost do card de serviço + link",
    kind: "VENDAS",
    week: 3,
    day: 18,
    hour: 16,
    description:
      "Repost do post de 17/09 com sticker de link para a proposta. Story de venda direta — um por semana, no máximo.",
  },
  {
    title: "Story · Número da semana",
    kind: "AUTORIDADE",
    week: 4,
    day: 22,
    hour: 10,
    description:
      "Uma tela, um número do perfil ou de cliente (com sigilo), e uma frase explicando o que ele significa.",
  },
  {
    title: "Story · Bastidor de gravação",
    kind: "RELACIONAMENTO",
    week: 4,
    day: 26,
    hour: 15,
    description:
      "Making-of do reels de 25/09. Mostrar o erro, não só o take bom — bastidor perfeito não é bastidor.",
  },
  {
    title: "Story · Fechamento do mês e prévia de outubro",
    kind: "RELACIONAMENTO",
    week: 4,
    day: 30,
    hour: 18,
    description:
      "Sequência de 4 telas fechando setembro e antecipando o tema de outubro. Última tela com caixinha de sugestão de pauta.",
  },
];

/* -------------------------------------------------------------------------- */
/* banco de pautas                                                             */
/* -------------------------------------------------------------------------- */

export const BACKLOG: { title: string; kind: Kind; description?: string }[] = [
  {
    title: "Quanto custa NÃO ter identidade visual definida",
    kind: "ALCANCE",
    description:
      "Ângulo de custo invisível: retrabalho de arte, incoerência entre peças, tempo perdido em aprovação.",
  },
  {
    title: "Reserva: análise de criativo (caso 2)",
    kind: "AUTORIDADE",
    description:
      "**Pauta reserva do post de 21/09.** Usar se o cliente não autorizar o caso principal.",
  },
  { title: "Por que a gente não trabalha com contrato mensal", kind: "AUTORIDADE" },
  { title: "O briefing que a gente pede antes de qualquer arte", kind: "AUTORIDADE" },
  { title: "5 ferramentas que a NIX usa e não são pagas", kind: "ALCANCE" },
  { title: "Como ler o relatório da sua agência sem ser enganado", kind: "AUTORIDADE" },
  { title: "Apresentação da equipe — quem faz o quê", kind: "RELACIONAMENTO" },
  { title: "Depoimento em vídeo de cliente", kind: "VENDAS" },
  { title: "Antes e depois de perfil (com autorização)", kind: "VENDAS" },
  {
    title: "Série: erros que a NIX já cometeu",
    kind: "RELACIONAMENTO",
    description: "Formato recorrente para outubro. Validar tom com a sociedade antes.",
  },
];
