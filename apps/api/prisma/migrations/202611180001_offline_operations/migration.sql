-- CreateTable
CREATE TABLE "OfflineOperation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "teamId" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineOperation_userId_createdAt_idx" ON "OfflineOperation"("userId", "createdAt");
