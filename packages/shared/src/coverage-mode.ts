/**
 * Honesty / default-geography mode derived from the served catalog.
 *
 * - chester_demo_synthetic: labeled synthetic roof ages + synthetic roofing permits
 * - chester_real_limited: published Chester records (no roof ages / no roofing UCC)
 * - montgomery_roof_age_demo: neighbor roof-age demo
 * - lee_dev_fallback: Lee while no Chester key is map-ready
 */
export type CoverageMode =
  | "lee_dev_fallback"
  | "chester_demo_synthetic"
  | "chester_real_limited"
  | "montgomery_roof_age_demo";
