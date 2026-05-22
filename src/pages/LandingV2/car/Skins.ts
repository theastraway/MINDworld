import * as THREE from 'three'
import type { CarBuild } from './Car'

// Car skin system.
//
// A `CarSkin` is a flat record of brand colors that map onto the discrete
// parts of the car geometry built in `Car.ts`. Skins are aesthetic-only —
// they do not change geometry, physics, lights, or particle systems.
//
// Skin colors are deliberately stylized rather than literal client brand
// assets. The "atlas" livery is suggestive of a nautical / claims-bureau
// palette (cream + navy + gold) without using real Atlas Insurance logos
// or wordmarks. Future Atlas-specific work may swap to real brand later.

export type CarSkinKey = 'default' | 'founder' | 'atlas' | 'mindsense'

export type CarSkin = {
  key: CarSkinKey
  label: string
  /** Hex color for the lower red hull (`hull` mesh). */
  hull: number
  /** Hex color for the upper hull (`upper` mesh). */
  upper: number
  /** Hex color for the cabin / glass (`cab` mesh). */
  cab: number
  /** Hex color for the roof stripe. */
  stripe: number
  /** Hex color for the spoiler + side spoiler supports. */
  spoiler: number
  /** Hex color for the wheel hub centerpiece. */
  hub: number
}

export const SKINS: Record<CarSkinKey, CarSkin> = {
  default:   { key: 'default',   label: 'MIND Default',     hull: 0xF43F3F, upper: 0xd8362c, cab: 0x101012, stripe: 0xffffff, spoiler: 0x101012, hub: 0xeeeeee },
  founder:   { key: 'founder',   label: 'Founder Edition',  hull: 0x101012, upper: 0x0a0a0a, cab: 0x1a1a1a, stripe: 0xFFCC4D, spoiler: 0xFFCC4D, hub: 0xFFCC4D },
  atlas:     { key: 'atlas',     label: 'Atlas Livery',     hull: 0xf5f5f7, upper: 0xe8e8ea, cab: 0x0a2540, stripe: 0x0a2540, spoiler: 0x0a2540, hub: 0xc8a86b },
  mindsense: { key: 'mindsense', label: 'MINDsense',        hull: 0xC78CFF, upper: 0xA078E8, cab: 0x2a1f25, stripe: 0xF43F3F, spoiler: 0x77E8A0, hub: 0xFFCC4D },
}

/**
 * Hint shown next to a locked skin in the picker UI. None for `default`
 * because it is always unlocked.
 */
export const SKIN_UNLOCK_HINTS: Record<CarSkinKey, string> = {
  default:   '',
  founder:   'Complete all 8 districts',
  atlas:     'Enter the Konami code',
  mindsense: 'Find the hidden Sanctuary',
}

// ── Persistence ────────────────────────────────────────────────────────
//
// All storage paths are wrapped in try/catch — Safari private mode,
// disabled storage, and quota errors must NOT crash the world.

const LS_UNLOCKED = 'mind-world-skins-unlocked'
const LS_CURRENT = 'mind-world-skin-current'

const DEFAULT_UNLOCKED: CarSkinKey[] = ['default']

function safeRead(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Storage unavailable — ignore. Session-only persistence is acceptable.
  }
}

function isCarSkinKey(v: unknown): v is CarSkinKey {
  return typeof v === 'string' && (v === 'default' || v === 'founder' || v === 'atlas' || v === 'mindsense')
}

/** Read the set of unlocked skins from localStorage. Falls back to `['default']`. */
export function getUnlockedSkins(): CarSkinKey[] {
  const raw = safeRead(LS_UNLOCKED)
  if (!raw) return [...DEFAULT_UNLOCKED]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_UNLOCKED]
    const keys = parsed.filter(isCarSkinKey)
    if (!keys.includes('default')) keys.push('default')
    return keys
  } catch {
    return [...DEFAULT_UNLOCKED]
  }
}

/**
 * Mark a skin as unlocked. Persists to localStorage and fires a
 * `mindworld:skin-unlocked` CustomEvent on `window` so React UIs can
 * react in real time. No-op if already unlocked.
 */
export function unlockSkin(key: CarSkinKey): void {
  const current = getUnlockedSkins()
  if (current.includes(key)) return
  const next = [...current, key]
  safeWrite(LS_UNLOCKED, JSON.stringify(next))
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mindworld:skin-unlocked', { detail: { key } }))
    }
  } catch {
    // dispatchEvent shouldn't fail; swallow defensively.
  }
}

/** Returns true if the skin is currently unlocked. */
export function isSkinUnlocked(key: CarSkinKey): boolean {
  return getUnlockedSkins().includes(key)
}

/** Read the currently-selected skin. Falls back to `'default'`. */
export function getCurrentSkin(): CarSkinKey {
  const raw = safeRead(LS_CURRENT)
  if (raw && isCarSkinKey(raw) && isSkinUnlocked(raw)) return raw
  return 'default'
}

/** Persist the currently-selected skin. No-op if the skin is locked. */
export function setCurrentSkin(key: CarSkinKey): void {
  if (!isSkinUnlocked(key)) return
  safeWrite(LS_CURRENT, key)
}

// ── Apply ──────────────────────────────────────────────────────────────

/**
 * Recolor a built car in place to match the given skin. Updates each
 * mesh material color directly — no geometry/material re-creation. The
 * roof stripe (`MeshBasicMaterial`) and the spoiler supports (cloned in
 * `buildCar`) are reached via their parent group traversal so we don't
 * need to widen the `CarBuild` interface.
 */
export function applySkin(carHandle: CarBuild, skin: CarSkin): void {
  const { group, hull, upper, cab } = carHandle

  // Direct handles — these we already have.
  ;(hull.material as THREE.MeshStandardMaterial).color.setHex(skin.hull)
  ;(upper.material as THREE.MeshStandardMaterial).color.setHex(skin.upper)
  ;(cab.material as THREE.MeshStandardMaterial).color.setHex(skin.cab)

  // Walk the rest of the car group to find stripe, spoiler, spoiler supports,
  // and wheel hubs. Identify each by geometry parameters since the parts
  // were constructed inline in buildCar and we don't want to widen the
  // CarBuild interface (avoid blast radius outside the car package).
  group.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }
      const p = geo.parameters ?? {}
      // Roof stripe: thin long flat box (0.35 × 0.05 × 3.6) with MeshBasicMaterial
      if (p.width === 0.35 && p.height === 0.05 && p.depth === 3.6) {
        ;(child.material as THREE.MeshBasicMaterial).color.setHex(skin.stripe)
        return
      }
      // Main spoiler: 2.1 × 0.1 × 0.4
      if (p.width === 2.1 && p.height === 0.1 && p.depth === 0.4) {
        ;(child.material as THREE.MeshStandardMaterial).color.setHex(skin.spoiler)
        return
      }
      // Spoiler supports (two clones): 0.12 × 0.5 × 0.25
      if (p.width === 0.12 && p.height === 0.5 && p.depth === 0.25) {
        ;(child.material as THREE.MeshStandardMaterial).color.setHex(skin.spoiler)
        return
      }
    }
    // Wheel groups: each `wg` contains [tire mesh, hub mesh]. The hub is the
    // smaller cylinder (radiusTop/Bottom 0.18, length 0.45).
    if (child instanceof THREE.Group) {
      child.children.forEach((sub) => {
        if (sub instanceof THREE.Mesh) {
          const sp = (sub.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }).parameters ?? {}
          if (sp.radiusTop === 0.18 && sp.radiusBottom === 0.18 && sp.height === 0.45) {
            ;(sub.material as THREE.MeshStandardMaterial).color.setHex(skin.hub)
          }
        }
      })
    }
  })
}
