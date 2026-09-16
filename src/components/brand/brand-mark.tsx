"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  BRAND_ASSETS_V2,
  type BrandMarkVariant,
} from "@/config/brand-v2";

const SRC: Record<BrandMarkVariant, string> = {
  gold: BRAND_ASSETS_V2.rMarkGold,
  white: BRAND_ASSETS_V2.rMarkWhite,
  blue: BRAND_ASSETS_V2.rMarkBlue,
  dark: BRAND_ASSETS_V2.rMarkDark,
};

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  size?: number;
  className?: string;
  /** Prefer raster master for max fidelity on splash/hero */
  preferPng?: boolean;
  decorative?: boolean;
  label?: string;
}

/**
 * Primary REMATCHER R mark — SVG assets (Gold primary).
 * Do not redraw in CSS. Use PNG master only when preferPng.
 */
export function BrandMark({
  variant = "gold",
  size = 40,
  className,
  preferPng = false,
  decorative = true,
  label = "REMATCHER",
}: BrandMarkProps) {
  const src =
    preferPng && variant === "gold"
      ? BRAND_ASSETS_V2.rMarkGoldPng
      : SRC[variant];

  return (
    <Image
      src={src}
      alt={decorative ? "" : label}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      aria-hidden={decorative}
      priority={size >= 48}
      unoptimized={src.endsWith(".svg")}
    />
  );
}

export function BrandLockup({
  className,
  markSize = 36,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={markSize} variant="gold" />
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-wide text-v2-text-primary">
          REMATCHER
        </span>
        <span className="mt-1 text-[10px] font-medium tracking-[0.28em] text-v2-text-muted">
          EXCHANGE
        </span>
      </div>
    </div>
  );
}
