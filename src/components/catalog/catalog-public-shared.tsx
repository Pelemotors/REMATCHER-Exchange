import styles from "./catalog-public.module.css";

export function formatIls(price: number | null | undefined) {
  if (price == null || !Number.isFinite(price)) return null;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatKm(mileage: number | null | undefined) {
  if (mileage == null) return null;
  return `${new Intl.NumberFormat("he-IL").format(mileage)} ק״מ`;
}

export function CatalogPoweredBy() {
  return (
    <footer className={styles.footer}>
      <p className={styles.powered}>
        Powered by{" "}
        <a href="https://exchange.rematcher.co.il" className={styles.poweredLink}>
          REMATCHER Exchange
        </a>
      </p>
    </footer>
  );
}

export { styles as catalogStyles };
