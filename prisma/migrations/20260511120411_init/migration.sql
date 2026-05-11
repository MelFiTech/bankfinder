-- CreateTable
CREATE TABLE "ResolvedAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResolvedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResolvedAccount_accountNumber_key" ON "ResolvedAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "ResolvedAccount_accountNumber_idx" ON "ResolvedAccount"("accountNumber");
