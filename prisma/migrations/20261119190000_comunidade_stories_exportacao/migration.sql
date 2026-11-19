-- AlterTable
ALTER TABLE "RelatorioMensal" ADD COLUMN     "extras" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "StoryColetado" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "publicadoEm" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "respostas" INTEGER NOT NULL DEFAULT 0,
    "compartilhamentos" INTEGER NOT NULL DEFAULT 0,
    "interacoes" INTEGER NOT NULL DEFAULT 0,
    "coletadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryColetado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DadosExportados" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DadosExportados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryColetado_mediaId_key" ON "StoryColetado"("mediaId");

-- CreateIndex
CREATE INDEX "StoryColetado_projectId_publicadoEm_idx" ON "StoryColetado"("projectId", "publicadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "DadosExportados_projectId_ano_mes_tipo_key" ON "DadosExportados"("projectId", "ano", "mes", "tipo");

-- AddForeignKey
ALTER TABLE "StoryColetado" ADD CONSTRAINT "StoryColetado_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DadosExportados" ADD CONSTRAINT "DadosExportados_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

