/*
  Warnings:

  - You are about to drop the column `away_projection` on the `predictor_snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `home_projection` on the `predictor_snapshot` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_predictor_snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "home_win_pct" REAL NOT NULL,
    "away_win_pct" REAL NOT NULL,
    "captured_at" DATETIME NOT NULL,
    "graded_correct" BOOLEAN,
    "graded_margin_error" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "predictor_snapshot_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_predictor_snapshot" ("away_win_pct", "captured_at", "game_id", "graded_at", "graded_correct", "graded_margin_error", "home_win_pct", "id") SELECT "away_win_pct", "captured_at", "game_id", "graded_at", "graded_correct", "graded_margin_error", "home_win_pct", "id" FROM "predictor_snapshot";
DROP TABLE "predictor_snapshot";
ALTER TABLE "new_predictor_snapshot" RENAME TO "predictor_snapshot";
CREATE UNIQUE INDEX "predictor_snapshot_game_id_key" ON "predictor_snapshot"("game_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
