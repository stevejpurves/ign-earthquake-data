import { prisma } from "./db.server";
import { fetchIgnEvents } from "./ign.server";

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
 * Pull the latest events from the IGN feed into the database, throttled to
 * once per hour. Returns what happened so the client can decide whether to
 * revalidate.
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
    // Cover the gap since the newest stored event, up to the feed's 30-day max.
    const newest = await prisma.earthquake.findFirst({
      orderBy: { time: "desc" },
      select: { time: true },
    });
    const gapDays = newest
      ? Math.ceil((Date.now() - newest.time.getTime()) / 86_400_000) + 1
      : 30;

    const events = await fetchIgnEvents(gapDays);
    let upserted = 0;
    const BATCH = 500;
    for (let i = 0; i < events.length; i += BATCH) {
      const res = await prisma.earthquake.createMany({
        data: events.slice(i, i + BATCH),
        skipDuplicates: true,
      });
      upserted += res.count;
    }

    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        eventsUpserted: upserted,
        message: `Fetched ${events.length} events (${gapDays} day window)`,
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
