"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/admin/admin-layout.module.css";

export function AdminSearchForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      className={styles.searchForm}
      onSubmit={(e) => {
        e.preventDefault();
        const next = q.trim();
        if (next.length < 2) return;
        router.push(`/admin/search?q=${encodeURIComponent(next)}`);
      }}
    >
      <label className="sr-only" htmlFor="admin-global-search">
        חיפוש מערכת
      </label>
      <input
        id="admin-global-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש: אימייל, סוחר, רכב, slug…"
        className={styles.searchInput}
      />
      <button type="submit" className={styles.searchBtn}>
        חיפוש
      </button>
    </form>
  );
}
