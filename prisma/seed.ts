import { seedDatabase } from "@secondcurrent/db";

seedDatabase().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
