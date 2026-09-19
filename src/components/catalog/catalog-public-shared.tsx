import styles from "./catalog-public.module.css";
import { pickCatalogWhatsAppNumber } from "@/services/catalog/whatsapp-interest";
import {
  CATALOG_FINANCE_ASTERISK,
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
  dealerName: _dealerName,
  hasFinanceDisplay,
}: {
  dealerName: string;
  hasFinanceDisplay: boolean;
}) {
  return (
    <footer className={styles.footer} id="catalog-legal">
      <p className={styles.legalText}>{CATALOG_LEGAL_GENERAL}</p>
      {hasFinanceDisplay ? (
        <p className={styles.legalText}>{CATALOG_LEGAL_FINANCE}</p>
      ) : null}
    </footer>
  );
}

export { CATALOG_FINANCE_ASTERISK };

/** @deprecated Use CatalogLegalFooter — kept for any leftover import. */
export function CatalogPoweredBy() {
  return (
    <CatalogLegalFooter dealerName="הסוחר המפרסם" hasFinanceDisplay={false} />
  );
}

export function PublicDealerHeader({
  catalog,
}: {
  catalog: {
    displayName: string;
    description?: string | null;
    address?: string | null;
    cityLabel?: string | null;
    logoUrl?: string | null;
  };
}) {
  const initial = catalog.displayName.trim().charAt(0).toUpperCase() || "R";
  return (
    <div className={styles.brandBlock}>
      {catalog.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={catalog.logoUrl} alt="" className={styles.logo} />
      ) : (
        <div className={styles.logoFallback} aria-hidden>
          {initial}
        </div>
      )}
      <div>
        <h1 className={styles.displayName}>{catalog.displayName}</h1>
        {catalog.description && (
          <p className={styles.description}>{catalog.description}</p>
        )}
        {(catalog.cityLabel || catalog.address) && (
          <p className={styles.cityLabel}>{catalog.cityLabel || catalog.address}</p>
        )}
      </div>
    </div>
  );
}

export function PublicContactActions({
  phoneHref,
  whatsappHref,
  primaryLabel = "WhatsApp",
}: {
  phoneHref: string | null;
  whatsappHref: string | null;
  primaryLabel?: string;
}) {
  return (
    <div className={styles.contactRow}>
      {phoneHref && (
        <a className={styles.contactBtn} href={phoneHref}>
          התקשר
        </a>
      )}
      {whatsappHref && (
        <a
          className={styles.contactBtnPrimary}
          href={whatsappHref}
          rel="noopener noreferrer"
        >
          {primaryLabel}
        </a>
      )}
    </div>
  );
}

export function PublicPoweredBy() {
  return (
    <p className={styles.powered}>
      מופעל על ידי{" "}
      <a className={styles.poweredLink} href="https://exchange.rematcher.co.il">
        REMATCHER
      </a>
    </p>
  );
}

export { styles as catalogStyles };
