import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DB = path.join(process.cwd(), "prisma", "test.db");

/** Rebuilds a throwaway SQLite database so runtime tests start from a clean schema. */
export async function setup(): Promise<void> {
  for (const file of [TEST_DB, `${TEST_DB}-journal`]) {
    fs.rmSync(file, { force: true });
  }
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

export async function teardown(): Promise<void> {
  for (const file of [TEST_DB, `${TEST_DB}-journal`]) {
    fs.rmSync(file, { force: true });
  }
}
