import Link from "next/link";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { BRAND } from "@/config/brand";

export function PublicHeaderV2() {
  return (
    <header className="absolute inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#070C14]/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 md:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-3">
          <ExchangeMark state="idle" variant="hero" size={44} decorative />
          <div className="leading-tight">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/45">
              {BRAND.parent}
            </p>
            <p className="text-sm font-medium text-white/75">
              {BRAND.productShort}
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <a
            href="#how-it-works"
            className="hidden px-3 py-2 text-sm text-white/50 transition hover:text-white/75 sm:inline"
          >
            איך זה עובד
          </a>
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm text-white/60 transition hover:text-white/85"
          >
            התחבר
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-[#163A5F] bg-[#163A5F] px-4 py-2 text-sm font-medium text-[#F3F1EC] transition hover:border-[#2D78A8] hover:bg-[#174A73]"
          >
            הצטרפות
          </Link>
        </nav>
      </div>
    </header>
  );
}
