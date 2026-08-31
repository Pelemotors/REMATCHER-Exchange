import type { Prisma } from "@prisma/client";

/** Safe cast for Prisma JSON fields */
export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
