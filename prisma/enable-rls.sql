-- Enable RLS with zero policies on every app table — matches the
-- change-agent-app convention (see prisma/schema.prisma header comment).
-- The app connects via the Postgres owner role (DATABASE_URL), which
-- bypasses RLS by ownership; this only blocks Supabase's default
-- anon/authenticated API roles from reading these tables directly.
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignupAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessLog" ENABLE ROW LEVEL SECURITY;
