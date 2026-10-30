-- AlterTable
ALTER TABLE "odds" ADD COLUMN "open_away_moneyline" INTEGER;
ALTER TABLE "odds" ADD COLUMN "open_home_moneyline" INTEGER;
ALTER TABLE "odds" ADD COLUMN "open_over_under" REAL;
ALTER TABLE "odds" ADD COLUMN "open_spread" REAL;

-- CreateTable
CREATE TABLE "player_prop_odds" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "stat_type" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "line" REAL,
    "odds" INTEGER,
    "open_line" REAL,
    "open_odds" INTEGER,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "player_prop_odds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_prop_odds_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "predictor_snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "home_projection" REAL NOT NULL,
    "away_projection" REAL NOT NULL,
    "home_win_pct" REAL NOT NULL,
    "away_win_pct" REAL NOT NULL,
    "captured_at" DATETIME NOT NULL,
    "graded_correct" BOOLEAN,
    "graded_margin_error" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "predictor_snapshot_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_projection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "projected_home_score" REAL NOT NULL,
    "projected_away_score" REAL NOT NULL,
    "projected_margin" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_correct" BOOLEAN,
    "graded_margin_error" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "game_projection_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_prop_projection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "stat_type" TEXT NOT NULL,
    "prop_odds_id" INTEGER,
    "projected_value" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_correct" BOOLEAN,
    "graded_actual_value" REAL,
    "graded_at" DATETIME,
    CONSTRAINT "player_prop_projection_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_prop_projection_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_prop_projection_prop_odds_id_fkey" FOREIGN KEY ("prop_odds_id") REFERENCES "player_prop_odds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "player_prop_odds_game_id_player_id_stat_type_side_key" ON "player_prop_odds"("game_id", "player_id", "stat_type", "side");

-- CreateIndex
CREATE UNIQUE INDEX "predictor_snapshot_game_id_key" ON "predictor_snapshot"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_projection_game_id_key" ON "game_projection"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_prop_projection_prop_odds_id_key" ON "player_prop_projection"("prop_odds_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_prop_projection_game_id_player_id_stat_type_key" ON "player_prop_projection"("game_id", "player_id", "stat_type");
