import {
  INITIAL_LOAD_FROM,
  REGION_BBOX,
  REGION_NAME,
} from "../app/lib/config.server";
import { prisma } from "../app/lib/db.server";
import { importRange } from "../app/lib/refresh.server";

// Backfill older history from the IGN catalog into the database.
//
//   npm run db:backfill                        # fill INITIAL_LOAD_FROM → oldest stored event
//   npm run db:backfill -- --from 2020-01-01   # reach further back
//   npm run db:backfill -- --from 2020-01-01 --to 2022-06-30
//
// Inserts are deduplicated, so overlapping ranges are safe to re-run.

const DAY = 86_400_000;

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) {
    return argv[i + 1];
  }
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  return withEq?.slice(name.length + 3);
}

function parseDate(name: string, raw: string): Date {
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid --${name} date: ${raw} (expected YYYY-MM-DD)`);
  }
  return d;
}

async function main() {
  const oldest = await prisma.earthquake.findFirst({
    orderBy: { time: "asc" },
    select: { time: true },
  });

  const fromRaw = arg("from");
  const toRaw = arg("to");
  const from = fromRaw ? parseDate("from", fromRaw) : INITIAL_LOAD_FROM;
  // Default: up to the day after the oldest stored event (overlap dedupes),
  // or up to now on an empty database.
  const to = toRaw
    ? parseDate("to", toRaw)
    : oldest
      ? new Date(oldest.time.getTime() - (oldest.time.getTime() % DAY) + DAY)
      : new Date();

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (from >= to) {
    console.log(
      `Nothing to backfill: --from ${fmt(from)} is not before --to ${fmt(to)}` +
        (oldest ? ` (oldest stored event: ${oldest.time.toISOString()})` : ""),
    );
    return;
  }

  const { latMin, latMax, lonMin, lonMax } = REGION_BBOX;
  console.log(
    `Backfilling ${fmt(from)} → ${fmt(to)}, ${REGION_NAME} region ` +
      `(lat ${latMin}..${latMax}, lon ${lonMin}..${lonMax})`,
  );
  const totals = await importRange(from, to, (chunk, stats) => {
    console.log(
      `  ${fmt(chunk.start)} → ${fmt(chunk.end)}: fetched ${stats.fetched}, inserted ${stats.upserted}`,
    );
  });
  console.log(
    `Done: fetched ${totals.fetched} events, ${totals.inRegion} in region, ${totals.upserted} newly inserted.`,
  );
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
