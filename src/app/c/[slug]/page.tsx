import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import {
  CatalogLegalFooter,
  catalogContactNumber,
  catalogStyles as styles,
  formatFinanceFrom,
  formatIls,
  formatKm,
  CATALOG_FINANCE_ASTERISK,
} from "@/components/catalog/catalog-public-shared";
import { catalogVehicleWhatsAppHref } from "@/services/catalog/whatsapp-interest";
import { listPublicCatalogVehicles } from "@/services/catalog/catalog-service";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await listPublicCatalogVehicles(slug);
  if (!data) {
    return { title: "קטלוג לא נמצא" };
  }
  return {
    title: `${data.catalog.displayName} | קטלוג רכב`,
    description:
      data.catalog.description ??
      `קטלוג הרכב של ${data.catalog.displayName}`,
    robots: { index: true, follow: true },
  };
}

export default async function PublicCatalogPage({ params }: Props) {
  const { slug } = await params;
  const data = await listPublicCatalogVehicles(slug);
  if (!data) notFound();

  const { catalog, vehicles, hasFinanceDisplay } = data;
  const initial = catalog.displayName.trim().charAt(0).toUpperCase() || "R";
  const contact = catalogContactNumber(catalog);
  const phoneHref = catalog.phone
    ? `tel:${catalog.phone.replace(/\s/g, "")}`
    : null;

  return (
    <BrandV2Scope>
      <div className={styles.page} dir="rtl">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.brandBlock}>
              {catalog.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={catalog.logoUrl}
                  alt=""
                  className={styles.logo}
                />
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
                {catalog.address && (
                  <p className={styles.description}>{catalog.address}</p>
                )}
              </div>
            </div>
            <div className={styles.contactRow}>
              {phoneHref && (
                <a className={styles.contactBtn} href={phoneHref}>
                  התקשר
                </a>
              )}
              {contact && (
                <a
                  className={styles.contactBtnPrimary}
                  href={`https://wa.me/${contact}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </header>

          {vehicles.length === 0 ? (
            <div className={styles.empty}>
              <p>אין רכבים מפורסמים כרגע.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {vehicles.map((v) => {
                const spec = [v.year, formatKm(v.mileage), v.color]
                  .filter(Boolean)
                  .join(" · ");
                const price = formatIls(v.retailPrice);
                const interestHref = catalogVehicleWhatsAppHref(contact, {
                  title: v.title,
                  make: v.make,
                  model: v.model,
                  year: v.year,
                  publicRef: v.id.slice(-6),
                  slug: catalog.slug,
                });
                return (
                  <article key={v.id} className={styles.card}>
                    <Link
                      href={`/c/${catalog.slug}/vehicles/${v.id}`}
                      className={styles.cardMain}
                    >
                      {v.thumbUrl || v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.thumbUrl || v.imageUrl || ""}
                          alt=""
                          className={styles.photo}
                        />
                      ) : (
                        <div className={styles.photoEmpty}>ללא תמונה</div>
                      )}
                      <div className={styles.meta}>
                        <h2 className={styles.vehicleTitle}>{v.title}</h2>
                        {spec && <p className={styles.vehicleSpec}>{spec}</p>}
                        {price && <p className={styles.price}>{price}</p>}
                        {v.finance && (
                          <>
                            <p className={styles.financeFrom}>
                              <a href="#catalog-legal" className={styles.financeLink}>
                                {formatFinanceFrom(v.finance.monthlyIls)}
                              </a>
                            </p>
                            <p className={styles.financeTerm}>
                              עד {v.finance.termMonths} תשלומים
                            </p>
                            <p className={styles.financeAsterisk}>{CATALOG_FINANCE_ASTERISK}</p>
                          </>
                        )}
                      </div>
                    </Link>
                    {interestHref ? (
                      <a
                        className={styles.interestBtn}
                        href={interestHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        צור קשר ב-WhatsApp
                      </a>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <CatalogLegalFooter
            dealerName={catalog.displayName}
            hasFinanceDisplay={hasFinanceDisplay}
          />
        </div>
      </div>
    </BrandV2Scope>
  );
}
