import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool =
  global.pgPool ||
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };

process.on("SIGINT", async () => {
  await pool.end();
});

process.on("SIGTERM", async () => {
  await pool.end();
});
