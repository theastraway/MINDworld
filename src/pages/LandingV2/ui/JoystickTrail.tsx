import { useEffect, useRef, useState } from 'react'
import { TRAIL_LEN, type JoystickHandle } from '../controls/Joystick'

interface JoystickTrailProps {
  /**
   * Callback that returns the current joystick handle (or null if not yet
   * attached). We poll this each rAF cycle rather than subscribing —
   * Joystick's `trail` array mutates in place and we want to read the
   * latest snapshot per frame without forcing a parent re-render.
   */
  getHandle: () => JoystickHandle | null
}

/**
 * Fading-circle trail rendered behind the joystick stick (Wave-3 / C5).
 *
 * Reads the joystick handle's `trail` snapshot every rAF, renders N small
 * dots positioned at each trail sample. Older samples fade + shrink.
 * Purely cosmetic — does not interact with the touch handlers.
 */
export function JoystickTrail({ getHandle }: JoystickTrailProps) {
  const [, force] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const loop = () => {
      // Trigger a re-render each frame to re-read the trail array. Cheap
      // because the visual is just 6 absolutely-positioned divs.
      force((n) => (n + 1) % 1024)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handle = getHandle()
  const trail = handle?.trail ?? []

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {trail.map((p, i) => {
        // Newest first → i=0 is the current stick, i=TRAIL_LEN-1 is oldest.
        // Fade + shrink proportional to position in the queue.
        const t = 1 - i / TRAIL_LEN
        const size = 10 + t * 6 // 10..16px
        const opacity = t * 0.45
        return (
          <div
            key={i}
            className="absolute rounded-full bg-[#F43F3F]"
            style={{
              left: `calc(50% + ${p.x}px)`,
              top: `calc(50% + ${p.y}px)`,
              width: `${size}px`,
              height: `${size}px`,
              transform: 'translate(-50%, -50%)',
              opacity,
              transition: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
