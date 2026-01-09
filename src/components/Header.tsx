"use client";

import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

export default function Header() {
  const { isSignedIn } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/auth/me")
        .then((res) => res.json())
        .then((data) => setIsAdmin(data.isAdmin === true))
        .catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [isSignedIn]);

  return (
    <header className="bg-gunmetal text-white shadow-md">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.svg"
              alt="PredictEasy Logo"
              width={44}
              height={44}
              className="w-11 h-11"
            />
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
              href="/awards"
              className="text-dust-grey hover:text-white transition-colors"
            >
              Awards
            </Link>
            <Link
              href="/insider-finder"
              className="text-dust-grey hover:text-white transition-colors"
            >
              Insider Finder
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="text-dust-grey hover:text-white transition-colors"
              >
                Admin
              </Link>
            )}
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
