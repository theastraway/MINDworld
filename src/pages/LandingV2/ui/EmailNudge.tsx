import { useEffect, useRef, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { toast } from 'sonner'

import { trackEvent } from '@/lib/analytics'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

/**
 * Soft-conversion nudge — bottom-center email capture banner.
 *
 * Spec: MIND_WORLD_VISION § 8 (Conversion Funnel — Soft Conversions).
 * Surfaced ~30s after the visitor discovers their 3rd monument, on the
 * theory that by then they've felt enough of the world to opt in.
 *
 * Behavior:
 *   - Floats bottom-center, above the mobile joystick (bottom-6 vs. our
 *     bottom-28-on-mobile / bottom-6-on-desktop offset).
 *   - Slides up from below on mount via CSS transition.
 *   - Dismiss "X" sets `localStorage["mind-world-nudge-dismissed"]="1"`;
 *     the parent honors that flag and never re-mounts on this browser.
 *   - On successful submit, sets `localStorage["mind-world-nudge-subscribed"]="1"`
 *     so we also never re-prompt a subscriber.
 *   - Submit POSTs `{email, source: "landingv2_soft_nudge"}` to
 *     /public/landingv2/subscribe. 2xx → toast + dismiss. Anything else
 *     → keep the form open with an inline error.
 *   - Pure-CSS slide-up — no animation libs.
 *   - Accessible: real <form>, real <label>, aria-live error region,
 *     focused input on mount, ESC closes via parent (we expose the
 *     same dismiss callback to keyboard).
 *
 * Analytics events (C3 may later wrap these — for now we call
 * `trackEvent` directly so we don't block on the events module):
 *   - `landingv2_nudge_shown` (on mount)
 *   - `landingv2_nudge_dismissed` (on close click)
 *   - `landingv2_nudge_subscribed` (on 2xx submit)
 */
const DISMISS_KEY = 'mind-world-nudge-dismissed'
const SUBSCRIBED_KEY = 'mind-world-nudge-subscribed'
const SOURCE_TAG = 'landingv2_soft_nudge'

/**
 * Base URL for the MIND backend. Mirrors `liveData.ts`. Standalone landing
 * lives at `mindworld.vercel.app`; backend lives at `https://www.m-i-n-d.ai`.
 */
const API_BASE: string =
  (import.meta.env.VITE_MIND_API_BASE as string | undefined) || 'https://www.m-i-n-d.ai'

interface EmailNudgeProps {
  /** Called by the parent when the user dismisses or successfully
   *  subscribes — gives the parent a chance to unmount the component
   *  rather than just hide it. */
  onClose: () => void
}

type SubmitState = 'idle' | 'submitting' | 'error'

export function EmailNudge({ onClose }: EmailNudgeProps) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Reduced-motion: start visible immediately so the slide-up transition
  // is skipped. The dismiss path still uses a 320ms timeout to give the
  // parent a chance to unmount; under reduced-motion the user just sees
  // the card disappear cleanly.
  const reducedMotion = prefersReducedMotion()
  const [visible, setVisible] = useState(reducedMotion)
  const inputRef = useRef<HTMLInputElement>(null)
  const shownEventFiredRef = useRef(false)

  // Slide-up transition: mount invisible, flip to visible on next frame
  // so the CSS transition runs. Also fire the `shown` analytics event
  // exactly once.
  useEffect(() => {
    if (!reducedMotion) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [reducedMotion])

  useEffect(() => {
    if (!shownEventFiredRef.current) {
      shownEventFiredRef.current = true
      try {
        trackEvent('landingv2_nudge_shown', { source: SOURCE_TAG })
      } catch {
        // analytics is best-effort
      }
    }
  }, [])

  // Autofocus the email input ~300ms after mount so the focus ring
  // coincides with the slide-up landing rather than yanking it off the
  // joystick / screen mid-slide.
  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
    }, 320)
    return () => window.clearTimeout(t)
  }, [])

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Storage may be unavailable (private mode) — that's fine; the
      // parent state-only path also prevents re-show this session.
    }
    try {
      trackEvent('landingv2_nudge_dismissed', { source: SOURCE_TAG })
    } catch {
      // noop
    }
    setVisible(false)
    // Match the CSS transition duration before signaling the parent
    // so the slide-down has time to play.
    window.setTimeout(onClose, 320)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'submitting') return
    const trimmed = email.trim()
    if (!trimmed) {
      setErrorMessage('Add your email first.')
      setState('error')
      return
    }
    setErrorMessage(null)
    setState('submitting')
    try {
      const res = await fetch(`${API_BASE}/public/landingv2/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'omit',
        body: JSON.stringify({ email: trimmed, source: SOURCE_TAG }),
      })
      if (!res.ok) {
        if (res.status === 422) {
          setErrorMessage('That email looks off. Try again.')
        } else {
          setErrorMessage('Something went wrong. Try again.')
        }
        setState('error')
        return
      }
      // Success — toast, persist, fire event, dismiss.
      try {
        localStorage.setItem(SUBSCRIBED_KEY, '1')
      } catch {
        // noop — non-fatal
      }
      try {
        trackEvent('landingv2_nudge_subscribed', { source: SOURCE_TAG })
      } catch {
        // noop
      }
      toast.success("Thanks. You're on the list.")
      setVisible(false)
      window.setTimeout(onClose, 320)
    } catch {
      setErrorMessage('Something went wrong. Try again.')
      setState('error')
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="mind-nudge-title"
      aria-describedby="mind-nudge-copy"
      className={[
        // Positioning — bottom-center. On mobile the joystick sits at
        // bottom-6 left-6 size-32 (128px tall) — push the nudge above
        // it so they never overlap. On sm+ we hug bottom-6.
        'absolute z-30 left-1/2 -translate-x-1/2',
        'bottom-44 sm:bottom-6',
        // Width: full-bleed minus margin on mobile, capped at ~28rem
        'w-[calc(100vw-2rem)] max-w-md',
        // Slide-up transition — translate based on `visible` state. The
        // transition is suppressed entirely under reduced-motion.
        reducedMotion ? '' : 'transition-all duration-300 ease-out',
        reducedMotion
          ? visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          : visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none',
      ].filter(Boolean).join(' ')}
    >
      <div className="rounded-2xl border border-[#F43F3F]/40 bg-black/90 backdrop-blur-md p-4 sm:p-5 relative shadow-[0_8px_60px_rgba(244,63,63,0.30)]">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss email signup"
          className="absolute top-2.5 right-2.5 size-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div
          id="mind-nudge-title"
          className="text-[10px] uppercase tracking-[0.32em] text-[#F43F3F] font-bold pr-8"
        >
          Keep driving with MIND
        </div>
        <p
          id="mind-nudge-copy"
          className="text-sm text-[#f5e9d4] mt-1.5 leading-snug pr-8"
        >
          Drop your email. I'll write when something worth your inbox ships.
        </p>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col sm:flex-row gap-2">
          <label htmlFor="mind-nudge-email" className="sr-only">
            Email address
          </label>
          <input
            ref={inputRef}
            id="mind-nudge-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            disabled={state === 'submitting'}
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (state === 'error') {
                setState('idle')
                setErrorMessage(null)
              }
            }}
            className="flex-1 min-w-0 rounded-full bg-white/[0.07] border border-white/25 px-4 py-2.5 text-sm text-white placeholder:text-white/60 outline-none focus:border-[#F43F3F] focus:bg-white/[0.10] focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="bg-[#F43F3F] hover:bg-[#F43F3F]/90 text-white text-[12px] font-bold px-4 py-2.5 rounded-full transition-colors uppercase tracking-wider inline-flex items-center justify-center gap-1.5 shadow-[0_4px_20px_rgba(244,63,63,0.4)] disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {state === 'submitting' ? 'Sending…' : (
              <>
                Send it <ArrowRight className="size-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[1.25rem] mt-1.5 text-[11px] text-[#FCA5A5] font-semibold"
        >
          {errorMessage}
        </div>
      </div>
    </div>
  )
}

/** Returns true when the nudge has already been dismissed or subscribed
 *  on this browser. Parents must call this BEFORE scheduling the show
 *  timer — once dismissed, the nudge must never appear again. */
export function isEmailNudgeSuppressed(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY) === '1') return true
    if (localStorage.getItem(SUBSCRIBED_KEY) === '1') return true
  } catch {
    // localStorage unavailable (private mode) — fail open: show the
    // nudge. Worst case the user dismisses it once per session.
  }
  return false
}
