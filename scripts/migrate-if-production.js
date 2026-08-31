/**
 * Run Prisma migrations only on production builds.
 * Preview deployments must NOT run destructive schema operations.
 */
const { execSync } = require("child_process");

const shouldMigrate =
  process.env.VERCEL_ENV === "production" ||
  process.env.RUN_MIGRATIONS === "true";

if (shouldMigrate) {
  console.log("[migrate] Running prisma migrate deploy...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(
    "[migrate] Skipped (set RUN_MIGRATIONS=true or deploy to production to migrate)"
  );
}
