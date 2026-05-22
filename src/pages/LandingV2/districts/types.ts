// District / Monument type definitions for LandingV2.
//
// Keep the data shape stable — code throughout LandingV2 (the buildMonument
// factory, the React UI cards, the proximity detector, the discovery counter)
// depends on these exact field names.
//
// Wave 2 (B2) introduced the `District` shape (per MIND_WORLD_VISION § 3 + §14)
// with explicit per-district `key`s, optional `hidden` flag for the easter-egg
// Sanctuary, and `beacons[]` strings consumed by Wave 2 / B6's beacon system.
//
// The legacy `Monument` type is preserved as an alias of `District` so existing
// imports (`import type { Monument }`) keep working without refactor.

export type DistrictKey =
  | 'memory'
  | 'graph'
  | 'models'
  | 'agents'
  | 'studio'
  | 'life'
  | 'api'
  | 'patents'
  | 'mindsense'

export interface District {
  /** Stable identifier — used for discovery tracking, PostHog events, and factory dispatch. */
  key: DistrictKey
  /** Display title on the proximity card. */
  title: string
  /** Short tagline shown above the title. */
  tagline: string
  /** Multi-sentence detail copy below the title. */
  detail: string
  /** CTA button label. */
  cta: string
  /** SPA route the CTA navigates to. */
  ctaPath: string
  /** [x, z] world position. */
  position: [number, number]
  /** Brand-coded color for the monument + label. */
  color: number
  /**
   * Hidden districts (e.g. MINDsense Sanctuary) are NOT counted in the main
   * discovery total and are fog-occluded by default. Wave 4 / D4 polishes
   * the reveal animation; for Wave 2 we simply position + render them and
   * let proximity detection do the discovery.
   */
  hidden?: boolean
  /**
   * Fun-info beacon copy per § 7. Strings are placed in-world by Wave 2 / B6.
   * Anchored to the district so each beacon is contextual.
   */
  beacons?: string[]
}

// ── Backwards-compat aliases ────────────────────────────────────────────
// Existing modules import `Monument` from this file. Keep it as a structural
// alias so we don't have to chase down every reference.
export type Monument = District
