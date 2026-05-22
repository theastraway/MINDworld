import * as THREE from 'three'

export interface DustSystem {
  points: THREE.Points
  spawn: (x: number, z: number) => void
  advance: (dt: number) => void
  /**
   * Cap the number of "active" dust particles per cycle. Buffers are
   * allocated once at MAX_DUST_COUNT; setBudget masks the head pointer so
   * only the first `n` slots churn. Used by FPS-adaptive LOD in SceneRoot
   * to halve particle work under load. Clamped to [10, MAX_DUST_COUNT].
   */
  setBudget: (n: number) => void
  /** Current active budget. Defaults to MAX_DUST_COUNT. */
  getBudget: () => number
}

const MAX_DUST_COUNT = 200

// Ring-buffer particle system for wheel-kicked dust. Spawns particles at
// world-space (x, z) with a small jitter and upward velocity; gravity
// (-1.4 units/s^2 in Y) drags them back down. Life ticks at -1.1 / sec.
//
// Buffer is always allocated at MAX_DUST_COUNT for stable GPU memory, but
// the active "budget" can be reduced at runtime via setBudget() so the LOD
// system can shrink the active set without re-allocating BufferAttributes.
export function createDust(): DustSystem {
  const dustGeo = new THREE.BufferGeometry()
  const dustPos = new Float32Array(MAX_DUST_COUNT * 3)
  const dustLife = new Float32Array(MAX_DUST_COUNT)
  const dustVel = new Float32Array(MAX_DUST_COUNT * 3)
  for (let i = 0; i < MAX_DUST_COUNT; i++) {
    dustLife[i] = 0
    dustPos[i * 3 + 1] = -100
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustMat = new THREE.PointsMaterial({
    color: 0xd8c4a8,
    size: 0.55,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(dustGeo, dustMat)

  let activeBudget = MAX_DUST_COUNT
  let dustHead = 0

  const spawn = (x: number, z: number) => {
    const i = dustHead
    dustPos[i * 3 + 0] = x + (Math.random() - 0.5) * 0.4
    dustPos[i * 3 + 1] = 0.2
    dustPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4
    dustVel[i * 3 + 0] = (Math.random() - 0.5) * 0.6
    dustVel[i * 3 + 1] = 0.8 + Math.random() * 0.5
    dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6
    dustLife[i] = 1.0
    dustHead = (dustHead + 1) % activeBudget
  }

  const advance = (dt: number) => {
    for (let i = 0; i < MAX_DUST_COUNT; i++) {
      if (dustLife[i] <= 0) continue
      dustPos[i * 3 + 0] += dustVel[i * 3 + 0] * dt
      dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt
      dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt
      dustVel[i * 3 + 1] -= dt * 1.4
      dustLife[i] -= dt * 1.1
      if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -100
    }
    dustGeo.attributes.position.needsUpdate = true
  }

  const setBudget = (n: number) => {
    activeBudget = Math.max(10, Math.min(MAX_DUST_COUNT, Math.floor(n)))
    // Park any out-of-budget particles below the world so they don't render
    // while the ring-buffer shrinks.
    for (let i = activeBudget; i < MAX_DUST_COUNT; i++) {
      if (dustLife[i] > 0) {
        dustLife[i] = 0
        dustPos[i * 3 + 1] = -100
      }
    }
    if (dustHead >= activeBudget) dustHead = 0
    dustGeo.attributes.position.needsUpdate = true
  }

  const getBudget = () => activeBudget

  return { points, spawn, advance, setBudget, getBudget }
}
