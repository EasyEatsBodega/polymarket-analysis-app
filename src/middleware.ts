import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Admin user IDs (add your Clerk user ID here)
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(",") || [];

// Routes that require admin access
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

// Routes that require authentication (Awards and Netflix sections)
const isProtectedRoute = createRouteMatcher([
  "/awards(.*)",
  "/netflix(.*)",
]);

// Public routes (no auth required): /, /insider-finder, /sign-in, /sign-up

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Protect admin routes - require authentication AND admin role
  if (isAdminRoute(req)) {
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    if (!ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json(
        { error: "Access denied. Admin privileges required." },
        { status: 403 }
      );
    }
  }

  // Protect Awards and Netflix routes - require authentication
  if (isProtectedRoute(req) && !userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
