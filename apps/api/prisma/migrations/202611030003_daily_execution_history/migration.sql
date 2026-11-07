-- CreateEnum
CREATE TYPE "DailyTicketOutcome" AS ENUM ('PENDING', 'DONE', 'NOT_DONE');

-- AlterTable
ALTER TABLE "DailyTeamTicket"
  ADD COLUMN "outcome" "DailyTicketOutcome" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "outcomeNote" TEXT,
  ADD COLUMN "pendingReasonId" UUID,
  ADD COLUMN "deferredTo" DATE,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedById" UUID;

-- CreateTable
CREATE TABLE "DailyTeamTicketParticipant" (
  "id" UUID NOT NULL,
  "dailyTeamTicketId" UUID NOT NULL,
  "userId" UUID,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyTeamTicketParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTeamTicketParticipant_dailyTeamTicketId_userId_key" ON "DailyTeamTicketParticipant"("dailyTeamTicketId", "userId");
CREATE INDEX "DailyTeamTicketParticipant_dailyTeamTicketId_idx" ON "DailyTeamTicketParticipant"("dailyTeamTicketId");
CREATE INDEX "DailyTeamTicketParticipant_userId_idx" ON "DailyTeamTicketParticipant"("userId");
CREATE INDEX "DailyTeamTicket_ticketId_workDate_idx" ON "DailyTeamTicket"("ticketId", "workDate");

-- AddForeignKey
ALTER TABLE "DailyTeamTicket" ADD CONSTRAINT "DailyTeamTicket_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicket" ADD CONSTRAINT "DailyTeamTicket_pendingReasonId_fkey" FOREIGN KEY ("pendingReasonId") REFERENCES "PendingReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicketParticipant" ADD CONSTRAINT "DailyTeamTicketParticipant_dailyTeamTicketId_fkey" FOREIGN KEY ("dailyTeamTicketId") REFERENCES "DailyTeamTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicketParticipant" ADD CONSTRAINT "DailyTeamTicketParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
