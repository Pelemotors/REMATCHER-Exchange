import {
  MatchCardSkeletonV2,
  SkeletonBlockV2,
  SkeletonV2,
} from "@/components/ui/brand-v2";

/** Inventory / Demand / Activity */
export function ListLoadingSkeleton() {
  return (
    <div className="space-y-3 p-1" aria-busy aria-label="טוען רשימה">
      <SkeletonBlockV2 lines={2} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-v2-border bg-v2-surface-raised p-3"
        >
          <SkeletonV2 className="h-12 w-12 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonV2 className="h-4 w-2/3" />
            <SkeletonV2 className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Home / Matches / Opportunities / Validations / Reveals */
export function ActionCardLoadingSkeleton() {
  return (
    <div className="space-y-4 p-1" aria-busy aria-label="טוען">
      <SkeletonBlockV2 lines={2} />
      <MatchCardSkeletonV2 />
      <MatchCardSkeletonV2 />
    </div>
  );
}

/** Account / forms / enrichment */
export function FormLoadingSkeleton() {
  return (
    <div className="space-y-4 p-1" aria-busy aria-label="טוען טופס">
      <SkeletonBlockV2 lines={2} />
      <div className="space-y-3 rounded-md border border-v2-border bg-v2-surface-raised p-4">
        <SkeletonV2 className="h-4 w-1/3" />
        <SkeletonV2 className="h-11 w-full" />
        <SkeletonV2 className="h-4 w-1/4" />
        <SkeletonV2 className="h-11 w-full" />
        <SkeletonV2 className="mt-2 h-11 w-full" />
      </div>
    </div>
  );
}
