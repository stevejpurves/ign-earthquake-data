import {
  INITIAL_LOAD_FROM,
  REFRESH_INTERVAL_MINUTES,
  REGION_BBOX,
} from "./config.server";
import { prisma } from "./db.server";
import { fetchCatalogEvents, inBbox } from "./ign.server";

export const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;
const RUNNING_TIMEOUT_MS = 5 * 60 * 1000; // consider a "running" refresh stuck after 5 min

export async function getLastSuccessfulRefresh() {
  return prisma.refreshLog.findFirst({
    where: { status: "success" },
    orderBy: { finishedAt: "desc" },
  });
}

export async function isStale(): Promise<boolean> {
  const last = await getLastSuccessfulRefresh();
  if (!last?.finishedAt) return true;
  return Date.now() - last.finishedAt.getTime() > REFRESH_INTERVAL_MS;
}

/**
 * Where to start the catalog query: one day before the newest stored event
 * (the catalog filters by whole days, and late-arriving events get inserted
 * behind the newest timestamp — the overlap is deduplicated on insert), or
 * the initial-load start date when the database is empty.
 */
export function computeFetchStart(newest: Date | null): Date {
  if (!newest) return INITIAL_LOAD_FROM;
  const overlap = new Date(newest.getTime() - 86_400_000);
  return overlap > INITIAL_LOAD_FROM ? overlap : INITIAL_LOAD_FROM;
}

/**
 * Pull events from the IGN catalog into the database, restricted to the
 * configured region and initial-load window. Shared by the seed script
 * (initial load) and the background refresh.
 */
export async function importFromIgn(): Promise<{
  fetched: number;
  inRegion: number;
  upserted: number;
  start: Date;
}> {
  const newest = await prisma.earthquake.findFirst({
    orderBy: { time: "desc" },
    select: { time: true },
  });
  const start = computeFetchStart(newest?.time ?? null);

  const all = await fetchCatalogEvents(start, new Date(), REGION_BBOX);
  // The catalog applies the bbox server-side; re-check locally so a config
  // change or endpoint quirk can never widen what gets stored.
  const events = all.filter(
    (e) => inBbox(e, REGION_BBOX) && e.time >= INITIAL_LOAD_FROM,
  );

  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < events.length; i += BATCH) {
    const res = await prisma.earthquake.createMany({
      data: events.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    upserted += res.count;
  }
  return { fetched: all.length, inRegion: events.length, upserted, start };
}

export async function recordRefreshSuccess(
  upserted: number,
  message: string,
): Promise<void> {
  await prisma.refreshLog.create({
    data: {
      status: "success",
      finishedAt: new Date(),
      eventsUpserted: upserted,
      message,
    },
  });
}

/**
 * Stale-while-revalidate refresh, throttled to REFRESH_INTERVAL_MINUTES.
 * Returns what happened so the client can decide whether to revalidate.
 */
export async function refreshIfStale(): Promise<
  | { status: "fresh" }
  | { status: "already-running" }
  | { status: "refreshed"; eventsUpserted: number }
  | { status: "error"; message: string }
> {
  if (!(await isStale())) return { status: "fresh" };

  const running = await prisma.refreshLog.findFirst({
    where: {
      status: "running",
      startedAt: { gt: new Date(Date.now() - RUNNING_TIMEOUT_MS) },
    },
  });
  if (running) return { status: "already-running" };

  const log = await prisma.refreshLog.create({ data: { status: "running" } });
  try {
    const { fetched, inRegion, upserted, start } = await importFromIgn();
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        eventsUpserted: upserted,
        message: `Fetched ${fetched} events since ${start.toISOString().slice(0, 10)}, ${inRegion} in region`,
      },
    });
    return { status: "refreshed", eventsUpserted: upserted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: { status: "error", finishedAt: new Date(), message },
    });
    return { status: "error", message };
  }
}
