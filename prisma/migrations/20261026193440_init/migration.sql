-- CreateTable
CREATE TABLE "conference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "division" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conference_id" INTEGER NOT NULL,
    CONSTRAINT "division_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "venue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "capacity" INTEGER
);

-- CreateTable
CREATE TABLE "position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "color" TEXT,
    "alternate_color" TEXT,
    "logo_url" TEXT,
    "division_id" INTEGER,
    "venue_id" INTEGER,
    CONSTRAINT "team_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "division" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "team_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "headshot_url" TEXT,
    "jersey" TEXT,
    "position_id" INTEGER,
    "current_team_id" INTEGER,
    "height_in" INTEGER,
    "weight_lb" INTEGER,
    "birth_date" DATETIME,
    "birth_place" TEXT,
    "college" TEXT,
    "draft_year" INTEGER,
    "draft_round" INTEGER,
    "draft_pick" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "player_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "player_current_team_id_fkey" FOREIGN KEY ("current_team_id") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "season" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "season_id" INTEGER NOT NULL,
    "season_type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINAL',
    "period" INTEGER,
    "clock" TEXT,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "venue_id" INTEGER,
    "attendance" INTEGER,
    CONSTRAINT "game_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "game_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "game_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "game_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "play" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "game_id" INTEGER NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "period" INTEGER,
    "clock" TEXT,
    "description" TEXT,
    "team_id" INTEGER,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "scoring_play" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "play_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "play_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_game_stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "points" INTEGER,
    "rebounds" INTEGER,
    "assists" INTEGER,
    "steals" INTEGER,
    "blocks" INTEGER,
    "turnovers" INTEGER,
    "fouls" INTEGER,
    "fg_made" INTEGER,
    "fg_att" INTEGER,
    "three_made" INTEGER,
    "three_att" INTEGER,
    "ft_made" INTEGER,
    "ft_att" INTEGER,
    CONSTRAINT "team_game_stat_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_game_stat_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_game_stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "minutes" INTEGER,
    "points" INTEGER,
    "rebounds" INTEGER,
    "assists" INTEGER,
    "steals" INTEGER,
    "blocks" INTEGER,
    "turnovers" INTEGER,
    "fouls" INTEGER,
    "fg_made" INTEGER,
    "fg_att" INTEGER,
    "three_made" INTEGER,
    "three_att" INTEGER,
    "ft_made" INTEGER,
    "ft_att" INTEGER,
    "plus_minus" INTEGER,
    CONSTRAINT "player_game_stat_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_game_stat_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_game_stat_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_season_stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "wins" INTEGER,
    "losses" INTEGER,
    "points_per_game" REAL,
    "opp_points_per_game" REAL,
    "extra" TEXT,
    CONSTRAINT "team_season_stat_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_season_stat_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_season_stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "games_played" INTEGER,
    "points_per_game" REAL,
    "rebounds_per_game" REAL,
    "assists_per_game" REAL,
    "steals_per_game" REAL,
    "blocks_per_game" REAL,
    "turnovers_per_game" REAL,
    "field_goal_pct" REAL,
    "three_point_pct" REAL,
    "free_throw_pct" REAL,
    "extra" TEXT,
    CONSTRAINT "player_season_stat_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_season_stat_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_season_stat_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "standing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "conference_rank" INTEGER,
    "division_rank" INTEGER,
    "wins" INTEGER,
    "losses" INTEGER,
    "win_pct" REAL,
    "games_behind" REAL,
    "streak" TEXT,
    "home_record" TEXT,
    "away_record" TEXT,
    "last_ten" TEXT,
    CONSTRAINT "standing_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "standing_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news_article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "espn_id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "image_url" TEXT,
    "published_at" DATETIME
);

-- CreateTable
CREATE TABLE "news_article_team" (
    "news_article_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,

    PRIMARY KEY ("news_article_id", "team_id"),
    CONSTRAINT "news_article_team_news_article_id_fkey" FOREIGN KEY ("news_article_id") REFERENCES "news_article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news_article_player" (
    "news_article_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,

    PRIMARY KEY ("news_article_id", "player_id"),
    CONSTRAINT "news_article_player_news_article_id_fkey" FOREIGN KEY ("news_article_id") REFERENCES "news_article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "conference_espn_id_key" ON "conference"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "division_espn_id_key" ON "division"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "venue_espn_id_key" ON "venue"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_espn_id_key" ON "position"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_espn_id_key" ON "team"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_espn_id_key" ON "player"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "season_year_type_key" ON "season"("year", "type");

-- CreateIndex
CREATE UNIQUE INDEX "game_espn_id_key" ON "game"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "play_espn_id_key" ON "play"("espn_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_game_stat_game_id_team_id_key" ON "team_game_stat"("game_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_stat_game_id_player_id_key" ON "player_game_stat"("game_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_season_stat_team_id_season_id_key" ON "team_season_stat"("team_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stat_player_id_season_id_key" ON "player_season_stat"("player_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "standing_team_id_season_id_key" ON "standing"("team_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_article_espn_id_key" ON "news_article"("espn_id");
