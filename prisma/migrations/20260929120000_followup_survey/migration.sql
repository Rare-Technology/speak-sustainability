-- CreateTable
CREATE TABLE "FollowUpSurveyResponse" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "biggestObstacle" TEXT,
    "principlesLikelihood" INTEGER,
    "toolLikelihood" INTEGER,
    "supportRequest" TEXT,
    "recommendation" TEXT,
    "mostValuable" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpSurveyResponse_event_createdAt_idx" ON "FollowUpSurveyResponse"("event", "createdAt");

-- Same convention as every other table (see prisma/enable-rls.sql): RLS on,
-- zero policies, so Supabase's anon/authenticated roles can't read it.
ALTER TABLE "FollowUpSurveyResponse" ENABLE ROW LEVEL SECURITY;
