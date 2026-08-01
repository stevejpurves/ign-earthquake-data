import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface QuakePoint {
  id: string;
  /** epoch ms, UTC */
  t: number;
  /** depth in km (positive down), null if unknown */
  d: number | null;
  /** magnitude, null if unknown */
  m: number | null;
  region: string | null;
}

interface Theme {
  surface: string;
  grid: string;
  axis: string;
  muted: string;
  ink: string;
  series: string;
}

const LIGHT: Theme = {
  surface: "#fcfcfb",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
  series: "#2a78d6",
};

const DARK: Theme = {
  surface: "#1a1a19",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  ink: "#ffffff",
  series: "#3987e5",
};

const MARGIN = { top: 30, right: 16, bottom: 34, left: 48 };

/** Marker radius in px from magnitude — area grows with magnitude. */
function radiusFor(mag: number | null): number {
  const m = Math.max(0, mag ?? 0);
  return 1.5 + 1.1 * m;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function niceTimeTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step = span / count;
  const day = 86_400_000;
  const units = [
    day,
    2 * day,
    7 * day,
    14 * day,
    30 * day,
    61 * day,
    91 * day,
    182 * day,
    365 * day,
  ];
  const unit = units.find((u) => u >= step) ?? 365 * day;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / unit) * unit; t <= max; t += unit) ticks.push(t);
  return ticks;
}

function niceLinearTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= rough) ?? pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fmtDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

interface Hover {
  point: QuakePoint;
  x: number;
  y: number;
}

export function TimelineChart({ points }: { points: QuakePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 420 });
  const [dark, setDark] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  const plotted = useMemo(
    () => points.filter((p) => p.d !== null),
    [points],
  );

  const domain = useMemo(() => {
    if (plotted.length === 0) return null;
    let tMin = Infinity;
    let tMax = -Infinity;
    let dMax = 0;
    for (const p of plotted) {
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
      if (p.d! > dMax) dMax = p.d!;
    }
    if (tMin === tMax) {
      tMin -= 86_400_000;
      tMax += 86_400_000;
    }
    return { tMin, tMax, dMin: 0, dMax: dMax * 1.05 || 1 };
  }, [plotted]);

  // Track OS color scheme so the canvas repaints with the right theme.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize((s) => ({ ...s, width: entry.contentRect.width }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scales = useMemo(() => {
    if (!domain || size.width === 0) return null;
    const w = size.width - MARGIN.left - MARGIN.right;
    const h = size.height - MARGIN.top - MARGIN.bottom;
    const x = (t: number) =>
      MARGIN.left + ((t - domain.tMin) / (domain.tMax - domain.tMin)) * w;
    // Depth grows downward: 0 km at the top of the plot.
    const y = (d: number) =>
      MARGIN.top + ((d - domain.dMin) / (domain.dMax - domain.dMin)) * h;
    return { x, y, w, h };
  }, [domain, size]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scales || !domain) return;
    const theme = dark ? DARK : LIGHT;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.font =
      '11px system-ui, -apple-system, "Segoe UI", sans-serif';

    // Gridlines + tick labels (recessive chrome, muted ink).
    const yTicks = niceLinearTicks(domain.dMin, domain.dMax, 6);
    for (const d of yTicks) {
      const yy = scales.y(d);
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, yy);
      ctx.lineTo(size.width - MARGIN.right, yy);
      ctx.stroke();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(d), MARGIN.left - 8, yy);
    }

    const xTicks = niceTimeTicks(domain.tMin, domain.tMax, 7);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of xTicks) {
      const xx = scales.x(t);
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(xx, MARGIN.top);
      ctx.lineTo(xx, size.height - MARGIN.bottom);
      ctx.stroke();
      ctx.fillStyle = theme.muted;
      ctx.fillText(fmtDate.format(t), xx, size.height - MARGIN.bottom + 8);
    }

    // Baseline (0 km — the surface).
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(size.width - MARGIN.right, MARGIN.top);
    ctx.stroke();

    // Marks: single series, alpha handles overplotting.
    ctx.fillStyle = hexToRgba(theme.series, 0.4);
    for (const p of plotted) {
      ctx.beginPath();
      ctx.arc(scales.x(p.t), scales.y(p.d!), radiusFor(p.m), 0, Math.PI * 2);
      ctx.fill();
    }

    // Hovered mark: solid fill with a surface ring so it pops out of the cloud.
    if (hover) {
      const { point } = hover;
      const r = radiusFor(point.m);
      ctx.beginPath();
      ctx.arc(scales.x(point.t), scales.y(point.d!), r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = theme.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(scales.x(point.t), scales.y(point.d!), r, 0, Math.PI * 2);
      ctx.fillStyle = theme.series;
      ctx.fill();
    }
  }, [scales, domain, plotted, dark, size, hover]);

  useEffect(() => {
    draw();
  }, [draw]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scales) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: QuakePoint | null = null;
      let bestDist = Infinity;
      for (const p of plotted) {
        const dx = scales.x(p.t) - mx;
        const dy = scales.y(p.d!) - my;
        const dist = Math.hypot(dx, dy) - radiusFor(p.m);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      // Generous hit target: within 10px of the mark's edge.
      if (best && bestDist <= 10) {
        setHover({ point: best, x: scales.x(best.t), y: scales.y(best.d!) });
      } else {
        setHover(null);
      }
    },
    [scales, plotted],
  );

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-black/10 text-sm text-[#898781] dark:border-white/10">
        No events in the database yet — the first IGN refresh will populate it,
        or run <code className="mx-1">npm run db:seed</code>.
      </div>
    );
  }

  const tooltipLeft = hover ? Math.min(hover.x + 14, size.width - 230) : 0;
  const tooltipAbove = hover ? hover.y > size.height / 2 : false;

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: size.height }}
        className="block cursor-crosshair rounded-lg border border-black/10 dark:border-white/10"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Scatter plot of ${plotted.length} earthquake events: depth in kilometres against time, marker size showing magnitude.`}
      />
      {/* Axis titles + size key */}
      <div className="pointer-events-none absolute top-1.5 left-2 text-[11px] text-[#898781]">
        Depth (km)
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-[#898781]">
        <span>Marker size = magnitude</span>
        {[1, 3, 5].map((m) => (
          <span key={m} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full bg-[#2a78d6]/40 dark:bg-[#3987e5]/40"
              style={{
                width: 2 * radiusFor(m),
                height: 2 * radiusFor(m),
              }}
            />
            M{m}
          </span>
        ))}
        <span className="ml-auto">{plotted.length.toLocaleString()} events shown</span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-md border border-black/10 bg-white/95 p-2.5 text-xs shadow-lg dark:border-white/10 dark:bg-[#262624]/95"
          style={{
            left: tooltipLeft,
            top: tooltipAbove ? hover.y - 8 : hover.y + 8,
            transform: tooltipAbove ? "translateY(-100%)" : undefined,
          }}
        >
          <div className="font-medium text-[#0b0b0b] dark:text-white">
            {hover.point.region ?? hover.point.id}
          </div>
          <dl className="mt-1 space-y-0.5 text-[#52514e] dark:text-[#c3c2b7]">
            <div className="flex justify-between">
              <dt>Time (UTC)</dt>
              <dd className="tabular-nums">{fmtDateTime.format(hover.point.t)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Depth</dt>
              <dd className="tabular-nums">{hover.point.d} km</dd>
            </div>
            <div className="flex justify-between">
              <dt>Magnitude</dt>
              <dd className="tabular-nums">{hover.point.m ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Event</dt>
              <dd>{hover.point.id}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
