-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetKobo" INTEGER,
    "quantity" TEXT,
    "location" TEXT,
    "deliveryDeadline" DATETIME,
    "instructions" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("budgetKobo", "category", "createdAt", "customerId", "deliveryDeadline", "description", "id", "images", "instructions", "location", "quantity", "reference", "status", "summary", "updatedAt") SELECT "budgetKobo", "category", "createdAt", "customerId", "deliveryDeadline", "description", "id", "images", "instructions", "location", "quantity", "reference", "status", "summary", "updatedAt" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE UNIQUE INDEX "Request_reference_key" ON "Request"("reference");
CREATE INDEX "Request_customerId_createdAt_idx" ON "Request"("customerId", "createdAt" DESC);
CREATE INDEX "Request_status_idx" ON "Request"("status");
CREATE INDEX "Request_category_idx" ON "Request"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- Phase 6 renames legacy statuses to the new lifecycle vocabulary.
UPDATE "Request" SET "status" = 'REQUESTED' WHERE "status" IN ('SUBMITTED', 'PENDING');
UPDATE "Request" SET "status" = 'PAYMENT_PENDING' WHERE "status" = 'PENDING_PAYMENT';
UPDATE "Request" SET "status" = 'PROCESSING' WHERE "status" = 'FULFILLING';
