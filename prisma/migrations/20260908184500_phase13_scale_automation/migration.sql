-- Phase 13 — Scale & Automation.
-- Notification delivery (sandbox channels), an automation ledger, and
-- inventory synchronisation for supplier catalogues.

-- AlterTable
ALTER TABLE "Offering" ADD COLUMN "quantityAvailable" INTEGER;
ALTER TABLE "Offering" ADD COLUMN "lastSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "requestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "summary" TEXT,
    "results" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRun_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'api',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "summary" TEXT,
    "entries" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogSync_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Offering_quantityAvailable_idx" ON "Offering"("quantityAvailable");

-- CreateIndex
CREATE INDEX "Quote_source_idx" ON "Quote"("source");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_key" ON "NotificationPreference"("userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_reference_key" ON "AutomationRun"("reference");

-- CreateIndex
CREATE INDEX "AutomationRun_requestId_idx" ON "AutomationRun"("requestId");

-- CreateIndex
CREATE INDEX "AutomationRun_trigger_createdAt_idx" ON "AutomationRun"("trigger", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSync_reference_key" ON "CatalogSync"("reference");

-- CreateIndex
CREATE INDEX "CatalogSync_supplierId_createdAt_idx" ON "CatalogSync"("supplierId", "createdAt" DESC);