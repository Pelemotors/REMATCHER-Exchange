import Link from "next/link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

interface Props {
  children: React.ReactNode;
}

export function PublicHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="container-app flex items-center justify-between py-4">
        <Link href="/">
          <BrandWordmark />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#how-it-works" className="hidden text-text-secondary hover:text-ink sm:inline">
            איך זה עובד
          </a>
          <Link href="/login" className="btn-secondary px-4 py-2 text-sm">
            התחבר
          </Link>
          <Link href="/signup" className="btn-primary px-4 py-2 text-sm">
            הצטרפות
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-canvas">
      <PublicHeader />
      {children}
    </div>
  );
}
