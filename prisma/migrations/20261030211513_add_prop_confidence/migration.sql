-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_player_prop_projection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "stat_type" TEXT NOT NULL,
    "prop_odds_id" INTEGER,
    "line" REAL,
    "projected_value" REAL NOT NULL,
    "stdev" REAL,
    "bettable" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_correct" BOOLEAN,
    "graded_actual_value" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "player_prop_projection_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_prop_projection_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_prop_projection_prop_odds_id_fkey" FOREIGN KEY ("prop_odds_id") REFERENCES "player_prop_odds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_player_prop_projection" ("created_at", "game_id", "graded_actual_value", "graded_at", "graded_correct", "id", "line", "method", "player_id", "projected_value", "prop_odds_id", "stat_type") SELECT "created_at", "game_id", "graded_actual_value", "graded_at", "graded_correct", "id", "line", "method", "player_id", "projected_value", "prop_odds_id", "stat_type" FROM "player_prop_projection";
DROP TABLE "player_prop_projection";
ALTER TABLE "new_player_prop_projection" RENAME TO "player_prop_projection";
CREATE UNIQUE INDEX "player_prop_projection_prop_odds_id_key" ON "player_prop_projection"("prop_odds_id");
CREATE UNIQUE INDEX "player_prop_projection_game_id_player_id_stat_type_key" ON "player_prop_projection"("game_id", "player_id", "stat_type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
