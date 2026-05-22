import * as THREE from 'three'
import type { District } from '../districts/types'

/**
 * Pulsing inward-flow lights along each highway.
 *
 * Each radial road gets 6 emissive brand-red dots that travel from the
 * district end toward the plaza center on a 2.4-second loop. Reads as
 * "everything flows toward MIND" — pairs with the ThoughtStream
 * particles converging at the tower top to make the inward-pull
 * metaphor explicit on the ground as well as in the air.
 *
 * Performance: 6 dots × 9 districts = 54 small instanced-mesh entries.
 * Single shared geometry + material with per-instance position + opacity
 * updated each frame. Bloom in PostFX catches the emissive peak.
 */

const PULSES_PER_ROAD = 6
const PULSE_CYCLE_SEC = 2.4
const PULSE_RADIUS = 0.32

export interface RoadPulsesHandle {
  group: THREE.Group
  update: (time: number) => void
  dispose: () => void
}

interface RoadLane {
  angle: number      // direction from origin to monument (radians)
  inner: number      // distance from origin where the road starts (plaza edge)
  outer: number      // distance where the road ends (monument plinth)
}

export function createRoadPulses(districts: ReadonlyArray<District>): RoadPulsesHandle {
  const group = new THREE.Group()

  // Reuse a single sphere geometry + emissive material for every pulse.
  const sphereGeo = new THREE.SphereGeometry(PULSE_RADIUS, 8, 6)
  const pulseMat = new THREE.MeshStandardMaterial({
    color: 0xF43F3F,
    emissive: 0xFF5A5A,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.9,
  })

  // Build one lane definition + the 6 pulse meshes per district.
  const lanes: RoadLane[] = []
  const pulses: { mesh: THREE.Mesh; lane: number; phase: number }[] = []

  for (const d of districts) {
    if (d.hidden) continue // hidden Sanctuary doesn't get a highway
    const dx = d.position[0]
    const dz = d.position[1]
    const dist = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const inner = 14    // plaza ring edge
    const outer = dist - 4 // stop before monument plinth
    const laneIdx = lanes.length
    lanes.push({ angle, inner, outer })

    for (let i = 0; i < PULSES_PER_ROAD; i++) {
      // Materials are shared — clone the SCENE GRAPH mesh, the material
      // and geometry stay shared. Cheap.
      const mesh = new THREE.Mesh(sphereGeo, pulseMat)
      group.add(mesh)
      pulses.push({
        mesh,
        lane: laneIdx,
        phase: i / PULSES_PER_ROAD, // stagger by 1/N cycle
      })
    }
  }

  const update = (time: number) => {
    const cycle = (time / PULSE_CYCLE_SEC) % 1
    for (const p of pulses) {
      const lane = lanes[p.lane]
      // t goes 1 → 0 across the cycle so the pulse travels FROM outer
      // (monument) TO inner (plaza). Wrapping mod-1 keeps it continuous.
      const t = 1 - ((cycle + p.phase) % 1)
      const dist = lane.inner + t * (lane.outer - lane.inner)
      p.mesh.position.set(
        Math.sin(lane.angle) * dist,
        0.4,
        Math.cos(lane.angle) * dist,
      )
      // Fade in/out at the ends so pulses appear/disappear smoothly.
      // Bright in the middle of the travel, soft at the boundaries.
      const fadeIn = Math.min(1, t * 6)
      const fadeOut = Math.min(1, (1 - t) * 4)
      const opacity = Math.min(fadeIn, fadeOut) * 0.9
      // Material is shared — we want per-pulse opacity, which means we
      // need a small per-mesh scale instead (cheap visual proxy that
      // doesn't require unique materials).
      const s = 0.4 + opacity * 0.8
      p.mesh.scale.setScalar(s)
    }
  }

  const dispose = () => {
    sphereGeo.dispose()
    pulseMat.dispose()
  }

  return { group, update, dispose }
}
