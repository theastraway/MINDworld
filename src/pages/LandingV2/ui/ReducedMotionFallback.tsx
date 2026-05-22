import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import type { Monument } from '../districts/types'
import { MONUMENTS } from '../districts/data'
import { prefersReducedMotion } from '../util/prefersReducedMotion'
import { Meta } from '../seo/Meta'

interface ReducedMotionFallbackProps {
  /**
   * Called when a CTA on any district card is clicked. Receives the route
   * path the card declares (e.g. `/register`, `/llmmodels`). Parent uses
   * `useNavigate()` to navigate.
   */
  onCta: (path: string) => void
  /**
   * Optional reason string surfaced in the footer — defaults to the
   * reduced-motion explanation. Used by `WebGLFallback` to swap copy for
   * the WebGL-unsupported state without duplicating markup.
   */
  reason?: 'reduced-motion' | 'webgl'
  /**
   * When the parent already renders <Meta />, skip the internal one so
   * react-helmet-async doesn't see two competing trees managing the same
   * <title>/<link rel="canonical">/og tags. Required for the WebGLFallback
   * path, which wraps this component but also renders <Meta /> itself.
   */
  skipMeta?: boolean
}

/**
 * Hex-int color (0xRRGGBB, as stored in `Monument.color`) → CSS string.
 * The district cards use the same brand colors as the 3D monuments so the
 * static experience visually mirrors the world.
 */
const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/**
 * Static fallback for the LandingV2 drivable world.
 *
 * Renders when EITHER:
 *  - the user has `prefers-reduced-motion: reduce` set, OR
 *  - WebGL is unavailable (delegated to from `WebGLFallback`)
 *
 * Same content, taglines, details, and CTAs as the 3D world — just no
 * animation, no driving. Each card uses the matching district color as a
 * top accent so the brand-coding survives the loss of geometry.
 *
 * Layout:
 *  - Hero: "Drive the MIND." headline + still image (`/landingv2/og-hero.jpg`,
 *    pre-baked by Wave 1 / Wave 4 subagent A3 — gracefully degrades to a
 *    dark dusk gradient if the file is missing or fails to load)
 *  - 8 district cards in a 2-column grid (1-col on mobile <640px)
 *  - Footer with reason copy + link to OS motion settings
 *
 * Fully keyboard-navigable: every CTA is a real <button>, the hero has
 * a "Skip to districts" anchor, and the whole page reads top-to-bottom
 * in tab order.
 */
export function ReducedMotionFallback({ onCta, reason = 'reduced-motion', skipMeta = false }: ReducedMotionFallbackProps) {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [heroFailed, setHeroFailed] = useState(false)
  // Reduced-motion users get the hero image fully visible from frame 1 —
  // no opacity fade-in. WCAG 2.3.3 + best practice: animation that fires
  // even when the OS preference is "reduce" is a violation.
  const reducedMotion = prefersReducedMotion()

  return (
    <div className="min-h-screen w-full bg-[#1a1418] text-white selection:bg-[#F43F3F]/40">
      {/* Page <title>, OG image, JSON-LD — match what the 3D scene ships
          so the static fallback gets the same SEO + share treatment. The
          WebGLFallback wrapper passes skipMeta because its parent already
          renders <Meta />; double-mounting Helmet on the same tags races
          React's reconciler and throws `removeChild` on null. */}
      {!skipMeta && <Meta />}

      {/* Skip link for keyboard users — anchored at body start so Tab from
          the URL bar lands here first. Visible only on keyboard focus. */}
      <a
        href="#districts"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-[#F43F3F] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:font-semibold focus:text-sm focus-visible:ring-2 focus-visible:ring-[#FFCC4D]"
      >
        Skip to districts
      </a>

      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="relative w-full overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            background: heroFailed || !heroLoaded
              ? 'linear-gradient(180deg, #1a1418 0%, #2a1f25 60%, #3a2a30 100%)'
              : 'transparent',
          }}
        />
        {!heroFailed && (
          <img
            src="/landingv2/og-hero.jpg"
            alt=""
            aria-hidden="true"
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroFailed(true)}
            className="absolute inset-0 w-full h-full object-cover z-0"
            style={{
              opacity: heroLoaded ? 0.55 : 0,
              transition: reducedMotion ? 'none' : 'opacity 600ms ease-out',
            }}
          />
        )}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-[#1a1418]/40 to-[#1a1418]" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 pt-16 sm:pt-24 pb-12 sm:pb-20">
          <div className="flex items-center gap-2.5 mb-8" aria-hidden="true">
            <img src="/favicon.png" alt="" className="size-7" />
            <div>
              <div className="text-sm font-bold tracking-tight leading-none">MIND</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/85 leading-tight mt-1">Drive the knowledge</div>
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05]">
            Drive the <span className="text-[#F43F3F]">MIND</span>.
          </h1>
          <p className="mt-5 sm:mt-7 max-w-2xl text-base sm:text-lg text-white/90 leading-relaxed">
            Eight districts. Every capability. The first AI that remembers you.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/register"
              onClick={(e) => {
                // Intercept for SPA nav while preserving real <a>
                // semantics (middle-click open-in-new-tab, copy URL,
                // screen-reader "link" announcement vs. "button").
                if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                  e.preventDefault()
                  onCta('/register')
                }
              }}
              className="inline-flex items-center gap-2 bg-[#F43F3F] hover:bg-[#F43F3F]/90 active:bg-[#F43F3F]/80 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors uppercase tracking-wider shadow-[0_4px_20px_rgba(244,63,63,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1418]"
            >
              Get MIND <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href="#districts"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors uppercase tracking-wider border border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1418]"
            >
              Explore districts
            </a>
          </div>
        </div>
      </header>

      {/* ── District grid ───────────────────────────────── */}
      <section
        id="districts"
        className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 pb-16 sm:pb-24"
        aria-labelledby="districts-heading"
      >
        <h2 id="districts-heading" className="sr-only">All eight districts of the MIND World</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 list-none">
          {MONUMENTS.map((m: Monument, idx: number) => (
            <li key={m.key}>
              <article
                aria-labelledby={`fallback-district-${m.key}-title`}
                className="relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden flex flex-col h-full"
              >
                {/* Brand-color top accent */}
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full"
                  style={{ backgroundColor: hexColor(m.color) }}
                />
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id={`fallback-district-${m.key}-title`}
                      className="text-lg sm:text-xl font-extrabold tracking-tight text-white"
                    >
                      {m.title}
                    </h3>
                    <span
                      aria-hidden="true"
                      className="text-[10px] uppercase tracking-[0.18em] font-bold"
                      style={{ color: hexColor(m.color) }}
                    >
                      District {idx + 1}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-white/90">{m.tagline}</p>
                  <p className="mt-3 text-sm text-white/80 leading-relaxed flex-1">{m.detail}</p>
                  <div className="mt-5">
                    <a
                      href={m.ctaPath}
                      onClick={(e) => {
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                          e.preventDefault()
                          onCta(m.ctaPath)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-white hover:text-[#F43F3F] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1418] rounded-md px-1 py-0.5"
                      aria-label={`${m.cta} — ${m.title}`}
                    >
                      {m.cta} <ArrowRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 pb-16 sm:pb-20 text-center">
        <div className="border-t border-white/15 pt-8 sm:pt-10">
          {reason === 'reduced-motion' ? (
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed max-w-md mx-auto">
              Animation off — your device has reduced-motion turned on.
              {' '}
              <a
                href="https://www.w3.org/WAI/perspective-videos/seizures/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline hover:text-[#F43F3F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1418] rounded"
              >
                Learn about motion settings
              </a>
              {' '}
              or open this page on a device with motion enabled to drive the world.
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed max-w-md mx-auto">
              3D world off — your browser doesn't support WebGL.
              Open this page in Safari, Chrome, or Firefox to drive the world.
            </p>
          )}
          <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-white/80 font-bold">
            MIND · the persistent memory layer for AI
          </p>
        </div>
      </footer>
    </div>
  )
}
