/**
 * LandingV2 — PostHog event funnel (Wave 3 / Subagent C3).
 *
 * Spec: MIND_WORLD_VISION.md § 8 (Conversion Funnel + Analytics).
 *
 * Thin domain-specific wrapper around the existing global `trackEvent()`
 * from `@/lib/analytics`. Centralises every LandingV2 event in one place so
 * the call sites (index.tsx, MonumentCard, ShareButton, MuteButton,
 * WebGLFallback, Beacons callback, future Summit component) stay readable
 * and so the event names + property shapes match the vision doc verbatim.
 *
 * Design rules (per § 16 Subagent Operating Rules + Boil-the-Ocean):
 *  - No new dependencies — only `trackEvent` from the existing wrapper.
 *  - No PII — district keys, viewport dims, opaque IDs only. Never names,
 *    emails, IPs, or user-typed strings.
 *  - `trackEvent` is already a no-op when `VITE_POSTHOG_KEY` is unset, so
 *    callers don't have to guard themselves.
 *  - "Once per browser tab" events use a process-local `Set`. Persisting
 *    via localStorage would suppress the event on subsequent tab opens,
 *    which is wrong for time-in-world (we want one fire per session) and
 *    almost wrong for the others. Persistence is opt-in via `persist`.
 *  - Time helpers use `Date.now()`, not `performance.now()`, so the
 *    timestamp survives Suspense remounts (the SceneRoot lazy chunk
 *    suspends until WebGL is ready).
 */

import { trackEvent } from '@/lib/analytics'

/** Anchor timestamp for all "time_since_load_ms" properties.
 *  Snapped at module init — the first import of this file happens during
 *  the LandingV2 lazy chunk hydration, which is the closest proxy we have
 *  to "user arrived at the page". */
const SESSION_LOAD_TS = Date.now()

const onceFired = new Set<string>()

/**
 * Fire `event` only once per browser tab (or, if `persist === true`, once
 * per browser ever via localStorage). The per-tab variant is used for
 * `time_in_world:*` so a hard refresh re-arms the timers; the persistent
 * variant is used for `audio_unmuted` + `webgl_fallback_shown` so we don't
 * inflate the event counts with the same user toggling repeatedly.
 */
function trackOnce(
  key: string,
  event: string,
  props?: Record<string, unknown>,
  persist: boolean = false,
): void {
  const k = `__landingv2_${key}`
  if (onceFired.has(k)) return
  if (persist && typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem(k)) {
        onceFired.add(k)
        return
      }
      localStorage.setItem(k, '1')
    } catch {
      // Quota or disabled storage — fall through to in-memory only.
    }
  }
  onceFired.add(k)
  trackEvent(event, props)
}

export const lv2 = {
  /** First render of <LandingV2 />. Fired exactly once per mount. */
  landed: (props: {
    device: 'mobile' | 'desktop'
    viewport_w: number
    viewport_h: number
    webgl_supported: boolean
    reduced_motion: boolean
    referrer: string
  }): void => trackEvent('landingv2_loaded', props),

  /** Intro overlay dismissed (Start driving click). */
  introDismissed: (timeInIntroMs: number): void =>
    trackEvent('landingv2_intro_dismissed', { time_in_intro_ms: timeInIntroMs }),

  /** Car entered proximity of a not-yet-discovered monument.
   *  `discoveryOrder` is 1-based — 1st through 9th. */
  monumentDiscovered: (key: string, discoveryOrder: number): void =>
    trackEvent(`monument_discovered:${key}`, {
      district_key: key,
      discovery_order: discoveryOrder,
      time_since_load_ms: Date.now() - SESSION_LOAD_TS,
    }),

  /** User clicked the CTA inside the open MonumentCard. */
  monumentCtaClicked: (key: string, targetPath: string): void =>
    trackEvent(`monument_cta_clicked:${key}`, {
      district_key: key,
      target_path: targetPath,
    }),

  // TODO(C1+C2): wire summit events.
  // Summit.tsx does not exist yet in this branch — C1+C2 ships it as part
  // of Wave 3. The helpers below are pre-wired so C1+C2 can call them at
  // merge time without C3 needing a follow-up pass. Event names + payload
  // shape match § 8 of the vision doc.

  /** All 8 main districts discovered → summit cinematic begins. */
  summitReached: (discoveryOrder: string[]): void =>
    trackEvent('summit_reached', {
      time_since_load_ms: Date.now() - SESSION_LOAD_TS,
      discovery_order_array: discoveryOrder.join(','),
    }),

  /** User clicked one of the 4 Summit CTAs. */
  summitCtaClicked: (target: 'register' | 'demo' | 'api' | 'founder_email'): void =>
    trackEvent('summit_cta_clicked', { target }),

  /** Hidden interaction triggered (Konami, Founder Stone, Sanctuary,
   *  Achilles, etc.). One event per uniquely-named egg. */
  easterEggFound: (eggName: string): void =>
    trackEvent(`easter_egg_found:${eggName}`, {
      egg_name: eggName,
      time_since_load_ms: Date.now() - SESSION_LOAD_TS,
    }),

  /** A fun-info beacon hit full opacity for the first time this session.
   *  Beacons.ts already debounces this to once-per-beacon-per-session. */
  beaconRead: (text: string): void =>
    trackEvent('landingv2_beacon_read', { beacon_text: text }),

  /** ShareButton onClick — fires for every click, regardless of which
   *  branch (native share vs. download) the user lands on. */
  screenshotCaptured: (withMonument: boolean): void =>
    trackEvent('screenshot_captured', { with_monument: withMonument }),

  /** ShareButton completed a successful share path (native or download). */
  shareClicked: (path: 'native' | 'download'): void =>
    trackEvent('share_clicked', { share_path: path }),

  /** WebGLFallback mounted. Fires once per browser ever — repeated WebGL
   *  failures from the same device are noise, not signal. */
  webglFallbackShown: (device: 'mobile' | 'desktop'): void =>
    trackOnce('webgl_fallback', 'webgl_fallback_shown', { device }, true),

  /** First time the user clicked unmute from a muted → unmuted state.
   *  Persistent — repeated mute/unmute cycles don't re-fire. */
  audioUnmuted: (): void => trackOnce('audio_unmuted', 'audio_unmuted', undefined, true),

  /** Time-on-page milestones. Each fires exactly once per tab (in-memory)
   *  so a hard refresh re-arms the timers — that's intentional, the
   *  funnel question is "how long did this session linger", not "did
   *  this human ever linger". */
  timeInWorld: (seconds: 30 | 60 | 300 | 600): void =>
    trackOnce(`time_in_world_${seconds}`, `time_in_world:${seconds}s`, { seconds }),
}
