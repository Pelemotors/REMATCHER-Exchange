"use client";

import { useState } from "react";
import Link from "next/link";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { BRAND } from "@/config/brand";
import styles from "./public-header-v2.module.css";

export function PublicHeaderV2() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.lockup}>
          <ExchangeMark
            state="idle"
            variant="hero"
            className={styles.markIcon}
            decorative
          />
          <div className={styles.lockupText}>
            <p className={styles.brandParent}>{BRAND.parent}</p>
            <p className={styles.brandProduct}>{BRAND.productShort}</p>
          </div>
        </Link>

        <nav className={styles.desktopNav} aria-label="ניווט ראשי">
          <a href="#how-it-works" className={styles.navLink}>
            איך זה עובד
          </a>
          <Link href="/login" className={styles.navLink}>
            התחבר
          </Link>
          <Link href="/signup" className={styles.navCta}>
            הצטרפות
          </Link>
        </nav>

        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuIcon} />
        </button>
      </div>

      {menuOpen && (
        <nav className={styles.mobileMenu} aria-label="תפריט מובייל">
          <a
            href="#how-it-works"
            className={styles.mobileMenuLink}
            onClick={() => setMenuOpen(false)}
          >
            איך זה עובד
          </a>
          <Link
            href="/login"
            className={styles.mobileMenuLink}
            onClick={() => setMenuOpen(false)}
          >
            התחבר
          </Link>
          <Link
            href="/signup"
            className={styles.mobileMenuLink}
            onClick={() => setMenuOpen(false)}
          >
            הצטרפות
          </Link>
        </nav>
      )}
    </header>
  );
}
