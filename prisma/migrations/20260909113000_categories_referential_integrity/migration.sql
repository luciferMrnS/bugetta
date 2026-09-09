-- Reference catalogue of categories (mirrors lib/requests/categories.ts).
-- Seeded here so dev and test databases both enforce Request/Offering/
-- Supplier categories against Category.key at the database level.

-- CreateTable
CREATE TABLE "Category" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- Seed categories
INSERT INTO "Category" ("key", "label", "sortOrder") VALUES
('GROCERIES', 'Groceries', 1),
('FOOD', 'Food & Drinks', 2),
('FASHION', 'Fashion & Clothing', 3),
('ELECTRONICS', 'Electronics & Gadgets', 4),
('GIFTS', 'Gifts', 5),
('BEAUTY', 'Beauty & Personal Care', 6),
('HOME_SERVICES', 'Home Services', 7),
('ERRANDS', 'Errands & Delivery', 8),
('REPAIRS', 'Repairs & Maintenance', 9),
('EVENTS', 'Events & Catering', 10),
('PHOTOGRAPHY', 'Photography & Media', 11),
('OTHER', 'Other / Not sure', 12);

-- CreateTable
CREATE TABLE "SupplierCategory" (
    "supplierId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    CONSTRAINT "SupplierCategory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierCategory_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "Category" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("supplierId", "categoryKey")
);

-- CreateIndex
CREATE INDEX "SupplierCategory_categoryKey_idx" ON "SupplierCategory"("categoryKey");

-- Backfill: normalize the existing JSON categories column into the join table
INSERT INTO "SupplierCategory" ("supplierId", "categoryKey")
SELECT s."id", j.value
FROM "Supplier" s, json_each(s."categories") AS j;

-- Rebuild "Supplier" to drop the JSON categories column (joined rows live in
-- SupplierCategory now). Foreign keys are off during the rename dance; the
-- FKs from SupplierCategory and all dependent tables reference by name, so
-- they remain consistent once the new table adopts the "Supplier" name.
PRAGMA foreign_keys=OFF;

-- CreateTable (rebuilt)
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
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
INSERT INTO "new_Supplier" ("id","userId","businessName","description","contactName","phone","whatsapp","email","serviceArea","operatingHours","paymentDetails","logoUrl","status","approvedAt","rejectedAt","createdAt","updatedAt")
SELECT "id","userId","businessName","description","contactName","phone","whatsapp","email","serviceArea","operatingHours","paymentDetails","logoUrl","status","approvedAt","rejectedAt","createdAt","updatedAt" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "Supplier_businessName_idx" ON "Supplier"("businessName");

-- Rebuild "Request" to add the foreign key to Category.key.
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
    CONSTRAINT "Request_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Request_categoryRef_fkey" FOREIGN KEY ("category") REFERENCES "Category" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("id","reference","customerId","category","summary","description","budgetKobo","quantity","location","deliveryDeadline","instructions","images","status","createdAt","updatedAt")
SELECT "id","reference","customerId","category","summary","description","budgetKobo","quantity","location","deliveryDeadline","instructions","images","status","createdAt","updatedAt" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";

-- CreateIndex
CREATE UNIQUE INDEX "Request_reference_key" ON "Request"("reference");

-- CreateIndex
CREATE INDEX "Request_customerId_createdAt_idx" ON "Request"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_category_idx" ON "Request"("category");

-- Rebuild "Offering" to add the foreign key to Category.key.
CREATE TABLE "new_Offering" (
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
    "quantityAvailable" INTEGER,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offering_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offering_categoryRef_fkey" FOREIGN KEY ("category") REFERENCES "Category" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Offering" ("id","supplierId","category","title","description","priceKobo","currency","availability","location","deliveryDetail","images","isActive","quantityAvailable","lastSyncedAt","createdAt","updatedAt")
SELECT "id","supplierId","category","title","description","priceKobo","currency","availability","location","deliveryDetail","images","isActive","quantityAvailable","lastSyncedAt","createdAt","updatedAt" FROM "Offering";
DROP TABLE "Offering";
ALTER TABLE "new_Offering" RENAME TO "Offering";

-- CreateIndex
CREATE INDEX "Offering_supplierId_idx" ON "Offering"("supplierId");

-- CreateIndex
CREATE INDEX "Offering_category_idx" ON "Offering"("category");

-- CreateIndex
CREATE INDEX "Offering_isActive_idx" ON "Offering"("isActive");

-- CreateIndex
CREATE INDEX "Offering_quantityAvailable_idx" ON "Offering"("quantityAvailable");

PRAGMA foreign_keys=ON;