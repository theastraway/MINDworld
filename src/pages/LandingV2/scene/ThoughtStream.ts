import * as THREE from 'three'
import type { District } from '../districts/types'

/**
 * Thought-stream particles flowing from each district into the MIND Tower.
 *
 * Visual metaphor: every capability (Memory, Graph, Models, Agents, Studio,
 * Life, API, Patents, Sanctuary) continuously feeds the central memory
 * column. Particles spawn at each district's monument, arc up + over on a
 * Bezier-like path, and dissolve into the tower at altitude ~50.
 *
 * Each particle inherits its source district's color so the converging
 * streams visibly carry the brand palette home. PostFX bloom catches the
 * additive blending → glowing comet trail.
 *
 * Performance: single THREE.Points buffer, additive blend, no per-frame
 * geometry allocation. Capacity 240, average ~3 in-flight per district.
 */

const CAPACITY = 240
const SPAWN_INTERVAL_SEC = 0.7   // average per-district spawn cadence
const TRAVEL_DURATION_SEC = 4.0  // time from district to tower
const ARC_PEAK_HEIGHT = 28       // peak height of the parabolic arc
const TOWER_TOP_Y = 72           // dissolve target altitude
const PARTICLE_SIZE = 1.2

export interface ThoughtStreamHandle {
  points: THREE.Points
  update: (dt: number, time: number) => void
  dispose: () => void
}

interface Particle {
  origin: THREE.Vector3
  color: THREE.Color
  elapsed: number      // 0 → TRAVEL_DURATION_SEC
  life: number         // total lifetime allotted (so the arc speed varies)
  active: boolean
}

export function createThoughtStream(districts: ReadonlyArray<District>): ThoughtStreamHandle {
  const positions = new Float32Array(CAPACITY * 3)
  const colors = new Float32Array(CAPACITY * 3)
  for (let i = 0; i < CAPACITY; i++) {
    positions[i * 3 + 1] = -1000 // park off-screen
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: PARTICLE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    fog: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  // Particle pool — preallocated so per-frame allocation is zero.
  const pool: Particle[] = []
  for (let i = 0; i < CAPACITY; i++) {
    pool.push({
      origin: new THREE.Vector3(),
      color: new THREE.Color(),
      elapsed: 0,
      life: TRAVEL_DURATION_SEC,
      active: false,
    })
  }

  // Per-district spawn timer. Stagger initial timers so streams don't
  // all pulse in lockstep — gives a natural drift.
  const spawnTimers = districts.map(() => Math.random() * SPAWN_INTERVAL_SEC)

  // Find a free pool slot — linear scan, cheap at CAPACITY=240.
  let nextSlot = 0
  function acquire(): Particle | null {
    for (let i = 0; i < CAPACITY; i++) {
      const idx = (nextSlot + i) % CAPACITY
      if (!pool[idx].active) {
        nextSlot = (idx + 1) % CAPACITY
        return pool[idx]
      }
    }
    return null
  }

  const tmpColor = new THREE.Color()
  const towerTip = new THREE.Vector3(0, TOWER_TOP_Y, 0)

  const update = (dt: number, _time: number) => {
    // Spawn pass — each district drips one particle per SPAWN_INTERVAL_SEC.
    for (let d = 0; d < districts.length; d++) {
      spawnTimers[d] -= dt
      if (spawnTimers[d] > 0) continue
      spawnTimers[d] = SPAWN_INTERVAL_SEC * (0.7 + Math.random() * 0.6)
      const district = districts[d]
      const p = acquire()
      if (!p) continue
      p.origin.set(district.position[0], 4, district.position[1])
      // Small lateral jitter so sequential thoughts aren't perfectly stacked.
      p.origin.x += (Math.random() - 0.5) * 1.5
      p.origin.z += (Math.random() - 0.5) * 1.5
      p.color.setHex(district.color)
      p.elapsed = 0
      p.life = TRAVEL_DURATION_SEC * (0.85 + Math.random() * 0.3)
      p.active = true
    }

    // Advance pass — parabolic arc from origin → towerTip with a peak
    // bump. Writes position + color buffers; one needsUpdate per frame.
    for (let i = 0; i < CAPACITY; i++) {
      const part = pool[i]
      if (!part.active) continue
      part.elapsed += dt
      const t = part.elapsed / part.life
      if (t >= 1) {
        // Park off-screen + free.
        positions[i * 3 + 1] = -1000
        part.active = false
        continue
      }
      // Lerp origin → towerTip with an upward arc displacement.
      const x = part.origin.x + (towerTip.x - part.origin.x) * t
      const z = part.origin.z + (towerTip.z - part.origin.z) * t
      // Parabolic y: starts at origin.y, peaks ARC_PEAK_HEIGHT above the
      // midpoint, ends at towerTip.y.
      const baseY = part.origin.y + (towerTip.y - part.origin.y) * t
      const arcLift = ARC_PEAK_HEIGHT * Math.sin(t * Math.PI)
      positions[i * 3 + 0] = x
      positions[i * 3 + 1] = baseY + arcLift
      positions[i * 3 + 2] = z

      // Color: fades to white as it nears the tower (signal converging
      // into the memory layer). tmpColor.lerpColors writes RGB.
      tmpColor.copy(part.color).lerp(WHITE_FLUSH, t)
      colors[i * 3 + 0] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, update, dispose }
}

const WHITE_FLUSH = new THREE.Color(0xfff6e0)
