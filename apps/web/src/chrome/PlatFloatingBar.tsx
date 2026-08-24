/**
 * Floating icon bar for plat sheets (roofs, leads list, Ask, and deferred CRM).
 */
import {
  ClipboardList,
  Inbox,
  List,
  Megaphone,
  MessageCircle,
  ScrollText,
} from "lucide-react";
import { useEffect, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DisabledCrmNavSectionId } from "./disabled-crm-nav-sections";

export type PlatLiveSheetId = "doors" | "leads" | "chat";
export type PlatSheetId = PlatLiveSheetId | DisabledCrmNavSectionId;

/** Stamp duration on the Leads clipboard after a successful save. */
export const PLAT_LEAD_LANDED_MS = 560;

/**
 * Props for the map-corner floating bar.
 */
export interface PlatFloatingBarProps {
  activeSheet: PlatSheetId | null;
  onActiveSheetChange: (sheet: PlatSheetId | null) => void;
  /** Increments when a published property is saved to the leads list. */
  leadLandedPulseToken?: number;
}

const PLAT_BAR_LIVE_ITEMS: {
  id: PlatLiveSheetId;
  label: string;
  Icon: typeof List;
}[] = [
  { id: "doors", label: "Roofs in this radius", Icon: List },
  { id: "leads", label: "Leads list", Icon: ClipboardList },
  { id: "chat", label: "Ask about this radius", Icon: MessageCircle },
];

const PLAT_BAR_DEFERRED_ITEMS: {
  id: DisabledCrmNavSectionId;
  label: string;
  Icon: typeof List;
}[] = [
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "reports", label: "Reports", Icon: ScrollText },
  { id: "campaigns", label: "Campaigns", Icon: Megaphone },
];

/**
 * Compact linen pill of icons. Tapping an active icon closes the sheet.
 */
export function PlatFloatingBar({
  activeSheet,
  onActiveSheetChange,
  leadLandedPulseToken = 0,
}: PlatFloatingBarProps): JSX.Element {
  const [leadLanded, setLeadLanded] = useState(false);

  useEffect(() => {
    if (leadLandedPulseToken <= 0) {
      return;
    }
    setLeadLanded(false);
    const frameId = window.requestAnimationFrame(() => {
      setLeadLanded(true);
    });
    const timeoutId = window.setTimeout(() => {
      setLeadLanded(false);
    }, PLAT_LEAD_LANDED_MS);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [leadLandedPulseToken]);

  return (
    <div
      className="pointer-events-auto flex flex-col gap-1 overflow-visible rounded-sm border border-foreground/70 bg-[color:var(--color-card)]/95 bg-[url('/plat/linen-tooth.png')] bg-repeat p-1 plat-hud-surface"
      data-testid="plat-floating-bar"
      role="toolbar"
      aria-label="Map sheets"
    >
      {PLAT_BAR_LIVE_ITEMS.map((item) => (
        <PlatBarButton
          key={item.id}
          {...item}
          isActive={activeSheet === item.id}
          leadLanded={item.id === "leads" && leadLanded}
          onActiveSheetChange={onActiveSheetChange}
        />
      ))}
      <div
        className="mx-1 my-0.5 h-px bg-foreground/35"
        aria-hidden="true"
        data-testid="plat-floating-bar-deferred-rule"
      />
      {PLAT_BAR_DEFERRED_ITEMS.map((item) => (
        <PlatBarButton
          key={item.id}
          {...item}
          isActive={activeSheet === item.id}
          onActiveSheetChange={onActiveSheetChange}
        />
      ))}
    </div>
  );
}

function PlatBarButton({
  id,
  label,
  Icon,
  isActive,
  leadLanded = false,
  onActiveSheetChange,
}: {
  id: PlatSheetId;
  label: string;
  Icon: typeof List;
  isActive: boolean;
  leadLanded?: boolean;
  onActiveSheetChange: (sheet: PlatSheetId | null) => void;
}): JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "rounded-sm text-foreground",
        id === "leads" && "plat-floating-bar-leads",
        isActive &&
          "bg-foreground text-[color:var(--color-card)] hover:bg-foreground hover:text-[color:var(--color-card)]",
      )}
      aria-label={leadLanded ? `${label}, new lead saved` : label}
      aria-pressed={isActive}
      data-testid={`plat-floating-bar-${id}`}
      data-lead-landed={id === "leads" ? (leadLanded ? "true" : "false") : undefined}
      onClick={() => {
        onActiveSheetChange(isActive ? null : id);
      }}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
