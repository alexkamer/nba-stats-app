import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Same driver-adapter pattern as ingest/lib/db.ts (Prisma 7 requirement for
// SQLite — see PLAN.md Sec 3/M1). Next.js dev-mode hot reload can otherwise
// create a new PrismaClient (and a new SQLite connection) per reload, so we
// cache the instance on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
