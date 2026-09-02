import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function NavItemV2({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  compact,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md font-medium transition duration-normal",
        compact
          ? "min-h-[52px] flex-1 flex-col justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem]"
          : "px-3 py-2.5 text-body",
        active
          ? "bg-v2-signal/15 text-v2-signal"
          : "text-v2-text-secondary hover:bg-v2-surface-secondary hover:text-v2-text-primary",
      )}
    >
      <Icon className={cn(compact ? "h-5 w-5" : "h-5 w-5")} strokeWidth={1.75} />
      <span className={compact ? "leading-tight" : undefined}>{label}</span>
    </Link>
  );
}
