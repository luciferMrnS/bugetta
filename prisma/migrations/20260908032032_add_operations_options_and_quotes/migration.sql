-- CreateTable
CREATE TABLE "RequestOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceKobo" INTEGER,
    "availability" TEXT,
    "estimatedDelivery" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RequestOption_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "optionId" TEXT,
    "productName" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "estimatedDelivery" TEXT,
    "terms" TEXT,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "RequestOption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RequestOption_requestId_idx" ON "RequestOption"("requestId");

-- CreateIndex
CREATE INDEX "Quote_requestId_idx" ON "Quote"("requestId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");
