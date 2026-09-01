import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "signal" | "secondary" | "ghost";

const variantClass: Record<ButtonVariant, string> = {
  primary: "v2-btn-primary",
  signal: "v2-btn-signal",
  secondary: "v2-btn-secondary",
  ghost: "v2-btn-ghost",
};

export function ButtonV2({
  children,
  variant = "primary",
  className,
  href,
  ...props
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(variantClass[variant], className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
