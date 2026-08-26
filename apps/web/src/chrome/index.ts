/**
 * App chrome: honesty banner and deferred CRM sheets for Campaigns / Inbox / Reports.
 */

export {
  CoverageModeBanner,
  type CoverageModeBannerPlacement,
  type CoverageModeBannerProps,
} from "./CoverageModeBanner";
export {
  OperateWorkspaceHeader,
  type OperateWorkspaceHeaderProps,
} from "./OperateWorkspaceHeader";
export {
  CHESTER_PARCEL_COUNT,
  CHESTER_DEMO_SYNTHETIC_BADGE,
  CHESTER_DEMO_ROOF_AGE_DISCLAIMER,
  MONTGOMERY_ROOF_AGE_DEMO_PARCEL_COUNT,
  resolveCoverageModeBannerCopy,
  resolveTerritoryHeading,
  type CoverageMode,
} from "./coverage-mode-banner-copy";
export {
  TerritoryCountyCatalogPicker,
  type TerritoryCountyCatalogPickerProps,
} from "./TerritoryCountyCatalogPicker";
export {
  createHttpCountiesListApiClient,
  type CountiesListApiClient,
} from "./create-http-counties-list-api-client";
export { usePublishedCountyCatalogList } from "./use-published-county-catalog-list";
export {
  LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
  filterPublishedCountyCatalogListItems,
  formatTerritoryCountyHeading,
  resolveCoverageModeForCountyKey,
  resolveDefaultCountyKeyFromCatalog,
  resolveMapSearchReadyCountyKeyFallback,
  type PublishedCountyCatalogListItem,
} from "./published-county-catalog-list-item";
export {
  PlatDeferredFeaturePanel,
  type PlatDeferredFeaturePanelProps,
} from "./PlatDeferredFeaturePanel";
export {
  PlatFloatingBar,
  PLAT_LEAD_LANDED_MS,
  type PlatFloatingBarProps,
  type PlatLiveSheetId,
  type PlatSheetId,
} from "./PlatFloatingBar";
export { PlatSheetNotice, type PlatSheetNoticeProps } from "./PlatSheetNotice";
export {
  DISABLED_CRM_NAV_SECTIONS,
  PLAT_DEFERRED_COMING_LABEL,
  type DisabledCrmNavSection,
  type DisabledCrmNavSectionId,
} from "./disabled-crm-nav-sections";
