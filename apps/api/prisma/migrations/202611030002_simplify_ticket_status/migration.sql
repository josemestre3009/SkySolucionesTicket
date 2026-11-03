ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
UPDATE "Ticket" SET "status" = 'PENDING' WHERE "status" IN ('NEW', 'ASSIGNED');
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED');
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus" USING "status"::"TicketStatus";
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "TicketStatus_old";
