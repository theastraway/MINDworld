import * as THREE from 'three'

/**
 * Random shooting stars streaking across the high sky.
 *
 * Every 20–40 seconds, a single bright streak crosses the upper sky at
 * altitude 55–70 with a slight downward angle. Each streak lives ~1.2s,
 * fading from peak brightness to nothing as it travels. Uses a stretched
 * Points particle with additive blending so PostFX bloom catches it.
 *
 * Subtle but eye-catching — players who linger on the page get rewarded
 * with little serendipitous moments. Pairs with the bird silhouettes
 * and motes to make the world feel inhabited.
 *
 * One simultaneous streak max (capacity 1). The "streak" effect is
 * achieved by spawning a chain of 8 short-lived particles along the
 * star's path with staggered fade.
 */

const STAR_INTERVAL_MIN = 20
const STAR_INTERVAL_MAX = 40
const STAR_LIFETIME = 1.2
const STAR_SPEED = 65 // world units / sec
const STAR_ALTITUDE_MIN = 55
const STAR_ALTITUDE_MAX = 70
const STAR_TRAIL_LENGTH = 8 // particles per streak
const STAR_PARTICLE_SIZE = 1.4
const STAR_SPAWN_HORIZON = 130 // start position from world center

export interface ShootingStarsHandle {
  points: THREE.Points
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
  initialOpacity: number
}

export function createShootingStars(): ShootingStarsHandle {
  const positions = new Float32Array(STAR_TRAIL_LENGTH * 3)
  const colors = new Float32Array(STAR_TRAIL_LENGTH * 3)
  for (let i = 0; i < STAR_TRAIL_LENGTH; i++) positions[i * 3 + 1] = -1000

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: STAR_PARTICLE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    fog: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  const pool: Particle[] = []
  for (let i = 0; i < STAR_TRAIL_LENGTH; i++) {
    pool.push({
      active: false,
      px: 0, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0,
      elapsed: 0,
      initialOpacity: 1,
    })
  }

  let nextStarIn = STAR_INTERVAL_MIN + Math.random() * (STAR_INTERVAL_MAX - STAR_INTERVAL_MIN)

  const spawn = () => {
    // Origin: somewhere on the upper sky's horizon, random side.
    const startAngle = Math.random() * Math.PI * 2
    const altitude = STAR_ALTITUDE_MIN + Math.random() * (STAR_ALTITUDE_MAX - STAR_ALTITUDE_MIN)
    const startX = Math.cos(startAngle) * STAR_SPAWN_HORIZON
    const startZ = Math.sin(startAngle) * STAR_SPAWN_HORIZON

    // Target: opposite side, slight downward bias so the arc reads as
    // a meteor falling toward the horizon rather than a flat traverse.
    const endAngle = startAngle + Math.PI + (Math.random() - 0.5) * 0.6
    const endX = Math.cos(endAngle) * STAR_SPAWN_HORIZON
    const endZ = Math.sin(endAngle) * STAR_SPAWN_HORIZON
    const dx = endX - startX
    const dz = endZ - startZ
    const dist = Math.hypot(dx, dz)

    const vx = (dx / dist) * STAR_SPEED
    const vy = -STAR_SPEED * 0.18 // gentle dive
    const vz = (dz / dist) * STAR_SPEED

    // Color: warm cream peak (the actual fireball) — bloom carries it.
    const r = 1.0, g = 0.94, b = 0.72

    for (let i = 0; i < STAR_TRAIL_LENGTH; i++) {
      const p = pool[i]
      p.active = true
      // Stagger trail particles slightly behind the head along velocity
      // — gives the streak its tail.
      const trailOffset = -i * 0.5 // 0.5s spacing
      p.px = startX + vx * trailOffset
      p.py = altitude + vy * trailOffset
      p.pz = startZ + vz * trailOffset
      p.vx = vx
      p.vy = vy
      p.vz = vz
      p.elapsed = 0
      // Head is brightest, tail fades.
      p.initialOpacity = 1 - i / STAR_TRAIL_LENGTH
      colors[i * 3 + 0] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
  }

  const update = (dt: number) => {
    // Countdown to next spawn — only spawn if no streak is currently
    // active (single-streak invariant).
    const anyActive = pool.some((p) => p.active)
    if (!anyActive) {
      nextStarIn -= dt
      if (nextStarIn <= 0) {
        spawn()
        nextStarIn = STAR_INTERVAL_MIN + Math.random() * (STAR_INTERVAL_MAX - STAR_INTERVAL_MIN)
      }
    }

    for (let i = 0; i < STAR_TRAIL_LENGTH; i++) {
      const p = pool[i]
      if (!p.active) continue
      p.elapsed += dt
      if (p.elapsed >= STAR_LIFETIME) {
        positions[i * 3 + 1] = -1000
        p.active = false
        continue
      }
      p.px += p.vx * dt
      p.py += p.vy * dt
      p.pz += p.vz * dt
      positions[i * 3 + 0] = p.px
      positions[i * 3 + 1] = p.py
      positions[i * 3 + 2] = p.pz
      // Fade by time (initial opacity × remaining lifetime fraction).
      const fade = p.initialOpacity * (1 - p.elapsed / STAR_LIFETIME)
      colors[i * 3 + 0] = 1.0 * fade
      colors[i * 3 + 1] = 0.94 * fade
      colors[i * 3 + 2] = 0.72 * fade
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
