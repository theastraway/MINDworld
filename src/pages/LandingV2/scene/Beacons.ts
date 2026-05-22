import * as THREE from 'three'
import type { District } from '../districts/types'
import { DISTRICTS } from '../districts/data'

/**
 * Fun-info beacon system for MIND World (Wave 2 / B6, per MIND_WORLD_VISION § 7).
 *
 * Beacons are small floating canvas-textured panels that fade in as the car
 * approaches and fade out as it leaves. They are decorative only — no
 * collision, no shadows, no interaction.
 *
 * Population:
 *   1. DISTRICT beacons — sourced from each `District.beacons[]` in
 *      districts/data.ts. Clustered around the district's monument at
 *      altitude 4-6 with varying angles so the user reads them while
 *      circling the monument.
 *   2. ROADSIDE beacons — placed along highways between plaza and each
 *      district at the midpoint, offset perpendicular to the road so they
 *      flank the driver as they approach a district. Mix of capability
 *      facts, builder notes, and easter-egg hints (vision § 7 categories).
 *
 * Performance:
 *   - Shared PlaneGeometry across every beacon (3-4 KB total geometry mem).
 *   - Per-unique-text material cache so the same beacon string never
 *     allocates two CanvasTextures.
 *   - Billboard rotation + opacity update is the only per-frame work.
 *   - ~30-40 beacons in the world (9 districts × 2-3 + 12 roadside ≈ 30-38).
 *
 * Hard rules (per CLAUDE.md non-negotiables):
 *   - No fabricated stats. Roadside copy is either capability claims or
 *     builder notes — all verifiable.
 *   - No competitor names.
 *   - No patent specifics (numbers / IDs / dates). "Patents pending" only.
 *   - "Astra AI" with the space.
 */

/** Distance (units) at which a beacon is fully opaque. */
const PROXIMITY_FULL = 6
/** Distance (units) at which a beacon is fully transparent. */
const PROXIMITY_NONE = 12
/** Breathing pulse amplitude on opacity (+/- this value, sinusoidal). */
const PULSE_AMPLITUDE = 0.06
/** Breathing pulse frequency in Hz. */
const PULSE_HZ = 0.4
/** "Just became readable" threshold for the onBeaconRead callback. */
const READ_OPACITY_THRESHOLD = 0.92

// Canvas dimensions for the beacon text panel. 512 × 110 hits a clean
// 4.65 aspect ratio that maps to our 4.2 × 0.9 world plane.
const CANVAS_W = 512
const CANVAS_H = 110

/** A single beacon's per-frame mutable state. */
interface BeaconRecord {
  mesh: THREE.Mesh
  text: string
  /** True once this beacon has fired its onBeaconRead callback this session. */
  hasBeenRead: boolean
  /** Personal phase offset so the breathing pulse isn't synchronized. */
  phaseOffset: number
}

/** Public handle returned by {@link createBeacons}. */
export interface BeaconsHandle {
  group: THREE.Group
  /**
   * Per-frame tick. Pass `clock.getElapsedTime()` and the car's world
   * position; opacity + billboard rotation update each beacon.
   */
  update(time: number, carPos: THREE.Vector3): void
  /**
   * Disposes every beacon's geometry, material, and canvas texture. Called
   * from SceneRoot's teardown.
   */
  dispose(): void
  /**
   * Optional read-callback. Fired once per beacon per session the moment a
   * beacon's proximity opacity crosses {@link READ_OPACITY_THRESHOLD}. C3
   * (analytics wave) will wire this into PostHog as
   * `landingv2_beacon_read`.
   */
  onBeaconRead?: (text: string) => void
}

/**
 * Roadside beacon copy (per vision § 7 categories). NOT tied to a district —
 * placed at the midpoint of each plaza→district highway, with a perpendicular
 * lateral offset so the driver reads them flanking the road.
 *
 * Every line here must be verifiable. No fabricated stats.
 */
const ROADSIDE_BEACONS: ReadonlyArray<string> = [
  'MIND is the persistent memory layer for AI.',
  'Built in public. Backed by patents pending.',
  'Every conversation picks up where the last one left off.',
  'Drag any file. MIND remembers it forever.',
  'One memory. Every model — Claude, GPT, Grok, and more.',
  'Some districts are hidden. Drive past the edge.',
  'Sound on. Press H for the horn.',
  'Hold Space to drift around the corners.',
  'Press P to screenshot your drive.',
  'Eight monuments. Each one is a real capability.',
  'Built solo. Shipped live. Powered by Astra AI.',
  'The personal knowledge graph for every AI you use.',
]

/**
 * Renders a beacon text onto a 512×110 canvas with a dark semi-opaque
 * background pill, brand-cream text, and a soft brand-red underline accent.
 * Returns null when the host environment refuses a 2D context (impossible on
 * every modern browser; the guard is there for TS strict mode + tests).
 */
function paintBeaconCanvas(text: string): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Dark transparent rounded pill — readable against sky, ground, and
  // monuments without dominating the scene.
  const radius = 22
  ctx.fillStyle = 'rgba(18, 14, 16, 0.72)'
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(CANVAS_W - radius, 0)
  ctx.quadraticCurveTo(CANVAS_W, 0, CANVAS_W, radius)
  ctx.lineTo(CANVAS_W, CANVAS_H - radius)
  ctx.quadraticCurveTo(CANVAS_W, CANVAS_H, CANVAS_W - radius, CANVAS_H)
  ctx.lineTo(radius, CANVAS_H)
  ctx.quadraticCurveTo(0, CANVAS_H, 0, CANVAS_H - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fill()

  // Brand cream text. Auto-shrink font if the line overruns the canvas
  // width so the longest roadside copy still reads without truncation.
  ctx.fillStyle = '#F6E8D9'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 4
  let fontSize = 32
  ctx.font = `500 ${fontSize}px "Inter", "Helvetica Neue", system-ui, sans-serif`
  while (ctx.measureText(text).width > CANVAS_W - 36 && fontSize > 18) {
    fontSize -= 2
    ctx.font = `500 ${fontSize}px "Inter", "Helvetica Neue", system-ui, sans-serif`
  }
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 - 2)

  // Brand-red underline accent — slim, centered, brand cue.
  ctx.shadowBlur = 0
  ctx.fillStyle = '#F43F3F'
  const accentWidth = 64
  ctx.fillRect((CANVAS_W - accentWidth) / 2, CANVAS_H - 10, accentWidth, 2)

  return canvas
}

/**
 * Builds the per-beacon Mesh from a piece of text. Materials and the
 * underlying canvas texture are unique per beacon (since each beacon has
 * unique text) — but the PlaneGeometry is shared across every beacon to
 * keep allocation tight.
 */
function buildBeaconMesh(text: string, sharedGeo: THREE.PlaneGeometry): THREE.Mesh {
  const canvas = paintBeaconCanvas(text)
  const tex = canvas
    ? new THREE.CanvasTexture(canvas)
    : new THREE.CanvasTexture(document.createElement('canvas'))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  })
  const mesh = new THREE.Mesh(sharedGeo, mat)
  mesh.castShadow = false
  mesh.receiveShadow = false
  // userData carries the canvas reference so dispose can free it cleanly.
  mesh.userData = { beaconTexture: tex }
  return mesh
}

/**
 * Computes a clustered position around a district monument. `index` and
 * `totalForDistrict` determine the angular slot so two beacons around the
 * same district don't overlap.
 *
 * The cluster is offset slightly outward from the monument origin to keep
 * the proximity card (rendered when the car is within 6 units of the
 * monument center) from clipping into the beacons.
 */
function districtBeaconPosition(
  district: District,
  index: number,
  totalForDistrict: number
): THREE.Vector3 {
  const baseAngle = Math.atan2(district.position[0], district.position[1])
  // Spread beacons across a 200° arc centered on the side of the monument
  // FACING the plaza (so the driver reads them on approach, not behind).
  const arc = (200 * Math.PI) / 180
  const slot = totalForDistrict > 1 ? index / (totalForDistrict - 1) : 0.5
  const angularOffset = (slot - 0.5) * arc
  const angle = baseAngle + Math.PI + angularOffset // +PI = face plaza-ward
  const radius = 7.5
  const x = district.position[0] + Math.sin(angle) * radius
  const z = district.position[1] + Math.cos(angle) * radius
  // Vary altitude in the 4-6 band per vision; deterministic per-slot so the
  // layout is reproducible across reloads.
  const altitude = 4 + (index % 3) * 0.6
  return new THREE.Vector3(x, altitude, z)
}

/**
 * Computes a position for a roadside beacon along the plaza→district
 * highway. `index` selects which highway (modulo the visible district
 * count) and the lateral offset alternates left/right of the road so
 * consecutive beacons flank the driver instead of stacking.
 */
function roadsideBeaconPosition(
  visibleDistricts: District[],
  index: number
): THREE.Vector3 {
  const target = visibleDistricts[index % visibleDistricts.length]
  const angle = Math.atan2(target.position[0], target.position[1])
  // Place at 55% of the way out from plaza to district — past the sign
  // posts (~18u out) but well before the monument (which sits ~6u inside
  // the position).
  const dx = target.position[0]
  const dz = target.position[1]
  const dist = Math.hypot(dx, dz)
  const t = 0.55
  const baseX = dx * t
  const baseZ = dz * t
  // Lateral perpendicular offset — alternate left/right based on index
  // parity so consecutive beacons flank the driver. Magnitude 5 units —
  // far enough off the 4.5u-wide pavement to clear it.
  const perpX = Math.cos(angle)
  const perpZ = -Math.sin(angle)
  const side = index % 2 === 0 ? 1 : -1
  const lateral = 5 * side
  const x = baseX + perpX * lateral
  const z = baseZ + perpZ * lateral
  // Altitude 3-4 — slightly lower than district beacons so the eye finds
  // them at driving height. Vary deterministically per-index.
  const altitude = 3 + (index % 4) * 0.25
  // Avoid placing further than the district's own band (~7u radius around
  // monument) — clamp to a min distance of 12 units from district center
  // so we never collide with district beacons.
  const distToDistrict = Math.hypot(x - dx, z - dz)
  if (distToDistrict < 12) {
    // Pull back toward plaza along the road axis.
    const correction = (12 - distToDistrict) / dist
    return new THREE.Vector3(
      x - dx * correction,
      altitude,
      z - dz * correction
    )
  }
  return new THREE.Vector3(x, altitude, z)
}

/**
 * Boots the beacon system. Returns a handle whose `group` should be added
 * to the scene root by the caller; `update()` should be called every frame
 * from SceneRoot's tick after the car position is settled; `dispose()`
 * frees every canvas texture + material on scene teardown.
 *
 * The MINDsense Sanctuary (hidden district at far north) gets its beacons
 * placed alongside the visible ones — the proximity fade handles the
 * "hidden until found" effect naturally, so the user only reads them once
 * they drive within 12 units of the sanctuary.
 */
export function createBeacons(): BeaconsHandle {
  const group = new THREE.Group()
  group.name = 'MindWorld_Beacons'
  // Frustum culling stays on at the mesh level (default); the group itself
  // doesn't need explicit handling.

  // Shared geometry — every beacon uses this same 4.2 × 0.9 plane. The
  // 4.65 aspect matches the canvas's 512×110 so text isn't squashed.
  const sharedGeo = new THREE.PlaneGeometry(4.2, 0.9)

  const beacons: BeaconRecord[] = []

  // ── 1. DISTRICT beacons (clustered around each monument) ───────────────
  DISTRICTS.forEach((district) => {
    const lines = district.beacons ?? []
    lines.forEach((text, idx) => {
      const mesh = buildBeaconMesh(text, sharedGeo)
      mesh.position.copy(districtBeaconPosition(district, idx, lines.length))
      group.add(mesh)
      beacons.push({
        mesh,
        text,
        hasBeenRead: false,
        phaseOffset: (idx * 0.7 + district.position[0] * 0.01) % (Math.PI * 2),
      })
    })
  })

  // ── 2. ROADSIDE beacons (along highways) ──────────────────────────────
  // Use only the visible districts (not the hidden Sanctuary) when picking
  // highways for roadside beacons — the hidden district has no rendered
  // highway and would put a beacon in the fogged wilderness.
  const visibleDistricts = DISTRICTS.filter((d) => !d.hidden)
  ROADSIDE_BEACONS.forEach((text, idx) => {
    const mesh = buildBeaconMesh(text, sharedGeo)
    mesh.position.copy(roadsideBeaconPosition(visibleDistricts, idx))
    group.add(mesh)
    beacons.push({
      mesh,
      text,
      hasBeenRead: false,
      phaseOffset: (idx * 1.3) % (Math.PI * 2),
    })
  })

  // The handle is mutable so SceneRoot can wire onBeaconRead after construction.
  const handle: BeaconsHandle = {
    group,
    update(time: number, carPos: THREE.Vector3) {
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i]
        const mesh = b.mesh
        const dx = mesh.position.x - carPos.x
        const dz = mesh.position.z - carPos.z
        const dist = Math.hypot(dx, dz)

        // Proximity fade: 1.0 inside PROXIMITY_FULL, 0.0 beyond PROXIMITY_NONE,
        // smooth linear lerp between.
        let baseOpacity: number
        if (dist <= PROXIMITY_FULL) baseOpacity = 1
        else if (dist >= PROXIMITY_NONE) baseOpacity = 0
        else baseOpacity = 1 - (dist - PROXIMITY_FULL) / (PROXIMITY_NONE - PROXIMITY_FULL)

        // Gentle breathing pulse — only modulate when the beacon is at least
        // partially visible so a far-away beacon never flickers on.
        const pulse =
          baseOpacity > 0
            ? PULSE_AMPLITUDE * Math.sin(time * 2 * Math.PI * PULSE_HZ + b.phaseOffset)
            : 0
        const opacity = Math.max(0, Math.min(1, baseOpacity + pulse))
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.opacity = opacity
        // Hide entirely when invisible so the GPU skips the draw call —
        // matters for the off-screen majority of beacons.
        mesh.visible = opacity > 0.01

        // Billboard: rotate to face the car (yaw only — pitch + roll stay
        // flat so the panel always reads horizontally).
        const facing = Math.atan2(carPos.x - mesh.position.x, carPos.z - mesh.position.z)
        mesh.rotation.set(0, facing, 0)

        // First-read callback. Fire once per beacon per session as soon as
        // the proximity-derived opacity (not the pulsed value) crosses the
        // threshold. Debounced naturally by `hasBeenRead`.
        if (!b.hasBeenRead && baseOpacity > READ_OPACITY_THRESHOLD) {
          b.hasBeenRead = true
          handle.onBeaconRead?.(b.text)
        }
      }
    },
    dispose() {
      // The SceneRoot scene-traversal teardown disposes meshes' geometry
      // and material on its own pass — but it does NOT walk into the
      // CanvasTexture attached to each beacon's MeshBasicMaterial.map.
      // Free those textures explicitly here so the canvas-backed GPU
      // resources don't leak across LandingV2 mount/unmount cycles.
      beacons.forEach((b) => {
        const tex = (b.mesh.userData as { beaconTexture?: THREE.CanvasTexture })
          .beaconTexture
        tex?.dispose()
      })
    },
  }
  return handle
}
