# IGN Earthquake Data 🌏

Earthquake data from Spain's [Instituto Geográfico Nacional (IGN)](https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/), collected during the 2021 La Palma seismic/volcanic crisis, plus a web app for exploring the catalog.

## Layout

- [`app/`](app/) — React Router web app: an earthquake timeline visualization (depth vs. time, marker size = magnitude) backed by Postgres + Prisma. Auto-refreshes its database from the IGN feed in the background. See [`app/README.md`](app/README.md) for setup.
- [`data/`](data/) — the original data project: CSV/JSON catalog snapshots, Python fetch/update scripts, and analysis notebooks. See [`data/README.md`](data/README.md).

## Quick start (web app)

```bash
cd app
docker compose up -d      # local Postgres
npm install
npm run db:setup          # migrate + seed from ../data/data.csv
npm run dev
```

## License

Code is MIT licensed. Data comes from the IGN under Spanish *Re-use of Public Sector Information (RISP)* rules. See [`data/LICENSE.md`](data/LICENSE.md).
