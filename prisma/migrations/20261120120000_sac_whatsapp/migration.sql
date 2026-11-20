-- CreateTable
CREATE TABLE "SacConfig" (
    "id" TEXT NOT NULL DEFAULT 'sac',
    "evolutionUrl" TEXT,
    "evolutionKey" TEXT,
    "evolutionInstancia" TEXT NOT NULL DEFAULT 'sac',
    "webhookToken" TEXT NOT NULL,
    "groupJid" TEXT,
    "groupNome" TEXT,
    "senderMode" TEXT NOT NULL DEFAULT 'fromMe',
    "allowedSenders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "albumWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    "slaAmareloHoras" INTEGER NOT NULL DEFAULT 2,
    "slaVermelhoHoras" INTEGER NOT NULL DEFAULT 6,
    "emojisResolvido" TEXT[] DEFAULT ARRAY['✅', '✔️', '☑️']::TEXT[],
    "emojisArquivado" TEXT[] DEFAULT ARRAY['❌']::TEXT[],
    "reagirAoResolver" BOOLEAN NOT NULL DEFAULT true,
    "logPayloads" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SacConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacTag" (
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SacTag_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "SacCard" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "canal" TEXT,
    "categoria" TEXT,
    "evento" TEXT,
    "prioridade" TEXT,
    "titulo" TEXT NOT NULL DEFAULT '',
    "legendaOriginal" TEXT NOT NULL DEFAULT '',
    "tagsDesconhecidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senderId" TEXT,
    "senderName" TEXT,
    "senderFromMe" BOOLEAN NOT NULL DEFAULT false,
    "ordem" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SacCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacAttachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SacAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacComment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "waMessageId" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SacComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacEvent" (
    "id" SERIAL NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "via" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "emoji" TEXT,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SacEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacWebhookLog" (
    "id" SERIAL NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT,
    "payload" JSONB NOT NULL,
    "result" TEXT,

    CONSTRAINT "SacWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacVisto" (
    "jid" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT,
    "vistoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SacVisto_pkey" PRIMARY KEY ("jid")
);

-- CreateIndex
CREATE UNIQUE INDEX "SacCard_waMessageId_key" ON "SacCard"("waMessageId");

-- CreateIndex
CREATE INDEX "SacCard_status_receivedAt_idx" ON "SacCard"("status", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "SacCard_senderId_receivedAt_idx" ON "SacCard"("senderId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SacAttachment_waMessageId_key" ON "SacAttachment"("waMessageId");

-- CreateIndex
CREATE INDEX "SacAttachment_cardId_idx" ON "SacAttachment"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "SacComment_waMessageId_key" ON "SacComment"("waMessageId");

-- CreateIndex
CREATE INDEX "SacComment_cardId_createdAt_idx" ON "SacComment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "SacEvent_cardId_createdAt_idx" ON "SacEvent"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "SacEvent_waMessageId_idx" ON "SacEvent"("waMessageId");

-- CreateIndex
CREATE INDEX "SacWebhookLog_receivedAt_idx" ON "SacWebhookLog"("receivedAt");

-- AddForeignKey
ALTER TABLE "SacCard" ADD CONSTRAINT "SacCard_canal_fkey" FOREIGN KEY ("canal") REFERENCES "SacTag"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacCard" ADD CONSTRAINT "SacCard_categoria_fkey" FOREIGN KEY ("categoria") REFERENCES "SacTag"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacCard" ADD CONSTRAINT "SacCard_evento_fkey" FOREIGN KEY ("evento") REFERENCES "SacTag"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacCard" ADD CONSTRAINT "SacCard_prioridade_fkey" FOREIGN KEY ("prioridade") REFERENCES "SacTag"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacAttachment" ADD CONSTRAINT "SacAttachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "SacCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacComment" ADD CONSTRAINT "SacComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "SacCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacEvent" ADD CONSTRAINT "SacEvent_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "SacCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tags iniciais da legenda (seção 3.2 da spec do SAC). Os eventos são
-- cadastrados depois, na tela de configurações.
INSERT INTO "SacTag" ("slug", "type", "label", "aliases", "color", "sort") VALUES
  ('ig',        'canal',      'Instagram',         ARRAY['insta', 'instagram'],             '#E4405F', 1),
  ('wpp',       'canal',      'WhatsApp',          ARRAY['zap', 'whatsapp'],                '#25D366', 2),
  ('site',      'canal',      'Site',              ARRAY['lp'],                             '#4FA3FF', 3),
  ('email',     'canal',      'E-mail',            ARRAY['mail'],                           '#F2C14E', 4),
  ('tiktok',    'canal',      'TikTok',            ARRAY['tt'],                             '#69C9D0', 5),
  ('outro',     'canal',      'Outro canal',       ARRAY[]::TEXT[],                         '#A093AB', 6),
  ('ingresso',  'categoria',  'Ingresso / lotes',  ARRAY['ingressos', 'lote'],              '#C77BE8', 1),
  ('meia',      'categoria',  'Meia-entrada',      ARRAY['meiaentrada'],                    '#FF8FAB', 2),
  ('local',     'categoria',  'Local / acesso',    ARRAY['endereco', 'estacionamento'],     '#6FDCA5', 3),
  ('horario',   'categoria',  'Horário',           ARRAY['hora'],                           '#FFAB00', 4),
  ('pagamento', 'categoria',  'Pagamento',         ARRAY['pix', 'cartao'],                  '#7DD3FC', 5),
  ('reembolso', 'categoria',  'Reembolso / troca', ARRAY['troca', 'cancelamento'],          '#FF7A59', 6),
  ('outros',    'categoria',  'Outros',            ARRAY[]::TEXT[],                         '#A093AB', 7),
  ('urgente',   'prioridade', 'Urgente',           ARRAY['urg'],                            '#FF5A5F', 1);
