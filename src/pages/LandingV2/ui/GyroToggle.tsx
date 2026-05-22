import { Smartphone } from 'lucide-react'
import { useState } from 'react'

interface GyroToggleProps {
  /** True when gyro tilt-steering is active. */
  active: boolean
  /**
   * Called when the user taps the button. Parent is responsible for
   * requesting permission, attaching the listener, and flipping `active`.
   * Synchronous tap → permission prompt (iOS requires this — async chains
   * lose the user-gesture context).
   */
  onToggle: () => Promise<void> | void
  /** True when the device exposes orientation hardware at all. Hidden if false. */
  supported: boolean
}

/**
 * Top-area toggle that flips between joystick-only and gyro-tilt steering
 * on iOS / Android (Wave-3 / C5).
 *
 * Visual states:
 *  - off: outlined chip, "Tilt to steer"
 *  - on:  filled brand-red chip, "Tilt: ON"
 *
 * Hidden entirely on devices without DeviceOrientationEvent — there's
 * nothing for the user to enable.
 */
export function GyroToggle({ active, onToggle, supported }: GyroToggleProps) {
  const [busy, setBusy] = useState(false)
  if (!supported) return null

  const onClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onToggle()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Disable tilt-to-steer' : 'Enable tilt-to-steer'}
      className={
        (active
          ? 'inline-flex items-center gap-1.5 bg-[#F43F3F] text-white text-[11px] font-bold px-3 min-h-11 rounded-full transition-colors uppercase tracking-wider shadow-[0_4px_20px_rgba(244,63,63,0.4)]'
          : 'inline-flex items-center gap-1.5 bg-black/60 border border-white/30 text-white text-[11px] font-bold px-3 min-h-11 rounded-full transition-colors uppercase tracking-wider backdrop-blur-md')
        + ' focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40'
      }
    >
      <Smartphone className="size-3.5" aria-hidden="true" />
      {active ? 'Tilt ON' : 'Tilt'}
    </button>
  )
}
