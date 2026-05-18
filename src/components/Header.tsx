"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="26" r="10" fill="#14B8A6" />
      <line
        x1="10"
        y1="46"
        x2="54"
        y2="46"
        stroke="#57534E"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="bg-white border-b border-stone-200 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo />
          <span className="text-lg font-semibold text-stone-900 tracking-tight">
            Hibi
          </span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/stats"
            className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            ふりかえり
          </Link>
          <Link
            href="/channels"
            className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            チャンネル設定
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            ログアウト
          </button>
        </nav>
      </div>
    </header>
  );
}
