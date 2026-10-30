-- AlterTable
ALTER TABLE "game_projection" ADD COLUMN "graded_spread_correct" BOOLEAN;
ALTER TABLE "game_projection" ADD COLUMN "graded_total_correct" BOOLEAN;
ALTER TABLE "game_projection" ADD COLUMN "market_margin_at_pick" REAL;
ALTER TABLE "game_projection" ADD COLUMN "market_total_at_pick" REAL;
