/**
 * Safe proof: rematcher_prisma can ALTER own tables but not postgres-owned tables.
 * Usage: npx tsx scripts/migration-role-proof.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function proof(connectionString: string, label: string) {
  const prisma = new PrismaClient({ datasourceUrl: connectionString });
  const role = (
    await prisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`
  )[0].current_user;
  console.log(`\n=== ${label} (role: ${role}) ===`);

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS _probe_test text'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" DROP COLUMN IF EXISTS _probe_test'
    );
    console.log("ALTER User (app table): PASS — migration role can ALTER existing tables");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("ALTER User (app table): FAIL —", msg.split("\n")[0]);
  }

  try {
    await prisma.$executeRawUnsafe("BEGIN");
    await prisma.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS _migration_probe (id int PRIMARY KEY)"
    );
    await prisma.$executeRawUnsafe(
      "ALTER TABLE _migration_probe ADD COLUMN IF NOT EXISTS probe_col text"
    );
    await prisma.$executeRawUnsafe("ROLLBACK");
    console.log("ALTER own table (_migration_probe): PASS");
  } catch (e) {
    await prisma.$executeRawUnsafe("ROLLBACK").catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.log("ALTER own table:", msg.split("\n")[0]);
  }

  await prisma.$disconnect();
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;

  if (!directUrl) {
    console.error("DIRECT_URL required");
    process.exit(1);
  }

  await proof(directUrl, "DIRECT_URL (current migration path)");

  if (migrationUrl) {
    await proof(migrationUrl, "MIGRATION_DATABASE_URL");
  } else {
    console.log("\nMIGRATION_DATABASE_URL not set — skip postgres role proof");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
