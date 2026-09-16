import styles from "./catalog-public.module.css";
import { pickCatalogWhatsAppNumber } from "@/services/catalog/whatsapp-interest";

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

export function catalogContactNumber(catalog: {
  whatsapp?: string | null;
  phone?: string | null;
  dealer?: { phone?: string | null } | null;
}): string | null {
  return pickCatalogWhatsAppNumber(
    catalog.whatsapp,
    catalog.phone,
    catalog.dealer?.phone
  );
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
