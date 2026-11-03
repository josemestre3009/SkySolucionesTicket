ALTER TYPE "Role" ADD VALUE 'TEAM_LEADER';

CREATE TABLE "DailyTeam" (
  "id" UUID NOT NULL,
  "workDate" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyTeamMember" (
  "id" UUID NOT NULL,
  "dailyTeamId" UUID NOT NULL,
  "workDate" DATE NOT NULL,
  "technicianId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyTeamTicket" (
  "id" UUID NOT NULL,
  "dailyTeamId" UUID NOT NULL,
  "workDate" DATE NOT NULL,
  "ticketId" UUID NOT NULL,
  "assignedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyTeamTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyTeam_id_workDate_key" ON "DailyTeam"("id", "workDate");
CREATE UNIQUE INDEX "DailyTeam_workDate_name_key" ON "DailyTeam"("workDate", "name");
CREATE INDEX "DailyTeam_workDate_idx" ON "DailyTeam"("workDate");
CREATE UNIQUE INDEX "DailyTeamMember_technicianId_workDate_key" ON "DailyTeamMember"("technicianId", "workDate");
CREATE UNIQUE INDEX "DailyTeamMember_dailyTeamId_technicianId_key" ON "DailyTeamMember"("dailyTeamId", "technicianId");
CREATE INDEX "DailyTeamMember_dailyTeamId_workDate_idx" ON "DailyTeamMember"("dailyTeamId", "workDate");
CREATE UNIQUE INDEX "DailyTeamTicket_ticketId_workDate_key" ON "DailyTeamTicket"("ticketId", "workDate");
CREATE UNIQUE INDEX "DailyTeamTicket_dailyTeamId_ticketId_key" ON "DailyTeamTicket"("dailyTeamId", "ticketId");
CREATE INDEX "DailyTeamTicket_dailyTeamId_workDate_idx" ON "DailyTeamTicket"("dailyTeamId", "workDate");

ALTER TABLE "DailyTeam" ADD CONSTRAINT "DailyTeam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTeamMember" ADD CONSTRAINT "DailyTeamMember_dailyTeamId_workDate_fkey" FOREIGN KEY ("dailyTeamId", "workDate") REFERENCES "DailyTeam"("id", "workDate") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTeamMember" ADD CONSTRAINT "DailyTeamMember_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicket" ADD CONSTRAINT "DailyTeamTicket_dailyTeamId_workDate_fkey" FOREIGN KEY ("dailyTeamId", "workDate") REFERENCES "DailyTeam"("id", "workDate") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicket" ADD CONSTRAINT "DailyTeamTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTeamTicket" ADD CONSTRAINT "DailyTeamTicket_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
