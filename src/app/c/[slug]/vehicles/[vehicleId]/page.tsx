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
import { getPublicCatalogVehicle } from "@/services/catalog/catalog-service";

type Props = {
  params: Promise<{ slug: string; vehicleId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vehicleId } = await params;
  const data = await getPublicCatalogVehicle({ slug, vehicleId });
  if (!data) return { title: "רכב לא נמצא" };
  return {
    title: `${data.vehicle.title} | ${data.catalog.displayName}`,
    description: [
      data.vehicle.year,
      formatKm(data.vehicle.mileage),
      formatIls(data.vehicle.retailPrice),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default async function PublicCatalogVehiclePage({ params }: Props) {
  const { slug, vehicleId } = await params;
  const data = await getPublicCatalogVehicle({ slug, vehicleId });
  if (!data) notFound();

  const { catalog, vehicle } = data;
  const price = formatIls(vehicle.retailPrice);
  const wa = catalog.whatsapp?.replace(/\D/g, "");
  const phoneHref = catalog.phone
    ? `tel:${catalog.phone.replace(/\s/g, "")}`
    : null;
  const hero = vehicle.imageUrl || vehicle.media[0]?.url || null;

  return (
    <BrandV2Scope>
      <div className={styles.page} dir="rtl">
        <div className={styles.shell}>
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
              {price && <p className={styles.detailPrice}>{price}</p>}
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
              {vehicle.conditionNotes && (
                <p className={styles.notes}>{vehicle.conditionNotes}</p>
              )}
              <div className={styles.contactRow}>
                {phoneHref && (
                  <a className={styles.contactBtnPrimary} href={phoneHref}>
                    התקשר לסוכנות
                  </a>
                )}
                {wa && (
                  <a
                    className={styles.contactBtn}
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(
                      `שלום, מתעניין ב-${vehicle.title}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </aside>
          </div>

          <CatalogPoweredBy />
        </div>
      </div>
    </BrandV2Scope>
  );
}
