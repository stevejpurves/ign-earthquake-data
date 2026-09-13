import {
  INITIAL_LOAD_FROM,
  REGION_BBOX,
  REGION_NAME,
} from "../app/lib/config.server";
import { prisma } from "../app/lib/db.server";
import {
  importFromIgn,
  recordRefreshSuccess,
} from "../app/lib/refresh.server";

// Initial data load: pull the IGN feed from INITIAL_LOAD_FROM to now,
// restricted to the configured region, and mark the database as freshly
// refreshed so the first page view doesn't immediately re-fetch.
async function main() {
  const { latMin, latMax, lonMin, lonMax } = REGION_BBOX;
  console.log(
    `Initial load from IGN since ${INITIAL_LOAD_FROM.toISOString().slice(0, 10)}, ` +
      `${REGION_NAME} region (lat ${latMin}..${latMax}, lon ${lonMin}..${lonMax})`,
  );
  const { fetched, inRegion, upserted, start } = await importFromIgn();
  const from = start.toISOString().slice(0, 10);
  await recordRefreshSuccess(upserted, `Initial load (since ${from})`);
  console.log(
    `Fetched ${fetched} events since ${from}; ${inRegion} in region; ${upserted} inserted.`,
  );
}

main()
  .catch((e) => {
    console.error("Initial load failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
