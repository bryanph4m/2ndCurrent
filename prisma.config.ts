import "dotenv/config";
import { defineConfig } from "prisma/config";

// `generate` (run from postinstall on every host, including build steps that
// have no database) only needs the schema, not a live connection, so fall
// back to a placeholder when DATABASE_URL is unset. `migrate`/`db push` still
// need the real DATABASE_URL present in the environment.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
