/**
 * Live-data fetcher for the MIND World landing page.
 *
 * Consumes `GET /public/world-stats` (created by B2, see
 * `backend/routes/public_world_stats_routes.py`) which returns aggregate-only
 * counts with no PII. Cached for 5 min in sessionStorage so per-page
 * navigations don't refetch.
 *
 * Hard rule from MIND_WORLD_VISION § 12 + § 16: **never fabricate numbers**.
 * If a field comes back undefined OR the whole call fails, callers MUST hide
 * the corresponding UI element rather than substituting a placeholder.
 */

export type WorldStats = {
  /** Total entities aggregated across every MIND tenant. May be omitted. */
  entity_count?: number
  /** Total relationships across every MIND tenant. May be omitted. */
  relationship_count?: number
  /** Number of supported LLM models. Deterministic. May be omitted only if catalog import broke. */
  model_count?: number
  /** User count rounded DOWN to nearest 50 for privacy. May be omitted. */
  user_count_approx?: number
  /** Unix epoch seconds when the backend computed this payload. */
  as_of?: number
}

const STORAGE_KEY = 'mind-world-stats:v1'
const TTL_MS = 5 * 60 * 1000 // 5 min — must match backend `_TTL_SECONDS`

/**
 * Base URL for the MIND backend. The standalone is served from
 * `mindworld.vercel.app` (and via rewrite from `m-i-n-d.ai/LandingV2`), but
 * the backend lives at `https://www.m-i-n-d.ai`. Default to production so
 * dev sees real numbers; override with `VITE_MIND_API_BASE` for staging.
 */
const API_BASE: string =
  (import.meta.env.VITE_MIND_API_BASE as string | undefined) || 'https://www.m-i-n-d.ai'

type CacheEnvelope = { data: WorldStats; expiresAt: number }

/**
 * Returns the latest world stats, or `null` if neither the cache nor the
 * network produced anything usable. Never throws. Callers may render
 * unconditionally and check field presence.
 */
export async function fetchWorldStats(): Promise<WorldStats | null> {
  // ── 1. sessionStorage cache ──────────────────────────────────────────
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as CacheEnvelope
      if (parsed && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
        return parsed.data
      }
    }
  } catch {
    // sessionStorage may be unavailable (private mode, quota); fall through.
  }

  // ── 2. Network fetch — never throw ───────────────────────────────────
  try {
    const res = await fetch(`${API_BASE}/public/world-stats`, {
      headers: { Accept: 'application/json' },
      // No credentials — endpoint is public + aggregate-only.
      credentials: 'omit',
    })
    if (!res.ok) return null
    const data = (await res.json()) as WorldStats
    if (!data || typeof data !== 'object') return null

    try {
      const envelope: CacheEnvelope = { data, expiresAt: Date.now() + TTL_MS }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    } catch {
      // Quota / disabled — silently ignore; next call will re-fetch.
    }
    return data
  } catch {
    return null
  }
}

/**
 * Convenience: returns `[label, value]` pairs for any present numeric fields,
 * formatted with thousand-separators. Useful for stat-ring components that
 * just want "what's available to show".
 */
export function formatStatsForDisplay(
  stats: WorldStats | null
): Array<[string, string]> {
  if (!stats) return []
  const out: Array<[string, string]> = []
  const fmt = (n: number) => n.toLocaleString('en-US')
  if (typeof stats.entity_count === 'number') out.push(['Entities', fmt(stats.entity_count)])
  if (typeof stats.relationship_count === 'number')
    out.push(['Relationships', fmt(stats.relationship_count)])
  if (typeof stats.model_count === 'number') out.push(['Models', fmt(stats.model_count)])
  if (typeof stats.user_count_approx === 'number')
    out.push(['Users', `${fmt(stats.user_count_approx)}+`])
  return out
}
