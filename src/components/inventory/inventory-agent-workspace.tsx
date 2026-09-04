"use client";

import { useState } from "react";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { InventoryImportPanel } from "@/components/inventory/inventory-import";
import { useAgentWorkspaceOptional } from "@/components/assistant/agent-workspace-provider";
import styles from "./inventory-agent-workspace.module.css";

type TabId = "agent" | "import" | "actions";

interface Props {
  open: boolean;
  initialTab?: TabId;
  onClose: () => void;
  onInventoryChanged: (opts?: { highlightId?: string }) => void;
}

/**
 * Compact inventory management entry — no embedded chat.
 * Conversation opens the Universal REMATCHER Agent.
 */
export function InventoryAgentWorkspace({
  open,
  initialTab = "actions",
  onClose,
  onInventoryChanged,
}: Props) {
  const agent = useAgentWorkspaceOptional();
  const [showImport, setShowImport] = useState(initialTab === "import");

  if (!open) return null;

  function talkToAgent() {
    agent?.openAgent({
      mode: "inventory_management",
      preferFocusOnMobile: true,
      presentation: "focus",
    });
    onClose();
  }

  function openImport() {
    setShowImport(true);
  }

  return (
    <Surface depth="raised" className={styles.workspaceCompact}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>ניהול מלאי</h2>
          <p className={styles.sub}>הסוכן של REMATCHER עוזר לך עם המלאי</p>
        </div>
        <ButtonV2 variant="ghost" onClick={onClose} className="text-sm">
          סגור
        </ButtonV2>
      </div>

      {!showImport ? (
        <div className={styles.compactActions}>
          <ButtonV2 variant="signal" className="flex-1" onClick={talkToAgent}>
            דבר עם ה-Agent
          </ButtonV2>
          <ButtonV2 variant="secondary" className="flex-1" onClick={openImport}>
            העלאת קובץ
          </ButtonV2>
        </div>
      ) : (
        <div className={styles.importPane}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={styles.tab}
              onClick={() => {
                setShowImport(false);
              }}
            >
              חזרה
            </button>
            <button
              type="button"
              className={`${styles.tab} ${styles.tabActive}`}
            >
              העלאת קובץ
            </button>
          </div>
          <InventoryImportPanel
            onComplete={() => {
              onInventoryChanged();
              setShowImport(false);
            }}
          />
        </div>
      )}
    </Surface>
  );
}
