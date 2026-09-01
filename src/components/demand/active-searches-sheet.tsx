"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { MySearchesPanel } from "./my-searches-panel";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ActiveSearchesSheet({ open, onClose }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-midnight/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "absolute bg-surface shadow-modal",
          "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:max-h-full md:rounded-none md:rounded-l-xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-h3 font-semibold">החיפושים שלי</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 hover:bg-surface-secondary"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-[env(safe-area-inset-bottom)]">
          <MySearchesPanel
            compact
            limit={5}
            onViewAll={() => {
              onClose();
              window.location.href = "/demand";
            }}
          />
          <div className="mt-4 flex gap-2">
            <Link href="/demand" className="btn-secondary flex-1 text-center" onClick={onClose}>
              כל החיפושים
            </Link>
            <Link href="/demand?new=1" className="btn-primary flex-1 text-center" onClick={onClose}>
              + חיפוש חדש
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
