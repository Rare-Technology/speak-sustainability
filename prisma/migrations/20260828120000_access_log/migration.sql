-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('page_view', 'download');

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "eventType" "AccessEventType" NOT NULL,
    "packageVariant" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessLog_tokenId_createdAt_idx" ON "AccessLog"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
