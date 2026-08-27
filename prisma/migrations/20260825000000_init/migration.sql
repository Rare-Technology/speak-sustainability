-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'held', 'rejected');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('confirm', 'access');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "organization" TEXT,
    "consentGivenAt" TIMESTAMP(3),
    "consentConfirmedAt" TIMESTAMP(3),
    "consentTextVersion" TEXT,
    "feedbackConsentGivenAt" TIMESTAMP(3),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "installEmailSentAt" TIMESTAMP(3),
    "sourceIpHash" TEXT,
    "userAgent" TEXT,
    "confirmIpHash" TEXT,
    "confirmUserAgent" TEXT,
    "markedForDeletionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupAttempt" (
    "id" TEXT NOT NULL,
    "emailAttempted" TEXT,
    "ipHash" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_consentConfirmedAt_createdAt_idx" ON "Contact"("consentConfirmedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_reviewStatus_idx" ON "Contact"("reviewStatus");

-- CreateIndex
CREATE INDEX "Token_contactId_kind_idx" ON "Token"("contactId", "kind");

-- CreateIndex
CREATE INDEX "Token_expiresAt_idx" ON "Token"("expiresAt");

-- CreateIndex
CREATE INDEX "SignupAttempt_emailAttempted_createdAt_idx" ON "SignupAttempt"("emailAttempted", "createdAt");

-- CreateIndex
CREATE INDEX "SignupAttempt_ipHash_createdAt_idx" ON "SignupAttempt"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

