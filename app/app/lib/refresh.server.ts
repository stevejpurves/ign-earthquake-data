import { INITIAL_LOAD_FROM, REGION_BBOX } from "./config.server";
import { prisma } from "./db.server";
import { fetchIgnEvents, inBbox } from "./ign.server";

export const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
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
 * How many feed days to request: enough to cover the gap back to the newest
 * stored event, or all the way back to the initial-load start date when the
 * database is empty (or older than that date).
 */
export function computeFetchDays(
  newest: Date | null,
  now: Date = new Date(),
): number {
  const since = newest && newest > INITIAL_LOAD_FROM ? newest : INITIAL_LOAD_FROM;
  return Math.ceil((now.getTime() - since.getTime()) / 86_400_000) + 1;
}

/**
 * Pull events from the IGN feed into the database, restricted to the
 * configured region and initial-load window. Shared by the seed script
 * (initial load) and the hourly background refresh.
 */
export async function importFromIgn(): Promise<{
  fetched: number;
  inRegion: number;
  upserted: number;
  days: number;
}> {
  const newest = await prisma.earthquake.findFirst({
    orderBy: { time: "desc" },
    select: { time: true },
  });
  const days = computeFetchDays(newest?.time ?? null);

  const all = await fetchIgnEvents(days);
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
  return { fetched: all.length, inRegion: events.length, upserted, days };
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
 * Hourly-throttled background refresh. Returns what happened so the client
 * can decide whether to revalidate.
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
    const { fetched, inRegion, upserted, days } = await importFromIgn();
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        eventsUpserted: upserted,
        message: `Fetched ${fetched} events (${days} day window), ${inRegion} in region`,
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
