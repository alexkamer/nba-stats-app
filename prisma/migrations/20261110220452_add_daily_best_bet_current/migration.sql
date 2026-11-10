-- CreateTable
CREATE TABLE "daily_best_bet_current" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "stat_type" TEXT NOT NULL,
    "line" REAL NOT NULL,
    "lean" TEXT NOT NULL,
    "odds" INTEGER,
    "edge_ratio_at_selection" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "daily_best_bet_current_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_best_bet_current_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_best_bet_current_date_player_id_stat_type_key" ON "daily_best_bet_current"("date", "player_id", "stat_type");
