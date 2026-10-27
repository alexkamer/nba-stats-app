-- AlterTable
ALTER TABLE "player_game_stat" ADD COLUMN "defensive_rebounds" INTEGER;
ALTER TABLE "player_game_stat" ADD COLUMN "offensive_rebounds" INTEGER;
ALTER TABLE "player_game_stat" ADD COLUMN "starter" BOOLEAN;

-- AlterTable
ALTER TABLE "team_game_stat" ADD COLUMN "defensive_rebounds" INTEGER;
ALTER TABLE "team_game_stat" ADD COLUMN "offensive_rebounds" INTEGER;
