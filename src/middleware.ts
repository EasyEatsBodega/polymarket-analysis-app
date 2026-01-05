import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define which routes are public (no auth required)
const isPublicRoute = createRouteMatcher([
  '/',                    // Dashboard overview is public
  '/sign-in(.*)',         // Auth pages
  '/sign-up(.*)',
  '/api/health(.*)',      // Health check
  '/api/titles',          // Public title list
  '/api/movers',          // Public movers list
  '/api/breakouts',       // Public breakouts
  '/api/markets',         // Public markets
  '/api/forecasts',       // Public forecasts
]);

// Define which routes require admin access
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',           // Admin pages
  '/api/config(.*)',      // Config API
  '/api/jobs(.*)',        // Job trigger APIs
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes
  if (isPublicRoute(req)) {
    return;
  }

  // Protect all non-public routes
  const { userId } = await auth();

  if (!userId) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }

  // For admin routes, check for admin role (optional - can be configured in Clerk dashboard)
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth();
    const isAdmin = sessionClaims?.metadata?.role === 'admin';

    // For now, allow any authenticated user to access admin routes
    // In production, uncomment below to restrict to admins only
    // if (!isAdmin) {
    //   return new Response('Forbidden', { status: 403 });
    // }
    void isAdmin; // Suppress unused variable warning
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
