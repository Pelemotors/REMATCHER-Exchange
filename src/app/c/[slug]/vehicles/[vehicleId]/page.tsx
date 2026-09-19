import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import {
  CatalogLegalFooter,
  catalogContactNumber,
  catalogStyles as styles,
  formatIls,
  formatKm,
  CATALOG_FINANCE_ASTERISK,
} from "@/components/catalog/catalog-public-shared";
import {
  PublicCatalogTracker,
  PublicLeadForm,
} from "@/components/catalog/public-catalog-client";
import { getPublicCatalogVehicle } from "@/services/catalog/catalog-service";
import { catalogPublicVehicleUrl } from "@/services/catalog/public-url";

type Props = {
  params: Promise<{ slug: string; vehicleId: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, vehicleId } = await params;
  const { preview } = await searchParams;
  const data = await getPublicCatalogVehicle({
    slug,
    vehicleId,
    previewToken: preview,
  });
  if (!data || data.kind !== "ok") {
    return { title: "רכב לא נמצא", robots: { index: false, follow: false } };
  }
  const index = data.catalog.allowSearchIndexing === true && !data.preview;
  return {
    title: `${data.vehicle.title} | ${data.catalog.displayName}`,
    description: [
      data.vehicle.year,
      formatKm(data.vehicle.mileage),
      formatIls(data.vehicle.retailPrice),
    ]
      .filter(Boolean)
      .join(" · "),
    robots: { index, follow: index },
    alternates: {
      canonical: catalogPublicVehicleUrl(data.catalog.slug, data.vehicle.publicId),
    },
    openGraph: {
      title: data.vehicle.title,
      images: data.vehicle.imageUrl ? [data.vehicle.imageUrl] : undefined,
    },
  };
}

export default async function PublicCatalogVehiclePage({ params, searchParams }: Props) {
  const { slug, vehicleId } = await params;
  const { preview } = await searchParams;
  const data = await getPublicCatalogVehicle({
    slug,
    vehicleId,
    previewToken: preview,
  });
  if (!data) notFound();

  if (data.resolvedViaLegacy && data.canonicalPublicId !== vehicleId) {
    const qs = preview ? `?preview=${encodeURIComponent(preview)}` : "";
    redirect(`/c/${slug}/vehicles/${data.canonicalPublicId}${qs}`);
  }

  if (data.kind === "unavailable") {
    return (
      <BrandV2Scope>
        <div className={styles.page} dir="rtl">
          <div className={styles.shell}>
            <div className={styles.empty}>
              <p>הרכב כבר אינו זמין.</p>
              <Link href={`/c/${data.catalog.slug}`} className={styles.backLink}>
                חזרה לרכבים של {data.catalog.displayName}
              </Link>
            </div>
          </div>
        </div>
      </BrandV2Scope>
    );
  }

  const { catalog, vehicle, hasFinanceDisplay, preview: isPreview } = data;
  const price = formatIls(vehicle.retailPrice);
  const contact = catalogContactNumber(catalog);
  const phoneHref = catalog.phone
    ? `tel:${catalog.phone.replace(/\s/g, "")}`
    : null;
  const hero = vehicle.imageUrl || vehicle.media[0]?.url || null;
  const interestHref = `/c/${catalog.slug}/out/whatsapp/${vehicle.publicId}`;

  return (
    <BrandV2Scope>
      <PublicCatalogTracker
        slug={catalog.slug}
        eventType="VEHICLE_VIEW"
        publicId={vehicle.publicId}
      />
      <div className={styles.page} dir="rtl">
        <div className={styles.shell}>
          {isPreview && (
            <div className={styles.previewBanner}>תצוגה מקדימה — הקטלוג עדיין לא ציבורי</div>
          )}
          <Link href={`/c/${catalog.slug}`} className={styles.backLink}>
            ← חזרה לקטלוג {catalog.displayName}
          </Link>

          <div className={styles.detailLayout}>
            <div className={styles.gallery}>
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero} alt="" className={styles.heroPhoto} />
              ) : (
                <div className={styles.photoEmpty}>ללא תמונה</div>
              )}
              {vehicle.media.length > 1 && (
                <div className={styles.thumbRow}>
                  {vehicle.media.map((m) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.url}
                      src={m.thumbUrl || m.url}
                      alt=""
                      className={styles.thumb}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.detailPanel}>
              <h1 className={styles.detailTitle}>{vehicle.title}</h1>
              {price ? (
                <p className={styles.detailPrice}>{price}</p>
              ) : (
                <p className={styles.vehicleSpec}>צור קשר לקבלת מחיר</p>
              )}
              {vehicle.finance && (
                <div className={styles.financeDetail}>
                  <p>
                    <a href="#catalog-legal" className={styles.financeLink}>
                      החל מ-{formatIls(vehicle.finance.monthlyIls)} לחודש*
                    </a>
                  </p>
                  <p>עד {vehicle.finance.termMonths} תשלומים</p>
                  <p className={styles.financeAsterisk}>{CATALOG_FINANCE_ASTERISK}</p>
                </div>
              )}
              <ul className={styles.detailList}>
                {vehicle.year != null && (
                  <li>
                    <span>שנה</span>
                    <span>{vehicle.year}</span>
                  </li>
                )}
                {vehicle.mileage != null && (
                  <li>
                    <span>קילומטראז׳</span>
                    <span>{formatKm(vehicle.mileage)}</span>
                  </li>
                )}
                {vehicle.color && (
                  <li>
                    <span>צבע</span>
                    <span>{vehicle.color}</span>
                  </li>
                )}
                {vehicle.ownershipHand != null && (
                  <li>
                    <span>יד</span>
                    <span>{vehicle.ownershipHand}</span>
                  </li>
                )}
                {vehicle.region && (
                  <li>
                    <span>אזור</span>
                    <span>{vehicle.region}</span>
                  </li>
                )}
              </ul>
              {vehicle.publicDescription && (
                <p className={styles.notes}>{vehicle.publicDescription}</p>
              )}
              <div className={styles.contactCol}>
                <a className={styles.contactBtnPrimary} href={interestHref}>
                  צור קשר ב-WhatsApp
                </a>
                {phoneHref && (
                  <a className={styles.contactBtn} href={phoneHref}>
                    התקשר לסוכנות
                  </a>
                )}
              </div>
              {contact && (
                <p className={styles.cityLabel}>
                  {catalog.displayName}
                  {catalog.cityLabel ? ` · ${catalog.cityLabel}` : ""}
                </p>
              )}
            </aside>
          </div>

          <PublicLeadForm
            slug={catalog.slug}
            publicId={vehicle.publicId}
            vehicleTitle={vehicle.title}
          />
          <CatalogLegalFooter
            dealerName={catalog.displayName}
            hasFinanceDisplay={hasFinanceDisplay}
          />
        </div>
      </div>
    </BrandV2Scope>
  );
}
