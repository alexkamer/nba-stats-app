-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_briefing_summary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RECAP',
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_briefing_summary" ("date", "generated_at", "id", "text") SELECT "date", "generated_at", "id", "text" FROM "briefing_summary";
DROP TABLE "briefing_summary";
ALTER TABLE "new_briefing_summary" RENAME TO "briefing_summary";
CREATE UNIQUE INDEX "briefing_summary_date_key" ON "briefing_summary"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
