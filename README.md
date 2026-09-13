# IGN Earthquake Data 🌏

Earthquake data from Spain's [Instituto Geográfico Nacional (IGN)](https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/), collected during the 2021 La Palma seismic/volcanic crisis, plus a web app for exploring the catalog.

## Layout

- [`app/`](app/) — React Router web app: an earthquake timeline visualization for the region around Tenerife (depth vs. time, marker size = magnitude) backed by Postgres + Prisma. Loads all-magnitude events from the IGN earthquake catalog from 1 Jan 2025 (backfillable further), and auto-refreshes in the background (stale-while-revalidate). See [`app/README.md`](app/README.md) for setup.
- [`data/`](data/) — the original data project: CSV/JSON catalog snapshots, Python fetch/update scripts, and analysis notebooks. See [`data/README.md`](data/README.md).

## Quick start (web app)

```bash
cd app
docker compose up -d      # local Postgres
npm install
npm run db:setup          # migrate + initial IGN load
npm run dev
```

## License

Code is MIT licensed. Data comes from the IGN under Spanish *Re-use of Public Sector Information (RISP)* rules. See [`data/LICENSE.md`](data/LICENSE.md).
