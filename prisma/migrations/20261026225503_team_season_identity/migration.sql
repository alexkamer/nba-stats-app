-- CreateTable
CREATE TABLE "team_season_identity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "color" TEXT,
    "alternate_color" TEXT,
    "logo_url" TEXT,
    CONSTRAINT "team_season_identity_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "team_season_identity_team_id_year_key" ON "team_season_identity"("team_id", "year");
