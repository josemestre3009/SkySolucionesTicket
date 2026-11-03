CREATE TABLE "CompanySettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "companyName" TEXT NOT NULL DEFAULT 'Sky Soluciones',
  "supportPhone" TEXT,
  "supportEmail" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
  "ticketPrefix" TEXT NOT NULL DEFAULT 'TK',
  "businessHours" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "CompanySettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
