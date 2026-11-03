-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_team_cover_record" (
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
    "fav_wins" INTEGER NOT NULL DEFAULT 0,
    "fav_losses" INTEGER NOT NULL DEFAULT 0,
    "dog_wins" INTEGER NOT NULL DEFAULT 0,
    "dog_losses" INTEGER NOT NULL DEFAULT 0,
    "fav_ats_wins" INTEGER NOT NULL DEFAULT 0,
    "fav_ats_losses" INTEGER NOT NULL DEFAULT 0,
    "fav_ats_pushes" INTEGER NOT NULL DEFAULT 0,
    "dog_ats_wins" INTEGER NOT NULL DEFAULT 0,
    "dog_ats_losses" INTEGER NOT NULL DEFAULT 0,
    "dog_ats_pushes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "team_cover_record_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_cover_record_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_team_cover_record" ("ats_away_losses", "ats_away_pushes", "ats_away_wins", "ats_current_streak", "ats_home_losses", "ats_home_pushes", "ats_home_wins", "ats_losses", "ats_pushes", "ats_wins", "id", "ou_away_losses", "ou_away_pushes", "ou_away_wins", "ou_current_streak", "ou_home_losses", "ou_home_pushes", "ou_home_wins", "ou_losses", "ou_pushes", "ou_wins", "season_id", "team_id") SELECT "ats_away_losses", "ats_away_pushes", "ats_away_wins", "ats_current_streak", "ats_home_losses", "ats_home_pushes", "ats_home_wins", "ats_losses", "ats_pushes", "ats_wins", "id", "ou_away_losses", "ou_away_pushes", "ou_away_wins", "ou_current_streak", "ou_home_losses", "ou_home_pushes", "ou_home_wins", "ou_losses", "ou_pushes", "ou_wins", "season_id", "team_id" FROM "team_cover_record";
DROP TABLE "team_cover_record";
ALTER TABLE "new_team_cover_record" RENAME TO "team_cover_record";
CREATE UNIQUE INDEX "team_cover_record_team_id_season_id_key" ON "team_cover_record"("team_id", "season_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
