import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Ingestion scripts are always run via `npx tsx ingest/<script>.ts` from the
// repo root (npm scripts do this), so this relative path matches
// prisma.config.ts's Migrate URL.
const adapter = new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });

export const prisma = new PrismaClient({ adapter });
