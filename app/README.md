# IGN Earthquake Timeline — Tenerife

A React Router web app that visualizes the IGN earthquake catalog for the
region immediately around Tenerife as a timeline: **event depth (km) plotted
downward against time, with marker size showing magnitude**. Backed by
Postgres via Prisma.

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
- Events are restricted to a window starting **1 Jul 2026** and a bounding box
  around **Tenerife** (island plus nearby offshore, including the Enmedio
  seamount area). Both are configurable via `INITIAL_LOAD_FROM`,
  `REGION_BBOX`, and `REGION_NAME` in `.env` — see `.env.example` and
  `app/lib/config.server.ts`.

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
npm run db:setup           # apply migrations + initial IGN load since 1 Jul 2026
npm run dev                # http://localhost:5173
```

The initial load needs network access to `www.ign.es`. If it fails (or you
skip it), the app still works: the first page view triggers the same load in
the background.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | dev server with HMR |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:up` | start the docker-compose Postgres |
| `npm run db:migrate` | create/apply migrations in dev |
| `npm run db:setup` | `migrate deploy` + initial IGN load |
| `npm run db:seed` | initial IGN load (idempotent, skips duplicates) |
| `npm test` | unit tests for the feed parser and region/window filters |
| `npm run typecheck` | route typegen + `tsc` |

## Deploying to Vercel + Supabase

The app is a standard React Router SSR app, so it deploys to Vercel with the
database on Supabase Postgres.

### 1. Create the Supabase database

1. Create a project at [supabase.com](https://supabase.com) and note the
   database password.
2. In the dashboard, open **Connect** and copy the **Session pooler**
   connection string (IPv4-friendly, works for both migrations and the app):

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

### 2. Migrate and run the initial load (from your machine)

```bash
cd app
DATABASE_URL="<session-pooler-url>" npm run db:setup
```

This applies the Prisma migrations and pulls the initial IGN load (since
`INITIAL_LOAD_FROM`, Tenerife region) straight into Supabase. Re-running it is
safe — the load skips duplicates.

### 3. Deploy the app on Vercel

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `app` (this is a monorepo). Vercel auto-detects
   the React Router framework; the default build command (`npm run build`) is
   correct, and `postinstall` regenerates the Prisma client during the build.
3. Add the environment variable `DATABASE_URL` = the same session-pooler URL
   (plus `INITIAL_LOAD_FROM` / `REGION_BBOX` / `REGION_NAME` if you want
   non-default values).
4. Deploy.

### Notes

- **Function duration**: the background refresh (`POST /api/refresh`) calls
  the IGN feed with a 30 s timeout, so give functions headroom — set
  **Settings → Functions → Max Duration** to 60 s (or add a `vercel.json`
  with `{"functions": {"**": {"maxDuration": 60}}}`) if your plan defaults
  lower.
- **Refresh cadence**: refreshes are triggered by page views (throttled to
  one per hour server-side). With zero traffic the data simply stays put
  until the next visit — fine for this app. If you ever want unattended
  updates, add a Vercel Cron job and a `loader` (GET) handler to
  `app/routes/api.refresh.ts`, since cron invokes with GET.
- **Connection pooling**: each serverless instance opens its own small pg
  pool, which the session pooler absorbs at this app's scale. If you ever
  see connection-limit errors under load, switch `DATABASE_URL` to the
  **Transaction pooler** string (port `6543`) for the Vercel env var — but
  keep using the session-pooler URL for running migrations.
- If Vercel fails to detect the framework (older accounts), install the
  preset and redeploy:

  ```bash
  npm install @vercel/react-router
  ```

  ```ts
  // react-router.config.ts
  import { vercelPreset } from "@vercel/react-router/vite";
  export default { ssr: true, presets: [vercelPreset()] } satisfies Config;
  ```

## Data model

- `Earthquake` — one row per IGN event (`id` is the IGN event code, e.g.
  `es2021xqtyi`), with origin time (UTC), lat/lon, depth (km), magnitude and
  type, max intensity, and region name.
- `RefreshLog` — one row per refresh attempt (`running`/`success`/`error`);
  the newest successful entry drives the once-per-hour staleness check.

## Notes

- The initial load and every refresh request a `dias` window from the feed
  sized to cover the gap back to the newest stored event (or back to
  `INITIAL_LOAD_FROM` on an empty database) — the same mechanism the original
  Python scripts in `../data` used to build multi-month datasets.
- Events outside the region box or before the window start are dropped at
  insert time, and the loader filters on the same bounds, so changing the
  config narrows the view immediately without a reload of old data.
- The feed is parsed from the portal's HTML table (`app/lib/ign.server.ts`),
  with header-based column mapping that tolerates both the English and Spanish
  variants — covered by `tests/ign-parse.test.ts`.
