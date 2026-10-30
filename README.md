This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Data source

By default (`DATA_SOURCE` unset or `db`) the app reads from the local Prisma/SQLite database (`prisma/dev.db`), which needs seeding via `npx tsx ingest/run-all-sync.ts` and a recurring refresh to stay current (see `scripts/run-daily-sync.sh`).

Set `DATA_SOURCE=espn` to skip the database entirely and run purely against live ESPN endpoints — no seeding required, at the cost of some simplifications (no multi-season history, no player season-rank, no news tagging, no per-game box-score splits). See `docs/DATA_SOURCES.md` for the full page-by-page breakdown.

## Betting insights (`/betting`)

See `docs/PREDICTIONS.md` for how our own game/player-prop projections are computed, how "confident" picks are chosen, and how everything gets graded against final results.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
