import { cn } from "@/lib/utils";

export function SkeletonV2({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-v2-surface-secondary",
        className,
      )}
      aria-hidden
    />
  );
}

export function SkeletonBlockV2({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy aria-label="טוען">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonV2
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function MatchCardSkeletonV2() {
  return (
    <div
      className="v2-surface-raised space-y-4 rounded-md p-5"
      aria-busy
      aria-label="טוען התאמה"
    >
      <div className="flex items-start justify-between gap-3">
        <SkeletonV2 className="h-5 w-24" />
        <SkeletonV2 className="h-10 w-20" />
      </div>
      <SkeletonV2 className="h-7 w-3/4" />
      <SkeletonV2 className="h-4 w-full" />
      <SkeletonV2 className="h-4 w-5/6" />
      <div className="flex gap-3 pt-2">
        <SkeletonV2 className="h-11 flex-1" />
        <SkeletonV2 className="h-11 flex-1" />
      </div>
    </div>
  );
}
