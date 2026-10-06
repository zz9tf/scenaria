import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Reused across Next.js dev-server reloads so hot reload does not exhaust connections. */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.SCENARIA_LOG === "1" ? ["query", "warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
