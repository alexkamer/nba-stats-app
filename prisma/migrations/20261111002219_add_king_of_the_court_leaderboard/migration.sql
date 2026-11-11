-- CreateTable
CREATE TABLE "king_of_the_court_leaderboard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "king_of_the_court_entry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leaderboard_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "projected_value" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "graded_at" DATETIME,
    "graded_hit" BOOLEAN,
    CONSTRAINT "king_of_the_court_entry_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "king_of_the_court_leaderboard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "king_of_the_court_entry_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "king_of_the_court_leaderboard_date_key" ON "king_of_the_court_leaderboard"("date");

-- CreateIndex
CREATE UNIQUE INDEX "king_of_the_court_entry_leaderboard_id_player_id_key" ON "king_of_the_court_entry"("leaderboard_id", "player_id");
