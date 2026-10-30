-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_game_projection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "projected_home_score" REAL NOT NULL,
    "projected_away_score" REAL NOT NULL,
    "projected_margin" REAL NOT NULL,
    "margin_stdev" REAL,
    "total_stdev" REAL,
    "spread_bettable" BOOLEAN NOT NULL DEFAULT false,
    "total_bettable" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_correct" BOOLEAN,
    "graded_margin_error" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "game_projection_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_game_projection" ("created_at", "game_id", "graded_at", "graded_correct", "graded_margin_error", "id", "method", "projected_away_score", "projected_home_score", "projected_margin") SELECT "created_at", "game_id", "graded_at", "graded_correct", "graded_margin_error", "id", "method", "projected_away_score", "projected_home_score", "projected_margin" FROM "game_projection";
DROP TABLE "game_projection";
ALTER TABLE "new_game_projection" RENAME TO "game_projection";
CREATE UNIQUE INDEX "game_projection_game_id_key" ON "game_projection"("game_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
