import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const { Client } = createRequire(resolve("packages/db/package.json"))("pg");
const migration = await readFile(
  resolve("prisma/migrations/20260815000000_initial/migration.sql"),
  "utf8",
);
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(migration);
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  console.log(`Applied initial migration with ${result.rows[0].count} public tables`);
} finally {
  await client.end();
}
