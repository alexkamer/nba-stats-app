/*
  Warnings:

  - You are about to drop the column `overUnder` on the `odds` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_odds" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "spread" REAL,
    "over_under" REAL,
    "home_moneyline" INTEGER,
    "away_moneyline" INTEGER,
    "favorite_team_id" INTEGER,
    CONSTRAINT "odds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_odds" ("away_moneyline", "favorite_team_id", "game_id", "home_moneyline", "id", "provider", "spread") SELECT "away_moneyline", "favorite_team_id", "game_id", "home_moneyline", "id", "provider", "spread" FROM "odds";
DROP TABLE "odds";
ALTER TABLE "new_odds" RENAME TO "odds";
CREATE UNIQUE INDEX "odds_game_id_key" ON "odds"("game_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
