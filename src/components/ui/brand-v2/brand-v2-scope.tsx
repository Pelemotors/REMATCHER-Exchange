"use client";

import { cn } from "@/lib/utils";

export function BrandV2Scope({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-brand-ui="2" className={cn("min-h-0", className)}>
      {children}
    </div>
  );
}
