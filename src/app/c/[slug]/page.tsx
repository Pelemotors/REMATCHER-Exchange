import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import {
  CatalogPoweredBy,
  catalogStyles as styles,
  formatIls,
  formatKm,
} from "@/components/catalog/catalog-public-shared";
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

  const { catalog, vehicles } = data;
  const initial = catalog.displayName.trim().charAt(0).toUpperCase() || "R";
  const wa = catalog.whatsapp?.replace(/\D/g, "");
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
                <a className={styles.contactBtnPrimary} href={phoneHref}>
                  התקשר
                </a>
              )}
              {wa && (
                <a
                  className={styles.contactBtn}
                  href={`https://wa.me/${wa}`}
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
                return (
                  <Link
                    key={v.id}
                    href={`/c/${catalog.slug}/vehicles/${v.id}`}
                    className={styles.card}
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
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <CatalogPoweredBy />
        </div>
      </div>
    </BrandV2Scope>
  );
}
