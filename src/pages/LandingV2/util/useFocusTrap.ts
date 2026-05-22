import { useEffect, useRef, type RefObject } from 'react'

/**
 * Focus-trap hook for modal-style overlays in LandingV2 (Wave-4 / D5).
 *
 * When `active` is true and the user is tabbing inside the referenced
 * container, focus wraps from the last focusable element back to the first
 * (and Shift+Tab wraps from the first back to the last). This keeps
 * keyboard-only users from accidentally tabbing into the 3D canvas (which
 * sits behind the overlay and has no accessible content) or into other
 * background controls that are visually obscured by the overlay.
 *
 * Behavior contract:
 *  - Pure additive — DOM focus stays where the browser put it unless the
 *    user actually presses Tab outside the boundary.
 *  - On mount (when `active` flips true): focus moves to the first
 *    focusable element inside the container if no descendant of the
 *    container currently holds focus. This is the WAI-ARIA dialog pattern.
 *  - On unmount (or when `active` flips false): focus is restored to the
 *    element that was focused immediately before the trap activated.
 *  - Re-queries focusable elements every Tab press because overlays in
 *    this scene mount + dismount sub-elements (skin picker chips, error
 *    regions) during their lifetime; a snapshotted list would go stale.
 *  - Disabled / hidden elements are excluded via the canonical selector.
 *
 * Not handled here (out of scope):
 *  - Escape-to-dismiss — owner components handle their own dismiss UX.
 *  - Inert background — modern browsers support `inert` but it's not yet
 *    universally available; the trap is sufficient on its own for the
 *    keyboard-navigation requirement.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
].join(',')

export interface UseFocusTrapOptions {
  /** When false, the hook is a no-op (no listeners, no focus changes). */
  active: boolean
  /**
   * The container whose descendants are eligible for focus. Accepts the
   * standard React-19 `RefObject<HTMLElement | null>` shape that
   * `useRef<HTMLDivElement>(null)` produces — the hook handles the nullable
   * case internally so callers don't need to narrow.
   */
  containerRef: RefObject<HTMLElement | null>
  /**
   * When true, the hook moves focus into the container on activation.
   * Defaults to true — matches the WAI-ARIA dialog pattern.
   */
  autoFocus?: boolean
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  // Filter visibility — `offsetParent === null` is a quick check for
  // `display: none` (the common case). We don't go further because
  // overlays in LandingV2 are always on-screen when mounted.
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter((el) => el.offsetParent !== null || el === document.activeElement)
}

export function useFocusTrap({ active, containerRef, autoFocus = true }: UseFocusTrapOptions): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    if (autoFocus) {
      const focusables = getFocusable(container)
      // Move focus into the container only if it isn't already inside —
      // this prevents stealing focus from a child element that already
      // claimed it (e.g. the email-nudge auto-focused input).
      const alreadyInside = container.contains(document.activeElement)
      if (!alreadyInside && focusables.length > 0) {
        focusables[0].focus()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusables = getFocusable(container)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        // Shift+Tab from the first element → wrap to the last.
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab from the last element → wrap to the first.
        if (activeEl === last || !container.contains(activeEl)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)

    const previouslyFocused = previouslyFocusedRef.current
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore focus to whatever held it before the trap activated.
      // Defensive: the element may have unmounted (e.g. a button inside
      // a parent overlay) — in that case we silently skip.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus({ preventScroll: true })
        } catch {
          // Some elements throw on focus() in older browsers — ignore.
        }
      }
    }
  }, [active, containerRef, autoFocus])
}
