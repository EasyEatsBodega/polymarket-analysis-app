"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-gunmetal text-white shadow-md">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-old-gold rounded-lg flex items-center justify-center">
              <span className="text-gunmetal font-bold text-xl">P</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">PredictEasy</h1>
              <p className="text-xs text-dust-grey">Make Prediction Trading Easier</p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/netflix"
              className="text-dust-grey hover:text-white transition-colors"
            >
              Netflix
            </Link>
            <Link
              href="/insider-finder"
              className="text-dust-grey hover:text-white transition-colors"
            >
              Insider Finder
            </Link>
            <SignedIn>
              <Link
                href="/admin"
                className="text-dust-grey hover:text-white transition-colors"
              >
                Admin
              </Link>
            </SignedIn>
          </nav>

          {/* Auth Section */}
          <div className="flex items-center gap-4">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="bg-pine-blue hover:bg-opacity-80 text-white px-4 py-2 rounded-lg transition-colors">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                  },
                }}
              />
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  );
}
