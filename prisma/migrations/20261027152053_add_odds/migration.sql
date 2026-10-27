-- CreateTable
CREATE TABLE "odds" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "spread" REAL,
    "overUnder" REAL,
    "home_moneyline" INTEGER,
    "away_moneyline" INTEGER,
    "favorite_team_id" INTEGER,
    CONSTRAINT "odds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "odds_game_id_key" ON "odds"("game_id");
