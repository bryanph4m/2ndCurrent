-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "stripeConnectAccountId" TEXT,
ADD COLUMN "stripeConnectOnboardedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_stripeConnectAccountId_key" ON "Contact"("stripeConnectAccountId");
