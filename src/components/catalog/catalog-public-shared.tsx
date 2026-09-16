import styles from "./catalog-public.module.css";
import { pickCatalogWhatsAppNumber } from "@/services/catalog/whatsapp-interest";
import {
  CATALOG_LEGAL_FINANCE,
  CATALOG_LEGAL_GENERAL,
} from "@/services/catalog/finance-rules";

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

export function formatFinanceFrom(monthlyIls: number) {
  const amount = formatIls(monthlyIls);
  return amount ? `החל מ-${amount} לחודש*` : null;
}

export function CatalogLegalFooter({
  dealerName,
  hasFinanceDisplay,
}: {
  dealerName: string;
  hasFinanceDisplay: boolean;
}) {
  return (
    <footer className={styles.footer} id="catalog-legal">
      <p className={styles.advertiser}>
        הקטלוג מפורסם על ידי {dealerName}. REMATCHER מספקת תשתית קטלוג בלבד
        ואינה מוכרת את הרכב ואינה נותנת אשראי.
      </p>
      <p className={styles.legalText}>
        {CATALOG_LEGAL_GENERAL}
        {hasFinanceDisplay ? ` ${CATALOG_LEGAL_FINANCE}` : ""}
      </p>
    </footer>
  );
}

/** @deprecated Use CatalogLegalFooter — kept for any leftover import. */
export function CatalogPoweredBy() {
  return (
    <CatalogLegalFooter dealerName="הסוחר המפרסם" hasFinanceDisplay={false} />
  );
}

export { styles as catalogStyles };
