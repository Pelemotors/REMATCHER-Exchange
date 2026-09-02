import { cn } from "@/lib/utils";

export function DataValue({
  children,
  label,
  size = "lg",
  className,
  signal = false,
}: {
  children: React.ReactNode;
  label?: string;
  size?: "lg" | "sm";
  className?: string;
  signal?: boolean;
}) {
  return (
    <div className={cn("text-start", className)}>
      <p
        className={cn(
          size === "lg" ? "v2-text-data" : "v2-text-data-sm",
          signal && "text-v2-signal"
        )}
      >
        {children}
      </p>
      {label && (
        <p className="mt-0.5 text-label text-v2-text-muted">{label}</p>
      )}
    </div>
  );
}
