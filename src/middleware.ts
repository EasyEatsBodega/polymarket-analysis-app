import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define which routes are public (no auth required)
const isPublicRoute = createRouteMatcher([
  '/',                    // Dashboard overview is public
  '/sign-in(.*)',         // Auth pages
  '/sign-up(.*)',
  '/api/health(.*)',      // Health check
  '/api/titles(.*)',      // Public title APIs
  '/api/movers',          // Public movers list
  '/api/breakouts',       // Public breakouts
  '/api/markets',         // Public markets
  '/api/forecasts',       // Public forecasts
  '/api/jobs(.*)',        // Job APIs (use their own API key auth)
]);

// Define which routes require admin access
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',           // Admin pages
  '/api/config(.*)',      // Config API
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without any auth check
  if (isPublicRoute(req)) {
    return;
  }

  // For protected routes, require authentication
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
