/**
 * Returns the current user's Clerk ID
 * Use this to get your ID for ADMIN_USER_IDS env var
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json({
    userId,
    message: "Add this userId to ADMIN_USER_IDS in your .env.local file",
  });
}
