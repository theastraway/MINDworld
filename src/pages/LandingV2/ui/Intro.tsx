import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'

interface IntroProps {
  onDismiss: () => void
  /** Optional — fired on primary CTA hover. Used to trigger the audio
   *  hover-tick from the parent. Audio context isn't live yet when the
   *  intro is visible (gesture hasn't happened), so this is effectively
   *  a no-op for the intro itself, but the prop matches the pattern used
   *  elsewhere in case the intro is ever re-shown post-dismiss. */
  onCtaHover?: () => void
  /** Optional — fired immediately before `onDismiss` with the dwell time
   *  on the intro card in milliseconds. C3 wires this to the PostHog
   *  `landingv2_intro_dismissed` event. */
  onTimedDismiss?: (timeInIntroMs: number) => void
}

// Full-screen intro card shown until the user clicks "Start driving".
// Click also unlocks the audio context (handled by the parent on dismiss).
export function Intro({ onDismiss, onCtaHover, onTimedDismiss }: IntroProps) {
  // Stable mount timestamp — used to measure intro dwell time. `useRef`
  // (not `useState`) because React may double-invoke the initializer in
  // dev StrictMode; the ref is set once on mount and never re-evaluated.
  const mountedAtRef = useRef<number>(Date.now())
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="max-w-md mx-5 rounded-3xl border border-white/10 bg-[#0a0a0a] p-7 sm:p-9 text-center relative">
        <img src="/favicon.png" alt="MIND" className="size-12 mx-auto mb-4" />
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Drive the <span className="text-[#F43F3F]">MIND</span>.
        </h1>
        <p className="text-sm text-white/65 mt-4 leading-relaxed">
          Eight monuments. Each one is a real capability of MIND.
          Drive up to any monument to read what's inside.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-7 text-left">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-bold mb-1">Desktop</div>
            <div className="text-xs text-white/85">
              <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">WASD</span> drive ·{' '}
              <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">⇧</span> boost
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-bold mb-1">Mobile</div>
            <div className="text-xs text-white/85">
              Joystick · 2-finger drag = look · Tilt toggle top-right
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            onTimedDismiss?.(Date.now() - mountedAtRef.current)
            onDismiss()
          }}
          onMouseEnter={onCtaHover}
          className="mt-7 inline-flex items-center gap-2 bg-[#F43F3F] hover:bg-[#F43F3F]/90 text-white text-sm font-bold px-6 min-h-12 py-3 rounded-full transition-colors uppercase tracking-wider w-full justify-center"
        >
          Start driving <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
