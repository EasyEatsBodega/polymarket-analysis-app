/**
 * Job Route Authentication Helper
 *
 * Provides secure authentication for cron jobs and manual triggers.
 * - Cron jobs: Vercel sends Bearer token in Authorization header
 * - Manual triggers: Admin API key in x-api-key header (NOT query params!)
 */

import { NextRequest } from 'next/server';

interface AuthResult {
  authorized: boolean;
  triggeredBy: 'cron' | 'manual' | 'unauthorized';
}

/**
 * Verify job route authorization
 *
 * Checks for:
 * 1. Vercel cron Authorization header (Bearer token)
 * 2. Admin API key in x-api-key header
 *
 * SECURITY: API keys should NEVER be in query params (visible in logs)
 */
export function verifyJobAuth(request: NextRequest): AuthResult {
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');
  const cronSecret = process.env.CRON_SECRET;
  const adminApiKey = process.env.ADMIN_API_KEY;

  // Check for Vercel cron Bearer token
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, triggeredBy: 'cron' };
  }

  // Check for admin API key in header (secure)
  if (adminApiKey && apiKeyHeader === adminApiKey) {
    return { authorized: true, triggeredBy: 'manual' };
  }

  // DEPRECATED: Check query param for backwards compatibility (log warning)
  const queryKey = request.nextUrl.searchParams.get('key');
  if (adminApiKey && queryKey === adminApiKey) {
    console.warn(
      'SECURITY WARNING: API key passed in query param. ' +
      'This is deprecated and insecure. Use x-api-key header instead.'
    );
    return { authorized: true, triggeredBy: 'manual' };
  }

  return { authorized: false, triggeredBy: 'unauthorized' };
}
