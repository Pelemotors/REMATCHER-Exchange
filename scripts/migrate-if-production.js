/**
 * Run Prisma migrations only on production builds.
 * Preview deployments must NOT run destructive schema operations.
 */
const { execSync } = require("child_process");

const shouldMigrate =
  process.env.VERCEL_ENV === "production" ||
  process.env.RUN_MIGRATIONS === "true";

if (shouldMigrate) {
  const migrateUrl =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL;

  const migrateRole = migrateUrl?.includes("postgres.")
    ? "postgres (dedicated migration)"
    : migrateUrl?.includes("rematcher_prisma")
      ? "rematcher_prisma (limited DDL — set MIGRATION_DATABASE_URL)"
      : "unknown";

  console.log(`[migrate] Running prisma migrate deploy as ${migrateRole}...`);

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: migrateUrl },
    });
    console.log("[migrate] Success");
  } catch (error) {
    console.error(
      "[migrate] FAILED — build will abort. Check Supabase migration state and MIGRATION_DATABASE_URL."
    );
    throw error;
  }
} else {
  console.log(
    "[migrate] Skipped (set RUN_MIGRATIONS=true or deploy to production to migrate)"
  );
}
