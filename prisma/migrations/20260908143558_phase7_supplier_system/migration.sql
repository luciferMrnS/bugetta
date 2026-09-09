-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "categories" TEXT NOT NULL DEFAULT '[]',
    "serviceArea" TEXT,
    "operatingHours" TEXT,
    "paymentDetails" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceKobo" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "availability" TEXT,
    "location" TEXT,
    "deliveryDetail" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offering_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "earnedKobo" INTEGER,
    "fulfilledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierEarning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'FULFILLMENT',
    "status" TEXT NOT NULL DEFAULT 'EARNED',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierEarning_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierEarning_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "Supplier_businessName_idx" ON "Supplier"("businessName");

-- CreateIndex
CREATE INDEX "Offering_supplierId_idx" ON "Offering"("supplierId");

-- CreateIndex
CREATE INDEX "Offering_category_idx" ON "Offering"("category");

-- CreateIndex
CREATE INDEX "Offering_isActive_idx" ON "Offering"("isActive");

-- CreateIndex
CREATE INDEX "SupplierRequest_supplierId_status_idx" ON "SupplierRequest"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierRequest_requestId_idx" ON "SupplierRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRequest_supplierId_requestId_key" ON "SupplierRequest"("supplierId", "requestId");

-- CreateIndex
CREATE INDEX "SupplierEarning_supplierId_idx" ON "SupplierEarning"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierEarning_supplierId_requestId_key" ON "SupplierEarning"("supplierId", "requestId");
