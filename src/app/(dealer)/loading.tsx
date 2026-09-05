import { MatchCardSkeletonV2, SkeletonBlockV2 } from "@/components/ui/brand-v2";

/** Immediate navigation feedback — prevents click → blank freeze perception. */
export default function DealerLoading() {
  return (
    <div className="space-y-4 p-4">
      <SkeletonBlockV2 lines={2} />
      <MatchCardSkeletonV2 />
      <MatchCardSkeletonV2 />
    </div>
  );
}
