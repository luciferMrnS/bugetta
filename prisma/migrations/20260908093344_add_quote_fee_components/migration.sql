-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "optionId" TEXT,
    "productName" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "serviceFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "information" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "estimatedDelivery" TEXT,
    "terms" TEXT,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "RequestOption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("createdAt", "estimatedDelivery", "id", "optionId", "priceKobo", "productName", "requestId", "status", "terms", "updatedAt", "validUntil") SELECT "createdAt", "estimatedDelivery", "id", "optionId", "priceKobo", "productName", "requestId", "status", "terms", "updatedAt", "validUntil" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE INDEX "Quote_requestId_idx" ON "Quote"("requestId");
CREATE INDEX "Quote_status_idx" ON "Quote"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
