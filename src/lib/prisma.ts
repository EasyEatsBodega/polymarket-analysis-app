import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  // Use PRISMA_DATABASE_URL for Accelerate (prisma+postgres://...)
  // or fall back to DATABASE_URL for direct connection
  const accelerateUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;
  
  const client = new PrismaClient({
    accelerateUrl,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  }).$extends(withAccelerate());
  
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
