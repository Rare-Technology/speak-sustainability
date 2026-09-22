-- CreateTable
CREATE TABLE "WorkshopSurveyResponse" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "biggestObstacle" TEXT,
    "likelihood" INTEGER,
    "supportRequest" TEXT,
    "name" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopSurveyResponse_event_createdAt_idx" ON "WorkshopSurveyResponse"("event", "createdAt");

-- CreateIndex
CREATE INDEX "WorkshopSurveyResponse_ipHash_createdAt_idx" ON "WorkshopSurveyResponse"("ipHash", "createdAt");

-- Same convention as every other table (see prisma/enable-rls.sql): RLS on,
-- zero policies, so Supabase's anon/authenticated roles can't read it.
ALTER TABLE "WorkshopSurveyResponse" ENABLE ROW LEVEL SECURITY;
