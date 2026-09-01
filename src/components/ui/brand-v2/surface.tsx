import { cn } from "@/lib/utils";

type SurfaceDepth = "base" | "raised" | "secondary";

const depthClass: Record<SurfaceDepth, string> = {
  base: "bg-v2-surface",
  raised: "v2-surface-raised",
  secondary: "bg-v2-surface-secondary",
};

export function Surface({
  children,
  depth = "base",
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  depth?: SurfaceDepth;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={cn("rounded-md", depthClass[depth], className)}>
      {children}
    </Tag>
  );
}
