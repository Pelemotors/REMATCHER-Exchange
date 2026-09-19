import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import {
  CatalogLegalFooter,
  PublicContactActions,
  PublicDealerHeader,
  PublicPoweredBy,
  catalogContactNumber,
  catalogStyles as styles,
  formatFinanceFrom,
  formatIls,
  formatKm,
  CATALOG_FINANCE_ASTERISK,
} from "@/components/catalog/catalog-public-shared";
import {
  PublicCatalogTracker,
  PublicLeadForm,
} from "@/components/catalog/public-catalog-client";
import { listPublicCatalogVehicles } from "@/services/catalog/catalog-service";
import { catalogPublicUrl } from "@/services/catalog/public-url";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const data = await listPublicCatalogVehicles(slug, { previewToken: preview });
  if (!data) {
    return { title: "קטלוג לא נמצא", robots: { index: false, follow: false } };
  }
  const index = data.catalog.allowSearchIndexing === true && !data.preview;
  return {
    title: `${data.catalog.displayName} | קטלוג רכב`,
    description:
      data.catalog.description ?? `קטלוג הרכב של ${data.catalog.displayName}`,
    robots: { index, follow: index },
    alternates: { canonical: catalogPublicUrl(data.catalog.slug) },
    openGraph: {
      title: data.catalog.displayName,
      description: data.catalog.description ?? undefined,
      url: catalogPublicUrl(data.catalog.slug),
      images: data.catalog.logoUrl || data.catalog.coverImageUrl
        ? [data.catalog.logoUrl || data.catalog.coverImageUrl || ""]
        : undefined,
    },
  };
}

export default async function PublicCatalogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const data = await listPublicCatalogVehicles(slug, { previewToken: preview });
  if (!data) notFound();

  const { catalog, vehicles, hasFinanceDisplay, preview: isPreview } = data;
  const contact = catalogContactNumber(catalog);
  const phoneHref = catalog.phone
    ? `tel:${catalog.phone.replace(/\s/g, "")}`
    : null;
  const catalogWhatsapp = contact
    ? `https://wa.me/${contact}`
    : null;

  return (
    <BrandV2Scope>
      <PublicCatalogTracker slug={catalog.slug} eventType="CATALOG_VIEW" />
      <div className={styles.page} dir="rtl">
        <div className={styles.shell}>
          {isPreview && (
            <div className={styles.previewBanner}>תצוגה מקדימה — הקטלוג עדיין לא ציבורי</div>
          )}
          <header className={styles.header}>
            <PublicDealerHeader catalog={catalog} />
            <PublicContactActions
              phoneHref={phoneHref}
              whatsappHref={catalogWhatsapp}
            />
          </header>

          <div className={styles.chips}>
            <span className={styles.chip}>{vehicles.length} רכבים</span>
            {catalog.cityLabel && <span className={styles.chip}>{catalog.cityLabel}</span>}
          </div>

          {vehicles.length === 0 ? (
            <div className={styles.empty}>
              <p>כרגע אין רכבים זמינים.</p>
              {contact && <p>אפשר ליצור קשר עם הסוכנות.</p>}
            </div>
          ) : (
            <div className={styles.grid}>
              {vehicles.map((v) => {
                const spec = [v.year, formatKm(v.mileage), v.color]
                  .filter(Boolean)
                  .join(" · ");
                const price = formatIls(v.retailPrice);
                const interestHref = `/c/${catalog.slug}/out/whatsapp/${v.publicId}`;
                return (
                  <article key={v.publicId} className={styles.card}>
                    <Link
                      href={`/c/${catalog.slug}/vehicles/${v.publicId}`}
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
                        {price ? (
                          <p className={styles.price}>{price}</p>
                        ) : (
                          <p className={styles.vehicleSpec}>צור קשר לקבלת מחיר</p>
                        )}
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
                    <a className={styles.interestBtn} href={interestHref}>
                      צור קשר ב-WhatsApp
                    </a>
                  </article>
                );
              })}
            </div>
          )}

          <PublicLeadForm slug={catalog.slug} />
          <CatalogLegalFooter
            dealerName={catalog.displayName}
            hasFinanceDisplay={hasFinanceDisplay}
          />
          <PublicPoweredBy />
        </div>
      </div>
    </BrandV2Scope>
  );
}
