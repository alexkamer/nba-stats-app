-- AlterTable
ALTER TABLE "odds" ADD COLUMN "cover_record_computed_at" DATETIME;

-- CreateTable
CREATE TABLE "daily_stat_leader" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "daily_stat_leader_entry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "daily_stat_leader_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "points_rebounds_assists" INTEGER NOT NULL,
    "had_triple_double" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "daily_stat_leader_entry_daily_stat_leader_id_fkey" FOREIGN KEY ("daily_stat_leader_id") REFERENCES "daily_stat_leader" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "daily_stat_leader_entry_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_cover_record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "ats_wins" INTEGER NOT NULL DEFAULT 0,
    "ats_losses" INTEGER NOT NULL DEFAULT 0,
    "ats_pushes" INTEGER NOT NULL DEFAULT 0,
    "ats_home_wins" INTEGER NOT NULL DEFAULT 0,
    "ats_home_losses" INTEGER NOT NULL DEFAULT 0,
    "ats_home_pushes" INTEGER NOT NULL DEFAULT 0,
    "ats_away_wins" INTEGER NOT NULL DEFAULT 0,
    "ats_away_losses" INTEGER NOT NULL DEFAULT 0,
    "ats_away_pushes" INTEGER NOT NULL DEFAULT 0,
    "ats_current_streak" INTEGER NOT NULL DEFAULT 0,
    "ou_wins" INTEGER NOT NULL DEFAULT 0,
    "ou_losses" INTEGER NOT NULL DEFAULT 0,
    "ou_pushes" INTEGER NOT NULL DEFAULT 0,
    "ou_home_wins" INTEGER NOT NULL DEFAULT 0,
    "ou_home_losses" INTEGER NOT NULL DEFAULT 0,
    "ou_home_pushes" INTEGER NOT NULL DEFAULT 0,
    "ou_away_wins" INTEGER NOT NULL DEFAULT 0,
    "ou_away_losses" INTEGER NOT NULL DEFAULT 0,
    "ou_away_pushes" INTEGER NOT NULL DEFAULT 0,
    "ou_current_streak" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "team_cover_record_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_cover_record_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_stat_leader_date_key" ON "daily_stat_leader"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stat_leader_entry_daily_stat_leader_id_player_id_key" ON "daily_stat_leader_entry"("daily_stat_leader_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_cover_record_team_id_season_id_key" ON "team_cover_record"("team_id", "season_id");
