interface DiscoveryCounterProps {
  /**
   * Set of discovered district keys (including the hidden 'mindsense' key
   * if the easter-egg Sanctuary has been found).
   */
  discoveredKeys: Set<string>
  /** Total number of MAIN (non-hidden) districts in the world. */
  mainTotal: number
  /** True if at least one hidden district exists in the data (always true post-Wave-2). */
  hasHidden: boolean
  /** Whether the hidden Sanctuary district has been discovered. */
  hiddenFound: boolean
  /**
   * Wave 3 / C6 — number of C6 easter eggs found this session
   * (excluding the Sanctuary, which already drives the hidden-district
   * morph above). Used to render an "✨ all eggs found" badge below the
   * counter when the user has collected all 5.
   *
   * Optional — defaults to 0 so the existing call sites keep working
   * without a code change.
   */
  eggsFound?: number
  /** Wave 3 / C6 — total number of C6 easter eggs in the world (5). */
  eggsTotal?: number
}

/**
 * Top-center "X / N discovered" pill.
 *
 * Wave 2 / B2 logic (per MIND_WORLD_VISION § 3 D9):
 *   - Until the hidden Sanctuary is found, denominator stays at `mainTotal` (8).
 *     `discoveredKeys` may have already added the hidden key if the user drove
 *     straight to it — but we still show `X / 8` so the easter egg stays a
 *     surprise to share.
 *   - Once `hiddenFound` is true AND the main 8 are also all discovered, morph
 *     to `9 / 9` with a gold accent + ✨ glyph (an "all found" styling).
 *   - If user finds the hidden one BEFORE all 8 main, we still show the
 *     gold-flavored count `(discoveredMain + 1) / 9` to communicate they've
 *     unlocked the bonus tier — the styling tells them the secret is out.
 */
export function DiscoveryCounter({
  discoveredKeys,
  mainTotal,
  hasHidden,
  hiddenFound,
  eggsFound = 0,
  eggsTotal = 0,
}: DiscoveryCounterProps) {
  // Count only MAIN (non-hidden) districts for the standard numerator.
  // We don't know which keys are hidden here, so the parent passes
  // `hiddenFound` separately and we infer the main count by subtracting.
  const discoveredMain = discoveredKeys.size - (hiddenFound ? 1 : 0)
  const allMainFound = discoveredMain >= mainTotal

  // Once both the hidden one AND all main districts are found, render the
  // "all found" celebration variant.
  const allFound = hiddenFound && allMainFound && hasHidden

  // While hidden is found but main is incomplete, show the bonus 9-denominator
  // already so the user can see they got the easter egg.
  const showNine = hiddenFound

  const numerator = showNine ? discoveredMain + 1 : discoveredMain
  const denominator = showNine ? mainTotal + 1 : mainTotal

  // C6 — egg-collector badge. Shows below the main counter once the
  // user has found all C6 easter eggs (Achilles, Konami, Founder Stone,
  // horn-fireworks, time-cycle). Independent from the district counter
  // morph so the two can light up separately.
  const allEggsFound = eggsTotal > 0 && eggsFound >= eggsTotal

  const baseClasses =
    'rounded-full border backdrop-blur-md px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] font-bold transition-colors duration-500'
  const styleClasses = allFound
    ? 'border-[#FFCC4D]/60 bg-black/65 text-[#FFCC4D] shadow-[0_4px_30px_rgba(255,204,77,0.35)]'
    : hiddenFound
      ? 'border-[#FFCC4D]/40 bg-black/55 text-white'
      : 'border-white/30 bg-black/55 text-white'

  // Screen-reader text — full sentence with the count, replacing the slash
  // glyph with the word "of" so VoiceOver / NVDA narrate it cleanly. The
  // visible pill stays compact for sighted users; assistive tech reads the
  // verbose copy via `<span className="sr-only">`.
  const srLabel = allFound
    ? `All ${denominator} districts discovered, including the hidden MINDsense Sanctuary.`
    : `${numerator} of ${denominator} districts discovered.`

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 sm:top-5 z-20 pointer-events-none flex flex-col items-center gap-1.5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`${baseClasses} ${styleClasses}`}>
        <span aria-hidden="true">
          {allFound && '✨ '}
          {numerator} / {denominator} discovered
          {allFound && ' ✨'}
        </span>
        <span className="sr-only">{srLabel}</span>
      </div>
      {allEggsFound && (
        <div className="rounded-full border border-[#F43F3F]/60 bg-black/65 backdrop-blur-md px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-bold text-[#FAF1E0] shadow-[0_4px_20px_rgba(244,63,63,0.4)]">
          <span aria-hidden="true">✨ all eggs found ✨</span>
          <span className="sr-only">All easter eggs found.</span>
        </div>
      )}
    </div>
  )
}
