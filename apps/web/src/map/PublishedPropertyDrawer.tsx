/**
 * Published property drawer — detail overlay for a selected parcel.
 *
 * Shows street address and related fields from properties.get (or an injected
 * detail). BBB chrome renders a rating only when a contractor profile is present.
 */
import { useEffect, useRef, useState, type JSX, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  CHESTER_DEMO_ROOF_AGE_DISCLAIMER,
  CHESTER_DEMO_SYNTHETIC_BADGE,
} from "@/chrome/coverage-mode-banner-copy";
import { formatPublishedPropertyStreetLabel } from "./format-published-property-street-label";
import {
  PUBLISHED_PROPERTY_DRAWER_ABOUT_SECTION_HEADING,
  PUBLISHED_PROPERTY_DRAWER_CITY_LABEL,
  PUBLISHED_PROPERTY_DRAWER_CITY_UNKNOWN_COPY,
  PUBLISHED_PROPERTY_DRAWER_PERMITS_HEADING,
  PUBLISHED_PROPERTY_DRAWER_SIGNALS_SECTION_HEADING,
  PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_LABEL,
  PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_PROXY_HELPER,
  PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_UNKNOWN_COPY,
} from "./published-property-drawer-copy";
import {
  PropertyPermitLayerPanel,
  type PropertyPermitDetail,
} from "./PropertyPermitLayerPanel";

/**
 * BBB rating snapshot when a contractor profile exists on the property.
 */
export interface PublishedPropertyBbbProfile {
  ratingLetter: string | null;
  ratingScore: number | null;
}

/**
 * Detail payload for the published-property drawer.
 *
 * Mirrors `properties.get` fields the SPA needs before leads convert.
 * `hasBbbContractor` / `bbb` stay null or false when unpublished — never invent scores.
 */
export interface PublishedPropertyDrawerDetail {
  propertyId: string;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  builtYear: number | null;
  builtYearSource: string | null;
  hasBbbContractor: boolean | null;
  bbb: PublishedPropertyBbbProfile | null;
}

/**
 * Whether BBB rating chrome should render for a drawer detail.
 *
 * Requires an affirmative contractor flag and a non-null profile — missing BBB
 * is valid and must not show a fake rating.
 */
export function shouldShowPublishedPropertyDrawerBbb(
  detail: PublishedPropertyDrawerDetail,
): boolean {
  return detail.hasBbbContractor === true && detail.bbb !== null;
}

/** Copy when BBB is unpublished — answers “did it fail to load?” without inventing a score. */
export const PUBLISHED_PROPERTY_DRAWER_BBB_ABSENT_COPY =
  "No contractor BBB profile is published.";

/** Shown on synthetic signals — the verbatim contract badge (single source in chrome). */
export const PUBLISHED_PROPERTY_DRAWER_SYNTHETIC_DEMO_COPY =
  CHESTER_DEMO_SYNTHETIC_BADGE;

/** Shown when built_year_source is synthetic_demo — verbatim contract disclaimer. */
export const PUBLISHED_PROPERTY_DRAWER_SYNTHETIC_ROOF_AGE_COPY =
  CHESTER_DEMO_ROOF_AGE_DISCLAIMER;

/**
 * Copy shown before Convert so a mistaken click is not a surprise.
 */
export const CONVERT_PUBLISHED_PROPERTY_TO_LEAD_RISK_COPY =
  "Saves this roof to your leads list.";

/** Status when this street is already a lead — Archive lives on the list row. */
export const CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY = "On your leads list.";

/**
 * Props for the published property drawer overlay.
 */
export interface PublishedPropertyDrawerProps {
  publishedPropertyDrawerDetail: PublishedPropertyDrawerDetail;
  /**
   * When false, the popup animates closed before `onDrawerClosed` unmounts it.
   */
  open?: boolean;
  onPublishedPropertyDrawerClose: () => void;
  /**
   * Fires after the close animation completes so the shell can unmount the popup.
   */
  onDrawerClosed?: () => void;
  /**
   * Converts the open property to a persistent LeadRecord via leads.create.
   *
   * Omitted when the shell has no LeadRecordApiClient (list-only demos).
   */
  onConvertPublishedPropertyToLead?: () => void;
  convertPublishedPropertyToLeadPending?: boolean;
  convertPublishedPropertyToLeadStatusMessage?: string | null;
  selectedPropertyAlreadyConvertedToLead?: boolean;
  /**
   * When true, permit notes render in this drawer (bound to the open street).
   */
  showPermitNotes?: boolean;
  propertyPermitDetails?: PropertyPermitDetail[];
  permitDetailsSource?:
    "consolidated_permits" | "query_permits" | "synthetic_demo" | null;
  publishedPropertyDetailPending?: boolean;
  publishedPropertyDetailErrorMessage?: string | null;
}

/**
 * Overlay popup for one published property (list / marker selection).
 * Tap or click outside the card to fold it away.
 */
export function PublishedPropertyDrawer({
  publishedPropertyDrawerDetail,
  open = true,
  onPublishedPropertyDrawerClose,
  onDrawerClosed,
  onConvertPublishedPropertyToLead,
  convertPublishedPropertyToLeadPending = false,
  convertPublishedPropertyToLeadStatusMessage = null,
  selectedPropertyAlreadyConvertedToLead = false,
  showPermitNotes = false,
  propertyPermitDetails = [],
  permitDetailsSource = null,
  publishedPropertyDetailPending = false,
  publishedPropertyDetailErrorMessage = null,
}: PublishedPropertyDrawerProps): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [convertArmed, setConvertArmed] = useState(false);
  const showBbb = shouldShowPublishedPropertyDrawerBbb(publishedPropertyDrawerDetail);
  const bbb = publishedPropertyDrawerDetail.bbb;
  const showSyntheticDemoLabel =
    permitDetailsSource === "synthetic_demo" ||
    publishedPropertyDrawerDetail.builtYearSource === "synthetic_demo" ||
    propertyPermitDetails.some((permit) => permit.provenanceClass === "synthetic_demo");
  const title = formatPublishedPropertyStreetLabel({
    addressStreet: publishedPropertyDrawerDetail.addressStreet,
    fallbackLabel: "No street published",
  });

  useEffect(() => {
    closeButtonRef.current?.focus();
    setConvertArmed(false);
  }, [publishedPropertyDrawerDetail.propertyId]);

  useEffect(() => {
    if (selectedPropertyAlreadyConvertedToLead) {
      setConvertArmed(false);
    }
  }, [selectedPropertyAlreadyConvertedToLead]);

  useEffect(() => {
    const dismissOnOutsidePointer = (event: PointerEvent): void => {
      if (isPlatWalkChromePointerTarget(event.target)) {
        return;
      }
      onPublishedPropertyDrawerClose();
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
    };
  }, [onPublishedPropertyDrawerClose]);

  const stopMapPinDrop = (event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
  };

  return (
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onPublishedPropertyDrawerClose();
        }
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          onDrawerClosed?.();
        }
      }}
    >
      <SheetContent
        variant="popup"
        showCloseButton={false}
        showOverlay={false}
        aria-modal={false}
        data-testid="published-property-drawer"
        className="gap-0 p-0"
        onMouseDown={stopMapPinDrop}
        onClick={stopMapPinDrop}
      >
        <SheetHeader className="border-b border-foreground/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle
              id="published-property-drawer-title"
              data-testid="published-property-drawer-address-street"
              className="min-w-0 break-words text-base font-semibold"
            >
              {title}
            </SheetTitle>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label="Close roof details"
              onClick={onPublishedPropertyDrawerClose}
            >
              Close
            </Button>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {PUBLISHED_PROPERTY_DRAWER_ABOUT_SECTION_HEADING}
            </h3>
            <dl className="grid gap-2">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 text-sm">
                <dt className="text-muted-foreground">
                  {PUBLISHED_PROPERTY_DRAWER_CITY_LABEL}
                </dt>
                <dd className="min-w-0 break-words">
                  {publishedPropertyDrawerDetail.addressCity ??
                    PUBLISHED_PROPERTY_DRAWER_CITY_UNKNOWN_COPY}
                </dd>
              </div>
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 text-sm">
                <dt className="text-muted-foreground">
                  {PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_LABEL}
                </dt>
                <dd
                  className="min-w-0 break-words tabular-nums"
                  data-testid="published-property-drawer-year"
                >
                  {publishedPropertyDrawerDetail.builtYear !== null
                    ? String(publishedPropertyDrawerDetail.builtYear)
                    : PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_UNKNOWN_COPY}
                  {publishedPropertyDrawerDetail.builtYear !== null &&
                  publishedPropertyDrawerDetail.builtYearSource !== "synthetic_demo" ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {PUBLISHED_PROPERTY_DRAWER_STRUCTURE_YEAR_PROXY_HELPER}
                    </span>
                  ) : null}
                  {publishedPropertyDrawerDetail.builtYearSource ===
                  "synthetic_demo" ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {PUBLISHED_PROPERTY_DRAWER_SYNTHETIC_ROOF_AGE_COPY}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </section>
          <span className="sr-only" data-testid="published-property-drawer-property-id">
            {publishedPropertyDrawerDetail.propertyId}
          </span>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {PUBLISHED_PROPERTY_DRAWER_SIGNALS_SECTION_HEADING}
            </h3>
            {publishedPropertyDetailPending ? (
              <p
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
                data-testid="published-property-detail-pending"
              >
                <Spinner data-icon="inline-start" />
                Loading contractor and permit details…
              </p>
            ) : null}
            {publishedPropertyDetailErrorMessage !== null ? (
              <p
                className="text-sm text-destructive"
                role="status"
                data-testid="published-property-detail-error"
              >
                {publishedPropertyDetailErrorMessage}
              </p>
            ) : null}
            {showBbb && bbb !== null ? (
              <p data-testid="published-property-drawer-bbb">
                <Badge variant="secondary">
                  BBB rating: {bbb.ratingLetter ?? "—"}
                  {bbb.ratingScore !== null ? ` (${bbb.ratingScore})` : null}
                </Badge>
              </p>
            ) : publishedPropertyDetailPending ? null : (
              <p
                className="text-sm text-muted-foreground"
                data-testid="published-property-drawer-bbb-absent"
              >
                {PUBLISHED_PROPERTY_DRAWER_BBB_ABSENT_COPY}
              </p>
            )}

            {showSyntheticDemoLabel ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="published-property-drawer-synthetic-demo"
              >
                {PUBLISHED_PROPERTY_DRAWER_SYNTHETIC_DEMO_COPY}
              </p>
            ) : null}

            {showPermitNotes ? (
              <div
                className="flex flex-col gap-1.5"
                data-testid="property-permit-layer-panel"
              >
                <h4 className="font-heading text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {PUBLISHED_PROPERTY_DRAWER_PERMITS_HEADING}
                </h4>
                <PropertyPermitLayerPanel
                  permits={propertyPermitDetails}
                  currentUtcYear={new Date().getUTCFullYear()}
                />
              </div>
            ) : null}
          </section>
        </div>

        {onConvertPublishedPropertyToLead !== undefined ? (
          <SheetFooter className="mt-auto gap-4 border-t border-foreground/40 p-4">
            {selectedPropertyAlreadyConvertedToLead ? (
              <p
                className="text-sm text-muted-foreground"
                role="status"
                data-testid="convert-published-property-to-lead-status"
              >
                {convertPublishedPropertyToLeadStatusMessage ??
                  CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY}
              </p>
            ) : (
              <div className="flex w-full flex-col gap-4">
                {convertPublishedPropertyToLeadStatusMessage !== null &&
                !convertArmed ? (
                  <p
                    className="text-sm text-muted-foreground"
                    role="status"
                    data-testid="convert-published-property-to-lead-status"
                  >
                    {convertPublishedPropertyToLeadStatusMessage}
                  </p>
                ) : null}
                <div
                  className="plat-convert-actions"
                  data-armed={convertArmed ? "true" : "false"}
                  data-testid="convert-published-property-actions"
                >
                  <div className="plat-convert-idle" aria-hidden={convertArmed}>
                    <Button
                      type="button"
                      className="plat-convert-cta w-full"
                      data-testid="convert-published-property-to-lead"
                      onClick={() => {
                        setConvertArmed(true);
                      }}
                      disabled={convertPublishedPropertyToLeadPending}
                    >
                      {convertPublishedPropertyToLeadPending ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          Saving…
                        </>
                      ) : (
                        "Save to leads list"
                      )}
                    </Button>
                  </div>
                  <div className="plat-convert-armed" aria-hidden={!convertArmed}>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="plat-convert-confirm"
                        data-testid="confirm-convert-published-property-to-lead"
                        onClick={onConvertPublishedPropertyToLead}
                        disabled={convertPublishedPropertyToLeadPending}
                      >
                        {convertPublishedPropertyToLeadPending ? (
                          <>
                            <Spinner data-icon="inline-start" />
                            Saving…
                          </>
                        ) : (
                          "Save to leads list"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="plat-convert-cancel"
                        data-testid="cancel-convert-published-property-to-lead"
                        onClick={() => {
                          setConvertArmed(false);
                        }}
                        disabled={convertPublishedPropertyToLeadPending}
                      >
                        Not now
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * List, HUD, header, and roof marks stay usable while the popup is open.
 * A pointer on the plat itself folds the card away.
 */
function isPlatWalkChromePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.closest("[data-testid='published-property-drawer']") !== null ||
    target.closest("[data-testid='plat-floating-bar']") !== null ||
    target.closest(".plat-sheet") !== null ||
    target.closest("[aria-label='Search filters']") !== null ||
    target.closest("header") !== null ||
    target.closest("[data-testid='coverage-mode-banner']") !== null ||
    target.closest(".plat-roof-marker") !== null ||
    target.closest(".maplibregl-marker") !== null
  );
}
