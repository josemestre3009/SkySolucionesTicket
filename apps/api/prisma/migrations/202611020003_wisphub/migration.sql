CREATE TABLE "WispHubSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "baseUrl" TEXT NOT NULL DEFAULT 'https://api.wisphub.net/api/',
  "apiKeyEncrypted" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WispHubSettings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "WispHubSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
