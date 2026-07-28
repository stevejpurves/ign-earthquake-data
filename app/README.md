# IGN Earthquake Timeline

A React Router web app that visualizes Spain's IGN earthquake catalog as a
timeline: **event depth (km) plotted downward against time, with marker size
showing magnitude**. Backed by Postgres via Prisma.

![Timeline scatter of earthquake depth against time](docs/screenshot-light.png)

## How it works

- On page load the app **optimistically renders whatever is already in the
  database** — no waiting on the upstream feed.
- If the database hasn't been refreshed in the **last hour**, the page kicks
  off a background `POST /api/refresh`, which pulls the
  [IGN últimos terremotos feed](https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/)
  (the same catalog behind the `wms-inspire/geofisica` WMS layers), parses it,
  and inserts any new events. When it lands, the chart revalidates and picks up
  the new points.
- Refreshes are throttled server-side (one per hour, with a concurrency lock)
  and logged in the `RefreshLog` table; failures degrade gracefully to the
  stored data.

## Stack

- [React Router](https://reactrouter.com/) (framework mode, SSR)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Prisma](https://www.prisma.io/) v7 (`@prisma/adapter-pg`) + PostgreSQL
- Canvas-based scatter plot (no chart library), light/dark aware

## Getting started

Requires Node 20+ and Docker.

```bash
cd app
docker compose up -d       # Postgres 16 on localhost:5432
cp .env.example .env       # DATABASE_URL (defaults match docker-compose)
npm install
npm run db:setup           # apply migrations + seed ~12k events from ../data/data.csv
npm run dev                # http://localhost:5173
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | dev server with HMR |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:up` | start the docker-compose Postgres |
| `npm run db:migrate` | create/apply migrations in dev |
| `npm run db:setup` | `migrate deploy` + seed |
| `npm run db:seed` | seed from `../data/data.csv` (idempotent, skips duplicates) |
| `npm test` | unit tests for the IGN feed parser |
| `npm run typecheck` | route typegen + `tsc` |

## Data model

- `Earthquake` — one row per IGN event (`id` is the IGN event code, e.g.
  `es2021xqtyi`), with origin time (UTC), lat/lon, depth (km), magnitude and
  type, max intensity, and region name.
- `RefreshLog` — one row per refresh attempt (`running`/`success`/`error`);
  the newest successful entry drives the once-per-hour staleness check.

## Notes

- The seed CSV covers the 2021–2022 La Palma swarm; the IGN feed only serves
  the last ~30 days, so the background refresh tops up recent events on top of
  the historical seed.
- The feed is parsed from the portal's HTML table (`app/lib/ign.server.ts`),
  with header-based column mapping that tolerates both the English and Spanish
  variants — covered by `tests/ign-parse.test.ts`.
