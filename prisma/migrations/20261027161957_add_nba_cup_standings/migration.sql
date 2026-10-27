-- CreateTable
CREATE TABLE "nba_cup_standing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "group_name" TEXT NOT NULL,
    "seed" INTEGER,
    "wins" INTEGER,
    "losses" INTEGER,
    "win_pct" REAL,
    "games_behind" REAL,
    "home_record" TEXT,
    "away_record" TEXT,
    "points_for" REAL,
    "points_against" REAL,
    "point_differential" REAL,
    "streak" TEXT,
    CONSTRAINT "nba_cup_standing_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nba_cup_standing_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "nba_cup_standing_team_id_season_id_key" ON "nba_cup_standing"("team_id", "season_id");
