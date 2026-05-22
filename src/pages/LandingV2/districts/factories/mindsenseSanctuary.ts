/**
 * MINDsense Sanctuary — HIDDEN District 9 (far north, [0, -105]).
 *
 * Per MIND_WORLD_VISION § 3 D9 + § 13 Easter Egg #1: pulsing crystal that
 * shifts color (calm blue → intense red) with simulated valence/arousal.
 * Fog-occluded by default. Only becomes visually clear when the car drives
 * within ~12 units; at that point the wireframe veil dissolves, the
 * crystal's emissive intensity blooms, and the toast surfaces the
 * MINDsense skin unlock.
 *
 * Wave 4 / D4 polish layer:
 *   - Localised wireframe-sphere "veil" at radius 30, opacity proximity-
 *     faded by SceneRoot (1.0 at carDistance > 75 → 0 at carDistance < 25).
 *     SceneRoot also drives a ±0.1 sine pulse at 0.3 Hz on top of that
 *     baseline so the veil reads as alive from a distance.
 *   - "Calling" point light directly above the Sanctuary, oscillating
 *     between calm blue (#4060a0) and intense red (#F43F3F) at 0.18 Hz —
 *     visible across the far-north quadrant. Distance 40u so it doesn't
 *     pollute the main world's lighting budget.
 *   - Crystal emissive intensity is exposed so SceneRoot can bloom it
 *     from 0.5 → 1.2 over 2s once the player discovers the Sanctuary
 *     (one-shot reveal animation).
 *
 * All of these references are attached to `group.userData` under the
 * dedicated `sanctuary` namespace so SceneRoot can find them by reference
 * rather than by traversal heuristics. The factory does NOT animate them
 * itself — animation lives in the central per-frame loop so the reveal
 * stays in sync with the car's position.
 *
 * Mesh budget: 1 core crystal + 4 orbital shards + 1 base disc + 1 hidden
 * label + 1 veil wireframe + 1 pulse light = ~9 meshes/lights.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, stdMat } from './_shared'

/** SceneRoot reads this off `group.userData.sanctuary` to drive the reveal. */
export interface SanctuaryRefs {
  /** Wireframe sphere veil at radius 30, fades with proximity. */
  veil: THREE.Mesh
  /** Material on the veil — opacity is the property SceneRoot mutates. */
  veilMaterial: THREE.MeshBasicMaterial
  /** Calling point light directly above the Sanctuary (color cycles). */
  pulseLight: THREE.PointLight
  /** Core crystal mesh — emissive intensity is bloomed on discovery. */
  crystal: THREE.Mesh
  /** Crystal material — SceneRoot reads/writes `emissiveIntensity` here. */
  crystalMaterial: THREE.MeshStandardMaterial
  /** True once the discovery has been triggered (idempotent guard). */
  discovered: { value: boolean }
  /** Discovery time in seconds (clock.getElapsedTime()) — used to drive the bloom curve. */
  discoveredAt: { value: number }
}

const SANCTUARY_VEIL_RADIUS = 30
const SANCTUARY_VEIL_COLOR = 0x4060a0
const SANCTUARY_CRYSTAL_RESTING_EMISSIVE = 0.5
const SANCTUARY_CALM_BLUE = 0x4060a0
// Note: the calm→intense red colour cycle on the calling pulse light is
// driven by SceneRoot (per-frame Color.lerp). The hex constant for the
// intense red lives there to avoid duplicating brand colour state across
// modules.

export function buildMindsenseSanctuary(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Base disc: dark stone, low-poly ──────────────────────────────────
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.4, 0.4, 12),
    stdMat(0x1a1a26, { roughness: 0.9, metalness: 0.0 })
  )
  base.position.y = 0.2
  base.receiveShadow = true
  sculpt.add(base)

  // ── Core pulsing crystal: large octahedron, emissive ────────────────
  // Resting emissive intensity is 0.5; SceneRoot blooms it to 1.2 over 2s
  // the moment the car triggers discovery (proximity < 12u). The material
  // reference is exposed via SanctuaryRefs so the bloom curve can be
  // driven without per-factory animation state.
  const crystalMat = new THREE.MeshStandardMaterial({
    color: d.color,
    emissive: d.color,
    emissiveIntensity: SANCTUARY_CRYSTAL_RESTING_EMISSIVE,
    roughness: 0.2,
    metalness: 0.5,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  })
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), crystalMat)
  crystal.position.y = 2.6
  crystal.castShadow = true
  crystal.userData = { mindsenseCore: true }
  sculpt.add(crystal)

  // ── 4 orbital shards drifting around the core ───────────────────────
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({
        color: d.color,
        emissive: d.color,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.3,
        flatShading: true,
        transparent: true,
        opacity: 0.85,
      })
    )
    shard.position.set(Math.cos(angle) * 2.2, 2.6 + Math.sin(angle * 2) * 0.4, Math.sin(angle) * 2.2)
    sculpt.add(shard)
  }

  // ── Soft ambient point light to make it glow even in dusk fog ───────
  // This is the close-range lamp — short reach (14u), constant tint.
  const sanctuaryLight = new THREE.PointLight(d.color, 2.4, 14)
  sanctuaryLight.position.set(0, 3.2, 0)
  sculpt.add(sanctuaryLight)

  // ── Wireframe veil — the "fog-volume" cue at radius 30 ──────────────
  // A large wireframe sphere centred on the Sanctuary. Visible from up to
  // ~60u away (well outside the main world's 240×240 visible band, since
  // the Sanctuary sits at z=-105). SceneRoot drives opacity by car
  // distance + a subtle 0.3 Hz pulse so the veil reads as alive without
  // arrows or pop-ups. On discovery it fades to 0 over ~1.2s and stays
  // hidden for the remainder of the session.
  //
  // Built at the GROUP level (not under `sculpt`) so SceneRoot's bob/spin
  // animation does NOT shake the veil — it should hang in space.
  const veilGeo = new THREE.SphereGeometry(SANCTUARY_VEIL_RADIUS, 24, 16)
  const veilMat = new THREE.MeshBasicMaterial({
    color: SANCTUARY_VEIL_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  })
  const veil = new THREE.Mesh(veilGeo, veilMat)
  // Position the veil so its center sits at the Sanctuary's world position
  // but lifted slightly to wrap the crystal vertically. The group itself
  // already lives at [d.position[0], 0, d.position[1]] thanks to
  // createDistrictShell — so a local offset of +6 on Y places the centre
  // of the 30u sphere above ground.
  veil.position.y = 6
  // Veil does NOT cast/receive shadows — pure visual cue.
  veil.castShadow = false
  veil.receiveShadow = false
  group.add(veil)

  // ── Calling point light — the "follow me" colour pulse ──────────────
  // Tall (y=22), 40u reach, colour cycles between calm blue and intense
  // red at 0.18 Hz driven by SceneRoot. Intensity scales the same way the
  // SceneRoot summit-FX scale plaza beam intensity so its glow can be
  // seen from across the far-north quadrant but doesn't blow out the
  // crystal up close.
  const pulseLight = new THREE.PointLight(SANCTUARY_CALM_BLUE, 1.8, 40)
  pulseLight.position.y = 22
  group.add(pulseLight)

  // ── Stash refs so SceneRoot can drive the reveal animation ───────────
  // The existing `userData` keys (`monument`, `sculpt`, `labelDot`) stay
  // so the main animation loop can bob the sculpt + label. Sanctuary refs
  // sit under a dedicated namespace so they're easy to discover by key.
  const refs: SanctuaryRefs = {
    veil,
    veilMaterial: veilMat,
    pulseLight,
    crystal,
    crystalMaterial: crystalMat,
    discovered: { value: false },
    discoveredAt: { value: 0 },
  }
  group.userData = {
    monument: d,
    sculpt,
    labelDot,
    sanctuary: refs,
  }
  return group
}

/**
 * Builds the 4 "beacon trail" point lights between the world centre and
 * the Sanctuary. Each is a small dim brand-blue point light at altitude
 * 6 every 30 units (radii 30, 60, 90 units north of origin). Subtle by
 * design — should look like ambient world-lighting from a distance, not
 * a flashing arrow.
 *
 * Returned as a single THREE.Group so SceneRoot can scene.add() it once.
 * The lights are static — no per-frame animation needed (they pulse on
 * their own visually because the camera moves).
 */
export function buildSanctuaryBeaconTrail(): THREE.Group {
  const trail = new THREE.Group()
  trail.name = 'sanctuary-beacon-trail'

  // Place lights at z = -30, -60, -90, -100 — staggered approach so the
  // closest one (z=-100) sits just before the Sanctuary's [0,-105] anchor.
  const stops: number[] = [-30, -60, -90, -100]
  for (const z of stops) {
    const light = new THREE.PointLight(SANCTUARY_VEIL_COLOR, 0.3, 8)
    light.position.set(0, 6, z)
    trail.add(light)
  }
  return trail
}
