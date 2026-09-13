import "dotenv/config";

// Single source of truth for the connection string. The fallback matches
// docker-compose.yml, so a fresh clone works without creating a .env file;
// set DATABASE_URL (see .env.example) to point anywhere else.
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://ign:ign@localhost:5432/ign_earthquakes";
