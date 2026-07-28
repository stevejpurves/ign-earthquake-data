import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

// Reuse the client across dev-server HMR reloads to avoid exhausting connections.
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
