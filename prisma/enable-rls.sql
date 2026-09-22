-- Enable RLS with zero policies on every app table — matches the
-- change-agent-app convention (see prisma/schema.prisma header comment).
-- The app connects via the Postgres owner role (DATABASE_URL), which
-- bypasses RLS by ownership; this only blocks Supabase's default
-- anon/authenticated API roles from reading these tables directly.
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignupAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkshopSurveyResponse" ENABLE ROW LEVEL SECURITY;
-- Created by `prisma migrate`, not by schema.prisma, so it's easy to miss —
-- it also lives in `public` and is flagged by Supabase's
-- rls_disabled_in_public advisor if left out. `prisma migrate deploy` runs
-- as the owner role, so it's unaffected.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
