import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import { prisma } from "../lib/db.server";
import { getLastSuccessfulRefresh, isStale } from "../lib/refresh.server";
import { TimelineChart, type QuakePoint } from "../components/TimelineChart";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "IGN Earthquake Timeline" },
    {
      name: "description",
      content:
        "Timeline of earthquake events from Spain's Instituto Geográfico Nacional: depth against time, sized by magnitude.",
    },
  ];
}

export async function loader(_: Route.LoaderArgs) {
  const [rows, lastRefresh, stale] = await Promise.all([
    prisma.earthquake.findMany({
      orderBy: { time: "asc" },
      select: {
        id: true,
        time: true,
        depthKm: true,
        magnitude: true,
        region: true,
      },
    }),
    getLastSuccessfulRefresh(),
    isStale(),
  ]);

  return {
    points: rows.map(
      (r): QuakePoint => ({
        id: r.id,
        t: r.time.getTime(),
        d: r.depthKm,
        m: r.magnitude,
        region: r.region,
      }),
    ),
    lastRefreshedAt: lastRefresh?.finishedAt?.getTime() ?? null,
    stale,
  };
}

const RANGES = [
  { key: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
  { key: "90d", label: "Last 90 days", ms: 90 * 86_400_000 },
  { key: "1y", label: "Last year", ms: 365 * 86_400_000 },
  { key: "all", label: "All", ms: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export default function Home({ loaderData }: Route.ComponentProps) {
  const { points, lastRefreshedAt, stale } = loaderData;
  const fetcher = useFetcher<{
    status: "fresh" | "already-running" | "refreshed" | "error";
    eventsUpserted?: number;
    message?: string;
  }>();
  const revalidator = useRevalidator();
  const kicked = useRef(false);
  const [range, setRange] = useState<RangeKey>("all");

  // Optimistic flow: the page renders stored data immediately; if the database
  // hasn't been refreshed in the last hour, kick off an update in the
  // background and pull in the new events once it lands.
  useEffect(() => {
    if (stale && !kicked.current) {
      kicked.current = true;
      fetcher.submit(null, { method: "POST", action: "/api/refresh" });
    }
  }, [stale, fetcher]);

  useEffect(() => {
    if (fetcher.data?.status === "refreshed") {
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

  const newest = points.length > 0 ? points[points.length - 1].t : null;
  const visible = useMemo(() => {
    const r = RANGES.find((x) => x.key === range);
    if (!r?.ms || newest === null) return points;
    const cutoff = newest - r.ms;
    return points.filter((p) => p.t >= cutoff);
  }, [points, range, newest]);

  const refreshing = fetcher.state !== "idle";
  const refreshStatus = refreshing
    ? "Updating from IGN…"
    : fetcher.data?.status === "refreshed"
      ? `Updated · ${fetcher.data.eventsUpserted} new event${fetcher.data.eventsUpserted === 1 ? "" : "s"}`
      : fetcher.data?.status === "error"
        ? "IGN update failed — showing stored data"
        : lastRefreshedAt
          ? `Updated ${formatAgo(lastRefreshedAt)}`
          : "Showing stored catalog";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0b0b0b] dark:text-white">
            Earthquake timeline — depth over time
          </h1>
          <p className="mt-1 text-sm text-[#52514e] dark:text-[#c3c2b7]">
            Events from the IGN (Instituto Geográfico Nacional) catalog. Depth
            in km plotted downward; marker size shows magnitude.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#898781]">
          {refreshing && (
            <span
              className="inline-block size-3 animate-spin rounded-full border-2 border-[#898781] border-t-transparent"
              aria-hidden
            />
          )}
          <span aria-live="polite">{refreshStatus}</span>
        </div>
      </header>

      <div
        className="mb-4 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Time range"
      >
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              range === r.key
                ? "bg-[#2a78d6]/10 font-medium text-[#1c5cab] dark:bg-[#3987e5]/15 dark:text-[#86b6ef]"
                : "text-[#52514e] hover:bg-black/5 dark:text-[#c3c2b7] dark:hover:bg-white/5"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <TimelineChart points={visible} />

      <footer className="mt-8 text-xs text-[#898781]">
        Data:{" "}
        <a
          className="underline hover:text-[#52514e] dark:hover:text-[#c3c2b7]"
          href="https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/"
        >
          IGN últimos terremotos
        </a>{" "}
        · refreshed automatically when older than one hour.
      </footer>
    </main>
  );
}

function formatAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
