// Shared Prisma client singleton for Vercel Node.js serverless functions.
//
// Serverless functions can stay warm between invocations, so without this
// cache each warm invocation would re-create a client (and its connection
// pool) from scratch. Standard pattern, copied from the same one used in
// change-agent-app.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__speakSustainabilityPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__speakSustainabilityPrisma = prisma;
}
