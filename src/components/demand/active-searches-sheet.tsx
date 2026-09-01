"use client";

import Link from "next/link";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { MySearchesPanel } from "./my-searches-panel";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ActiveSearchesSheet({ open, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="החיפושים שלי"
      footer={
        <div className="flex gap-2">
          <Link
            href="/demand"
            className="btn-secondary flex-1 text-center"
            onClick={onClose}
          >
            כל החיפושים
          </Link>
          <Link
            href="/demand?new=1"
            className="btn-primary flex-1 text-center"
            onClick={onClose}
          >
            + חיפוש חדש
          </Link>
        </div>
      }
    >
      <MySearchesPanel
        compact
        lightweight
        onViewAll={() => {
          onClose();
          window.location.href = "/demand";
        }}
      />
    </BottomSheet>
  );
}
