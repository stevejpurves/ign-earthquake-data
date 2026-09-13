import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import {
  INITIAL_LOAD_FROM,
  REFRESH_INTERVAL_MINUTES,
  REGION_BBOX,
  REGION_NAME,
} from "../lib/config.server";
import { prisma } from "../lib/db.server";
import { getLastSuccessfulRefresh, isStale } from "../lib/refresh.server";
import { TimelineChart, type QuakePoint } from "../components/TimelineChart";
import { DailyCountChart } from "../components/DailyCountChart";

const DAY = 86_400_000;

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
      where: {
        latitude: { gte: REGION_BBOX.latMin, lte: REGION_BBOX.latMax },
        longitude: { gte: REGION_BBOX.lonMin, lte: REGION_BBOX.lonMax },
      },
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
    regionName: REGION_NAME,
    // Everything stored is shown, so "since" is the oldest stored event.
    fromDate: rows[0]?.time.getTime() ?? INITIAL_LOAD_FROM.getTime(),
    refreshMinutes: REFRESH_INTERVAL_MINUTES,
  };
}

const PRESETS = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "1y", label: "Last year", days: 365 },
] as const;

const startOfUtcDay = (t: number) => t - (t % DAY);
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function Home({ loaderData }: Route.ComponentProps) {
  const { points, lastRefreshedAt, stale, regionName, fromDate, refreshMinutes } =
    loaderData;
  const fetcher = useFetcher<{
    status: "fresh" | "already-running" | "refreshed" | "error";
    eventsUpserted?: number;
    message?: string;
  }>();
  const revalidator = useRevalidator();
  const kicked = useRef(false);

  // Stale-while-revalidate: render stored data immediately; if the last
  // refresh is older than the configured window, update in the background
  // and pull in the new events once the update lands.
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

  // Selected day range (UTC day starts, inclusive). null = full extent.
  const fullFrom = startOfUtcDay(points[0]?.t ?? Date.now());
  const fullTo = startOfUtcDay(points[points.length - 1]?.t ?? Date.now());
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const from = Math.max(sel?.from ?? fullFrom, fullFrom);
  const to = Math.min(sel?.to ?? fullTo, fullTo);

  const presetRange = (days: number) => ({
    from: Math.max(fullTo - (days - 1) * DAY, fullFrom),
    to: fullTo,
  });
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.days);
    return from === r.from && to === r.to && sel !== null;
  })?.key;

  const visible = useMemo(
    () => points.filter((p) => p.t >= from && p.t < to + DAY),
    [points, from, to],
  );
  const xDomain = useMemo(() => ({ tMin: from, tMax: to + DAY }), [from, to]);

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

  const dateInputClass =
    "rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm text-[#0b0b0b] " +
    "dark:border-white/15 dark:text-white dark:[color-scheme:dark]";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#0b0b0b] dark:text-white">
            {regionName} earthquake timeline — depth over time
          </h1>
          <p className="mt-1 text-sm text-[#52514e] dark:text-[#c3c2b7]">
            IGN (Instituto Geográfico Nacional) events around {regionName}{" "}
            since{" "}
            {new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(fromDate)}
            . Depth in km plotted downward; marker size shows magnitude.
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
        className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2"
        role="group"
        aria-label="Time range"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() =>
              setSel(activePreset === p.key ? null : presetRange(p.days))
            }
            aria-pressed={activePreset === p.key}
            title={
              activePreset === p.key ? "Click again to show the full range" : undefined
            }
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              activePreset === p.key
                ? "bg-[#2a78d6]/10 font-medium text-[#1c5cab] dark:bg-[#3987e5]/15 dark:text-[#86b6ef]"
                : "text-[#52514e] hover:bg-black/5 dark:text-[#c3c2b7] dark:hover:bg-white/5"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-2 hidden h-5 w-px bg-black/10 sm:inline-block dark:bg-white/10" />
        <label className="flex items-center gap-1.5 text-sm text-[#52514e] dark:text-[#c3c2b7]">
          From
          <input
            type="date"
            className={dateInputClass}
            value={isoDate(from)}
            min={isoDate(fullFrom)}
            max={isoDate(to)}
            onChange={(e) => {
              const v = Date.parse(e.target.value);
              if (Number.isFinite(v)) setSel({ from: Math.min(v, to), to });
            }}
          />
        </label>
        <label className="ml-1 flex items-center gap-1.5 text-sm text-[#52514e] dark:text-[#c3c2b7]">
          to
          <input
            type="date"
            className={dateInputClass}
            value={isoDate(to)}
            min={isoDate(from)}
            max={isoDate(fullTo)}
            onChange={(e) => {
              const v = Date.parse(e.target.value);
              if (Number.isFinite(v)) setSel({ from, to: Math.max(v, from) });
            }}
          />
        </label>
        {sel !== null && (
          <button
            type="button"
            onClick={() => setSel(null)}
            className="ml-1 rounded-md px-2 py-1.5 text-sm text-[#52514e] underline hover:bg-black/5 dark:text-[#c3c2b7] dark:hover:bg-white/5"
          >
            Reset
          </button>
        )}
      </div>

      <TimelineChart points={visible} xDomain={points.length > 0 ? xDomain : undefined} />

      <div className="mt-6">
        <DailyCountChart points={visible} xDomain={xDomain} />
      </div>

      <footer className="mt-8 text-xs text-[#898781]">
        Data:{" "}
        <a
          className="underline hover:text-[#52514e] dark:hover:text-[#c3c2b7]"
          href="https://www.ign.es/web/ign/portal/sis-catalogo-terremotos"
        >
          IGN earthquake catalog
        </a>{" "}
        (all magnitudes) · refreshed automatically when older than{" "}
        {refreshMinutes} min.
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
