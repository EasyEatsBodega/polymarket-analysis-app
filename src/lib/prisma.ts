import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
};

function createClient() {
  const url = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;
  
  const client = new PrismaClient({
    accelerateUrl: url,
    log: ["error", "warn"],
  }).$extends(withAccelerate());

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Helper function to retry Prisma operations that fail with "null pointer" errors
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 100
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError?.message || '';
      
      // Only retry on "null pointer" errors from Prisma Accelerate
      if (errorMessage.includes('null pointer') && attempt < maxRetries) {
        console.warn(`[Prisma] Retry ${attempt}/${maxRetries} after null pointer error`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

export default prisma;
