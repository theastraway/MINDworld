import { useEffect, useState } from 'react'
import { Palette, X, Lock } from 'lucide-react'
import {
  SKINS,
  SKIN_UNLOCK_HINTS,
  getCurrentSkin,
  setCurrentSkin,
  getUnlockedSkins,
  type CarSkinKey,
  type CarSkin,
} from '../car/Skins'

interface SkinPickerProps {
  /** Called when the user selects a new (unlocked) skin. */
  onApply: (key: CarSkinKey) => void
}

/**
 * Bottom-right car-skin picker for LandingV2.
 *
 * Always visible (icon button). Click to open a small popover with 4 chips,
 * one per skin in `SKINS`. Locked skins render greyed-out with a 🔒 emoji
 * and the unlock hint copy. Clicking an unlocked chip applies the skin via
 * the parent callback and persists the choice in localStorage so the next
 * visit boots into the same skin.
 *
 * Listens for `mindworld:skin-unlocked` events on `window` so the picker
 * reactively un-greys when a skin is unlocked mid-session (e.g. summit
 * cinematic, Konami code, hidden district discovery).
 */
export function SkinPicker({ onApply }: SkinPickerProps) {
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState<CarSkinKey[]>(() => getUnlockedSkins())
  const [current, setCurrent] = useState<CarSkinKey>(() => getCurrentSkin())

  // Re-read unlocked set on the `skin-unlocked` event so the chip un-greys
  // without requiring a remount.
  useEffect(() => {
    const refresh = () => setUnlocked(getUnlockedSkins())
    window.addEventListener('mindworld:skin-unlocked', refresh)
    return () => window.removeEventListener('mindworld:skin-unlocked', refresh)
  }, [])

  const handleSelect = (key: CarSkinKey) => {
    if (!unlocked.includes(key)) return
    setCurrent(key)
    setCurrentSkin(key)
    onApply(key)
  }

  const skinList: CarSkin[] = (Object.keys(SKINS) as CarSkinKey[]).map((k) => SKINS[k])

  return (
    <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
      {open && (
        <div
          role="dialog"
          aria-label="Choose a car skin"
          className="mb-2 rounded-xl border border-white/15 bg-black/80 backdrop-blur-md p-3 shadow-[0_8px_30px_rgba(0,0,0,0.4)] w-[260px]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/75 font-bold">Car skin</div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close skin picker"
              className="size-7 rounded-full flex items-center justify-center text-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Car skin options">
            {skinList.map((s) => {
              const isUnlocked = unlocked.includes(s.key)
              const isCurrent = current === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => handleSelect(s.key)}
                  disabled={!isUnlocked}
                  role="radio"
                  aria-checked={isCurrent}
                  aria-label={isUnlocked ? `Apply skin: ${s.label}` : `Locked skin: ${s.label}${SKIN_UNLOCK_HINTS[s.key] ? ` (${SKIN_UNLOCK_HINTS[s.key]})` : ''}`}
                  className={[
                    'w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2.5 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                    isUnlocked
                      ? isCurrent
                        ? 'bg-white/15 ring-1 ring-white/40'
                        : 'bg-white/5 hover:bg-white/10'
                      : 'bg-white/[0.03] opacity-60 cursor-not-allowed',
                  ].join(' ')}
                >
                  {/* Color swatch trio */}
                  <div className="flex gap-1 shrink-0" aria-hidden="true">
                    <span
                      className="size-3 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: '#' + s.hull.toString(16).padStart(6, '0') }}
                    />
                    <span
                      className="size-3 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: '#' + s.stripe.toString(16).padStart(6, '0') }}
                    />
                    <span
                      className="size-3 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: '#' + s.hub.toString(16).padStart(6, '0') }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-white leading-tight flex items-center gap-1.5">
                      {s.label}
                      {!isUnlocked && <Lock className="size-3 text-white/60" aria-hidden="true" />}
                    </div>
                    {!isUnlocked && SKIN_UNLOCK_HINTS[s.key] && (
                      <div className="text-[10px] text-white/70 leading-tight mt-0.5">{SKIN_UNLOCK_HINTS[s.key]}</div>
                    )}
                    {isUnlocked && isCurrent && (
                      <div className="text-[10px] text-white/80 leading-tight mt-0.5">Active</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close skin picker' : 'Open skin picker'}
        aria-expanded={open}
        className="size-11 sm:size-9 rounded-full bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
      >
        <Palette className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
