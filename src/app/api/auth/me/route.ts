/**
 * Returns the current user's Clerk ID and admin status
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(",") || [];

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json({
    userId,
    isAdmin: ADMIN_USER_IDS.includes(userId),
  });
}
