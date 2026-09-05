"use client";

import Link from "next/link";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { ButtonV2 } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";
import styles from "./public-layout.module.css";

interface Props {
  children: React.ReactNode;
  showHeader?: boolean;
}

function PublicHeaderStatic() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
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
        <nav className={styles.nav} aria-label="ניווט ראשי">
          <Link href="/login" className={styles.navLink}>
            התחבר
          </Link>
          <ButtonV2 variant="primary" href="/signup" className="text-sm">
            הצטרפות
          </ButtonV2>
        </nav>
      </div>
    </header>
  );
}

/** @deprecated Use PublicLayout with built-in v2 header */
export function PublicHeader() {
  return <PublicHeaderStatic />;
}

export function PublicLayout({ children, showHeader = true }: Props) {
  return (
    <div className={styles.root}>
      {showHeader && <PublicHeaderStatic />}
      {children}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/privacy" className={styles.footerLink}>
            מדיניות פרטיות ו־AI
          </Link>
          <Link href="/terms" className={styles.footerLink}>
            תנאי שימוש
          </Link>
          <a
            href="mailto:privacy@rematcher.co.il"
            className={styles.footerLink}
            dir="ltr"
          >
            privacy@rematcher.co.il
          </a>
        </div>
      </footer>
    </div>
  );
}
