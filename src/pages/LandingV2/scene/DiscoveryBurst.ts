import * as THREE from 'three'

/**
 * Confetti burst that fires the moment the player discovers a monument.
 *
 * 60 particles launch upward+outward from the discovered monument's
 * position, colored half brand-red and half the district's own color,
 * gravity-pulled back down over ~2.5 seconds. Additive blending →
 * bloom-caught firework feel.
 *
 * Externally triggered via burst(position, color). Persists between
 * triggers as a single Points buffer that can stage up to 240
 * simultaneous particles (4 overlapping discoveries before recycling
 * the oldest — never actually happens in the wild but cheap insurance).
 */

const CAPACITY = 240
const PARTICLES_PER_BURST = 60
const PARTICLE_LIFETIME = 2.5
const PARTICLE_SIZE = 0.85
const GRAVITY = -18 // world units / sec²
const LAUNCH_SPEED_MIN = 12
const LAUNCH_SPEED_MAX = 24

export interface DiscoveryBurstHandle {
  points: THREE.Points
  burst: (position: THREE.Vector3, districtColor: number) => void
  update: (dt: number) => void
  dispose: () => void
}

interface Particle {
  active: boolean
  px: number
  py: number
  pz: number
  vx: number
  vy: number
  vz: number
  elapsed: number
  rOut: number
  gOut: number
  bOut: number
}

export function createDiscoveryBurst(): DiscoveryBurstHandle {
  const positions = new Float32Array(CAPACITY * 3)
  const colors = new Float32Array(CAPACITY * 3)
  for (let i = 0; i < CAPACITY; i++) positions[i * 3 + 1] = -1000

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

  const pool: Particle[] = []
  for (let i = 0; i < CAPACITY; i++) {
    pool.push({
      active: false,
      px: 0, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0,
      elapsed: 0,
      rOut: 1, gOut: 1, bOut: 1,
    })
  }
  let nextSlot = 0

  const brandRed = new THREE.Color(0xff5a5a)
  const colorScratch = new THREE.Color()

  const burst = (position: THREE.Vector3, districtColor: number) => {
    const districtTint = new THREE.Color(districtColor)
    for (let n = 0; n < PARTICLES_PER_BURST; n++) {
      // Find a free slot — linear ring scan.
      let slot = -1
      for (let i = 0; i < CAPACITY; i++) {
        const idx = (nextSlot + i) % CAPACITY
        if (!pool[idx].active) {
          slot = idx
          nextSlot = (idx + 1) % CAPACITY
          break
        }
      }
      if (slot < 0) break // pool exhausted (shouldn't happen)

      const p = pool[slot]
      p.px = position.x + (Math.random() - 0.5) * 0.4
      p.py = position.y
      p.pz = position.z + (Math.random() - 0.5) * 0.4

      // Launch up + outward — random direction on a hemisphere skewed
      // toward +Y (mostly up, with horizontal spread).
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.45 // 0..81° from up
      const speed = LAUNCH_SPEED_MIN + Math.random() * (LAUNCH_SPEED_MAX - LAUNCH_SPEED_MIN)
      p.vx = Math.sin(phi) * Math.cos(theta) * speed
      p.vy = Math.cos(phi) * speed
      p.vz = Math.sin(phi) * Math.sin(theta) * speed

      // Half brand red, half district color.
      colorScratch.copy(Math.random() < 0.5 ? brandRed : districtTint)
      p.rOut = colorScratch.r
      p.gOut = colorScratch.g
      p.bOut = colorScratch.b

      p.elapsed = 0
      p.active = true
    }
  }

  const update = (dt: number) => {
    for (let i = 0; i < CAPACITY; i++) {
      const p = pool[i]
      if (!p.active) continue
      p.elapsed += dt
      if (p.elapsed >= PARTICLE_LIFETIME) {
        positions[i * 3 + 1] = -1000
        p.active = false
        continue
      }
      // Symplectic Euler — apply gravity to vy, then integrate position.
      p.vy += GRAVITY * dt
      p.px += p.vx * dt
      p.py += p.vy * dt
      p.pz += p.vz * dt
      positions[i * 3 + 0] = p.px
      positions[i * 3 + 1] = p.py
      positions[i * 3 + 2] = p.pz
      // Fade color toward black as lifetime expires — cheap dim trick.
      const t = p.elapsed / PARTICLE_LIFETIME
      const k = 1 - t
      colors[i * 3 + 0] = p.rOut * k
      colors[i * 3 + 1] = p.gOut * k
      colors[i * 3 + 2] = p.bOut * k
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, burst, update, dispose }
}
