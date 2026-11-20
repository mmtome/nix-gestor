-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "directAte" TIMESTAMP(3),
ADD COLUMN     "directCursor" TEXT,
ADD COLUMN     "directDesde" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MensagemDirect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL,
    "daConta" BOOLEAN NOT NULL,
    "autor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "coletadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemDirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensagemDirect_projectId_em_idx" ON "MensagemDirect"("projectId", "em");

-- CreateIndex
CREATE INDEX "MensagemDirect_projectId_conversaId_idx" ON "MensagemDirect"("projectId", "conversaId");

-- AddForeignKey
ALTER TABLE "MensagemDirect" ADD CONSTRAINT "MensagemDirect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
