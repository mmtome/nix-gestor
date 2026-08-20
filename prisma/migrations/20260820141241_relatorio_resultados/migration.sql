-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "igUserId" TEXT,
    "accessToken" TEXT,
    "conectadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatorioMensal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "cliente" TEXT,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "feeds" INTEGER NOT NULL DEFAULT 0,
    "reels" INTEGER NOT NULL DEFAULT 0,
    "stories" INTEGER NOT NULL DEFAULT 0,
    "visualizacoes" INTEGER NOT NULL DEFAULT 0,
    "alcance" INTEGER NOT NULL DEFAULT 0,
    "mediaViewReels" INTEGER NOT NULL DEFAULT 0,
    "mediaViewStories" INTEGER NOT NULL DEFAULT 0,
    "freqExibicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxaEngajamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxaCrescimento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formatoTop" TEXT,
    "seguidores" INTEGER NOT NULL DEFAULT 0,
    "seguidoresDelta" INTEGER NOT NULL DEFAULT 0,
    "idades" JSONB NOT NULL DEFAULT '[]',
    "localizacoes" JSONB NOT NULL DEFAULT '[]',
    "generos" JSONB NOT NULL DEFAULT '[]',
    "horarios" JSONB NOT NULL DEFAULT '[]',
    "notaAudiencia" TEXT,
    "topVisualizacoes" JSONB NOT NULL DEFAULT '[]',
    "piorVisualizacoes" JSONB NOT NULL DEFAULT '[]',
    "topInteracoes" JSONB NOT NULL DEFAULT '[]',
    "piorInteracoes" JSONB NOT NULL DEFAULT '[]',
    "interacoes" INTEGER NOT NULL DEFAULT 0,
    "curtidas" INTEGER NOT NULL DEFAULT 0,
    "comentarios" INTEGER NOT NULL DEFAULT 0,
    "compartilhamentos" INTEGER NOT NULL DEFAULT 0,
    "salvos" INTEGER NOT NULL DEFAULT 0,
    "cliquesLink" INTEGER NOT NULL DEFAULT 0,
    "conclusao" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'manual',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelatorioMensal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_projectId_key" ON "InstagramAccount"("projectId");

-- CreateIndex
CREATE INDEX "RelatorioMensal_projectId_ano_idx" ON "RelatorioMensal"("projectId", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioMensal_projectId_ano_mes_key" ON "RelatorioMensal"("projectId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioMensal" ADD CONSTRAINT "RelatorioMensal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
