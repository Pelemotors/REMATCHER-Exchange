/**
 * Migration preflight — detect pending / failed / destructive patterns.
 * Does not apply migrations. Safe for CI and local ops.
 */
import { execSync } from "child_process";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\s+\S+\s+RENAME\s+TO\b/i,
];

export type MigrationPreflightResult = {
  ok: boolean;
  migrationsDir: string;
  localMigrations: string[];
  destructive: Array<{ migration: string; pattern: string }>;
  statusOutput: string;
  warnings: string[];
};

export function listLocalMigrations(root = process.cwd()): string[] {
  const dir = join(root, "prisma", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
    .map((d) => d.name)
    .sort();
}

export function scanDestructiveSql(root = process.cwd()): Array<{
  migration: string;
  pattern: string;
}> {
  const hits: Array<{ migration: string; pattern: string }> = [];
  for (const name of listLocalMigrations(root)) {
    const sqlPath = join(root, "prisma", "migrations", name, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    const sql = readFileSync(sqlPath, "utf8");
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(sql)) {
        hits.push({ migration: name, pattern: pattern.source });
      }
    }
  }
  return hits;
}

export function runMigrationPreflight(options?: {
  root?: string;
  skipStatus?: boolean;
}): MigrationPreflightResult {
  const root = options?.root ?? process.cwd();
  const localMigrations = listLocalMigrations(root);
  const destructive = scanDestructiveSql(root);
  const warnings: string[] = [];
  let statusOutput = "(skipped)";

  if (!options?.skipStatus) {
    try {
      statusOutput = execSync("npx prisma migrate status", {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      statusOutput = `${e.stdout ?? ""}\n${e.stderr ?? e.message ?? ""}`;
      warnings.push("prisma migrate status exited non-zero — inspect before deploy");
    }
  }

  if (destructive.length > 0) {
    warnings.push(
      `Found ${destructive.length} potentially destructive SQL pattern(s) — require explicit expand/contract plan`
    );
  }

  const ok =
    warnings.filter((w) => w.includes("non-zero")).length === 0 &&
    destructive.length === 0;

  return {
    ok: destructive.length === 0 && !statusOutput.includes("failed"),
    migrationsDir: join(root, "prisma", "migrations"),
    localMigrations,
    destructive,
    statusOutput: statusOutput.slice(0, 4000),
    warnings,
  };
}

const isCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes("migration-preflight");

if (isCli) {
  const result = runMigrationPreflight({
    skipStatus: process.env.SKIP_MIGRATE_STATUS === "1",
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.destructive.length > 0 ? 2 : 0);
}
