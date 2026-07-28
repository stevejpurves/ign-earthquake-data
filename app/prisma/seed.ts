import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CSV_PATH = resolve(import.meta.dirname, "../../data/data.csv");

/** Minimal CSV line parser with double-quote support. */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function toFloat(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const header = parseLine(lines[0]).map((h) => h.trim());
  const col = (name: string) => {
    const i = header.findIndex((h) => h.toLowerCase().startsWith(name));
    if (i === -1) throw new Error(`Column not found: ${name}`);
    return i;
  };

  const iEvent = col("event");
  const iDate = col("date");
  const iTime = col("utc time");
  const iLat = col("latitude");
  const iLon = col("longitude");
  const iDepth = col("depth");
  const iMag = col("magnitude");
  const iMagType = col("mag. type");
  const iMaxInt = col("max. int");
  const iRegion = col("region");

  const events = [];
  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const id = cells[iEvent]?.trim();
    const lat = toFloat(cells[iLat]);
    const lon = toFloat(cells[iLon]);
    const time = new Date(`${cells[iDate]}T${cells[iTime]}Z`);
    if (!id || lat === null || lon === null || Number.isNaN(time.getTime())) {
      continue;
    }
    events.push({
      id,
      time,
      latitude: lat,
      longitude: lon,
      depthKm: toFloat(cells[iDepth]),
      magnitude: toFloat(cells[iMag]),
      magType: cells[iMagType]?.trim() || null,
      maxIntensity: cells[iMaxInt]?.trim() || null,
      region: cells[iRegion]?.trim() || null,
    });
  }

  let inserted = 0;
  const BATCH = 1000;
  for (let i = 0; i < events.length; i += BATCH) {
    const res = await prisma.earthquake.createMany({
      data: events.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    inserted += res.count;
  }
  console.log(`Seeded ${inserted} of ${events.length} events from ${CSV_PATH}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
