import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'

/**
 * LandingV2 SEO meta tags + Open Graph + Twitter card + JSON-LD.
 *
 * Spec: MIND_WORLD_VISION.md § 11 (SEO & Share).
 *
 * Notes:
 *  - Brand: "Astra AI" (with the space) is the company; "MIND" is the consumer
 *    product. Both are mentioned but MIND is the headline brand.
 *  - "Patents pending" only — never numbers, IDs, or filing dates (per the
 *    Operating Constitution § Non-Negotiables).
 *  - No fabricated stats. The description sticks to verifiable capability
 *    claims that match the product surface.
 *  - OG image is the pre-baked dusk-skyline hero at /landingv2/og-hero.jpg —
 *    a stylized brand asset (silhouettes + brand type), not a fake screenshot.
 *  - The static `index.html` ships with its own `<link rel="canonical">` +
 *    OG tags pointed at the root MIND app URL. react-helmet-async appends
 *    its own tags instead of replacing, which Lighthouse flags as conflicting
 *    canonicals. The mount-time effect below strips the static index.html
 *    canonical + og:url so only the Helmet-managed LandingV2 canonical
 *    remains for crawlers. Restored on unmount so other routes see the
 *    original site-wide canonical again.
 */
const TITLE = 'Drive the MIND — the persistent memory layer for AI'
const DESCRIPTION =
  'Eight districts. Every capability. The first AI that remembers you. Drive the MIND World at m-i-n-d.ai/LandingV2.'
const CANONICAL = 'https://m-i-n-d.ai/LandingV2'
const OG_IMAGE_PATH = '/landingv2/og-hero.jpg'
const OG_IMAGE_ABSOLUTE = 'https://m-i-n-d.ai/landingv2/og-hero.jpg'

// JSON-LD SoftwareApplication schema. Capability claims map 1:1 to the product:
//   - knowledge graph (Graph Observatory district / GraphViewer in the app)
//   - persistent memory (the core MIND value prop)
//   - AI assistant (Chat + MCP server)
//   - life board (mind_life)
//   - developer API + MCP server (REST + @astramindapp/mcp-server on npm)
// Pricing tier shown is the free tier — the real entry point at /register.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MIND',
  alternateName: 'MIND by Astra AI',
  applicationCategory: 'ProductivityApplication',
  applicationSubCategory: 'KnowledgeManagement',
  operatingSystem: 'WebBrowser',
  url: CANONICAL,
  image: OG_IMAGE_ABSOLUTE,
  description: DESCRIPTION,
  publisher: {
    '@type': 'Organization',
    name: 'Astra AI',
    url: 'https://m-i-n-d.ai',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    category: 'Free',
    availability: 'https://schema.org/InStock',
  },
  featureList: [
    'Persistent memory across every conversation',
    'Live knowledge graph of your work',
    'Works with 50+ AI models',
    'Agents that act on your behalf',
    'Studio for video, image, music, and voice generation',
    'Life board for tasks, goals, and calendar',
    'REST API and MCP server for developers',
  ],
}

/**
 * Strip the static index.html canonical + og:url so the Helmet-managed
 * LandingV2 canonical wins. Returns a cleanup that restores them when
 * the LandingV2 component unmounts (e.g. navigation back to /).
 */
// Module-level coordination flag so that even if <Meta /> mounts twice in
// the same tree (e.g. the WebGL-fallback path mounts Meta from index.tsx
// AND from <ReducedMotionFallback />), only the first mount strips the
// static index.html canonical/og tags. The second mount becomes a no-op
// and never re-inserts on cleanup, which prevents the React `removeChild`
// crash that fired in the MINDapp version when both Metas raced to
// re-insert the same DOM nodes.
let stripActive = false

function useStripStaticConflictingHeadTags() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (stripActive) return
    stripActive = true
    const head = document.head
    type StashedNode = { el: HTMLElement; next: Node | null }
    const stashed: StashedNode[] = []

    // We only strip elements that were rendered by index.html (no
    // data-react-helmet attribute) so Helmet's own additions are left
    // alone.
    const candidates = head.querySelectorAll<HTMLElement>(
      'link[rel="canonical"]:not([data-react-helmet]), meta[property="og:url"]:not([data-react-helmet]), meta[property="og:image"]:not([data-react-helmet])',
    )
    candidates.forEach((el) => {
      stashed.push({ el, next: el.nextSibling })
      el.remove()
    })

    return () => {
      // Restore in original DOM order so the static index.html structure
      // is reconstructed for the next route. Guard every insert: in odd
      // unmount orders the next-sibling reference can already be detached
      // (Helmet pruning, fast-refresh swap), in which case we fall back
      // to plain appendChild — never let cleanup throw.
      stashed.forEach(({ el, next }) => {
        try {
          if (next && next.parentNode === head) head.insertBefore(el, next)
          else head.appendChild(el)
        } catch {
          try { head.appendChild(el) } catch { /* node detached — ignore */ }
        }
      })
      stripActive = false
    }
  }, [])
}

export function Meta() {
  // NOTE: the strip effect is intentionally disabled in the MINDworld
  // standalone. The static index.html in MINDworld already declares the
  // exact same canonical + og tags as the Helmet block below, so there is
  // no SEO conflict to resolve. Running the strip + re-insert dance
  // raced React 19's reconciler under the WebGL-fallback path (where
  // <Meta /> mounts via both index.tsx and ReducedMotionFallback) and
  // threw `Cannot read properties of null (reading 'removeChild')`
  // during DOM commits. Keeping the helper defined (and exported via the
  // file) so the original API surface from MINDapp survives — call sites
  // can re-enable it later if a routing case demands it.
  void useStripStaticConflictingHeadTags
  return (
    <Helmet prioritizeSeoTags>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={CANONICAL} />
      <meta name="robots" content="index, follow, max-image-preview:large" />
      <meta name="theme-color" content="#F43F3F" />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MIND" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={OG_IMAGE_ABSOLUTE} />
      <meta property="og:image:secure_url" content={OG_IMAGE_ABSOLUTE} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Dusk skyline of the MIND World — eight monuments around the central MIND Tower." />
      <meta property="og:locale" content="en_US" />

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="twitter:image" content={OG_IMAGE_ABSOLUTE} />
      <meta name="twitter:image:alt" content="Dusk skyline of the MIND World — eight monuments around the central MIND Tower." />

      {/* JSON-LD structured data */}
      <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
    </Helmet>
  )
}

export { OG_IMAGE_PATH, OG_IMAGE_ABSOLUTE }
