-- CreateTable
CREATE TABLE "team_game_performance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "opponent_team_id" INTEGER NOT NULL,
    "is_home" BOOLEAN NOT NULL,
    "is_favorite" BOOLEAN,
    "spread" REAL NOT NULL,
    "expected_margin" REAL NOT NULL,
    "actual_margin" REAL NOT NULL,
    "cover_margin" REAL NOT NULL,
    "label" TEXT NOT NULL,
    "computed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_game_performance_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_game_performance_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_game_performance_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_game_performance_tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "performance_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "team_game_performance_tag_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "team_game_performance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "team_game_performance_season_id_team_id_idx" ON "team_game_performance"("season_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_game_performance_game_id_team_id_key" ON "team_game_performance"("game_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_game_performance_tag_performance_id_tag_key" ON "team_game_performance_tag"("performance_id", "tag");
