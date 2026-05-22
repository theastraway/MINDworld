/**
 * Shared utilities for the 9 district factories.
 *
 * Every factory produces a THREE.Group whose root sits at the district's
 * world position (set by the dispatcher in buildMonument.ts) and stamps
 * `userData.{monument, sculpt, labelDot}` so the existing SceneRoot
 * animation loop can drive bob + rotation without per-factory wiring.
 *
 * Plinth + accent ring + floating label dot + overhead point light are the
 * common shell — every district gets one. Sculpt-specific geometry is
 * added to the `sculpt` group, which the loop rotates per frame.
 */

import * as THREE from 'three'
import type { District } from '../types'

export interface DistrictBuild {
  group: THREE.Group
  sculpt: THREE.Group
  labelDot: THREE.Mesh
}

/**
 * Returns a standard MeshStandardMaterial tuned to the low-poly + flat-shaded
 * aesthetic the rest of the scene uses. Always returns a fresh instance so
 * callers can mutate without affecting siblings.
 */
export function stdMat(
  color: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.25,
    flatShading: true,
    ...opts,
  })
}

/**
 * Builds the common district shell: positions the group at the district's
 * `[x, z]` world coords, drops a low cylinder plinth + brand accent ring +
 * a floating label dot 6.5 units up, and adds an overhead point light tinted
 * with the district color. Returns the empty `sculpt` group for callers to
 * populate with their district-specific geometry.
 *
 * Hidden districts (Sanctuary) skip the plinth + ring + light so they feel
 * less monumental and more apparition-like.
 */
export function createDistrictShell(d: District): DistrictBuild {
  const group = new THREE.Group()
  group.position.set(d.position[0], 0, d.position[1])

  const sculpt = new THREE.Group()
  sculpt.position.y = 0.5

  if (!d.hidden) {
    // Plinth (low cylinder base)
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.8, 0.5, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe8e8e8,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true,
      })
    )
    plinth.position.y = 0.25
    plinth.castShadow = true
    plinth.receiveShadow = true
    group.add(plinth)

    // Brand accent ring on plinth
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: d.color })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.5
    group.add(ring)

    // Overhead point light tinted with district color
    const light = new THREE.PointLight(d.color, 1.8, 18)
    light.position.set(0, 5, 0)
    group.add(light)
  }

  // Floating capsule label dot above sculpture
  const labelHeight = d.hidden ? 4.5 : 6.5
  const labelDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: d.color })
  )
  labelDot.position.y = labelHeight
  group.add(labelDot)

  group.add(sculpt)

  return { group, sculpt, labelDot }
}

/**
 * Renders text to a canvas and returns a THREE.Texture for use as a sprite
 * or plane texture. Used for the Models Boulevard tower labels (instead of
 * real provider logos — see § 3 trademark-safe rule).
 *
 * `bg` is optional and defaults to transparent. `fg` is the text color.
 * Width/height auto-scale to keep text legible at ~6 unit world distance.
 */
export function createTextLabelTexture(
  text: string,
  fg = '#ffffff',
  bg: string | null = null,
  fontPx = 96,
  width = 512,
  height = 256
): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // Fallback: return a 1x1 white texture so callers never crash. Better
    // an invisible label than a broken render.
    const tex = new THREE.Texture(canvas)
    tex.needsUpdate = true
    return tex
  }
  if (bg) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.clearRect(0, 0, width, height)
  }
  ctx.fillStyle = fg
  ctx.font = `900 ${fontPx}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * Returns a deterministic pseudo-random number in [0, 1) seeded by `(seed, i)`.
 * Used inside factories so layouts are stable across reloads — important so
 * screenshots stay diffable and live deploys don't dance.
 */
export function seeded(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280
  return x - Math.floor(x)
}
