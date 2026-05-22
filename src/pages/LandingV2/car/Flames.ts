import * as THREE from 'three'

export interface FlameSystem {
  /** The Three.js Points node to add to the scene. */
  points: THREE.Points
  /**
   * Spawn a boost-flame particle from the rear exhaust of the car.
   * `colorOverride`, if provided, temporarily tints the entire flame
   * system to that hex — used by the drift system to draw white-orange
   * sparks instead of orange flames.
   */
  spawn: (carPos: THREE.Vector3, carRot: THREE.Euler, colorOverride?: number) => void
  advance: (dt: number) => void
  /**
   * Cap the number of active flame particles. Buffer is preallocated to
   * MAX_FLAME_COUNT; setBudget shrinks the ring-buffer active span so LOD
   * can halve fragment work under load.
   */
  setBudget: (n: number) => void
  /** Current active budget. Defaults to MAX_FLAME_COUNT. */
  getBudget: () => number
}

const MAX_FLAME_COUNT = 80

// Boost-exhaust flame particles emitted from the rear of the car when the
// boost key is held + forward velocity > 1.5. Additive blending gives the
// signature glow. Particles inherit a backward kick along the car's heading
// and a small lateral jitter.
//
// `colorOverride` on `spawn()` retints the whole material — single shared
// material means we don't pay for per-particle color attributes. Drift
// sparks pass `0xffd17a` (white-orange) to get a hotter, paler look that
// reads as friction sparks rather than exhaust flame.
//
// Buffer always sized at MAX_FLAME_COUNT for stable GPU memory; runtime
// budget is shrinkable via setBudget() for FPS-adaptive LOD.
export function createFlames(): FlameSystem {
  const flameGeo = new THREE.BufferGeometry()
  const flamePos = new Float32Array(MAX_FLAME_COUNT * 3)
  const flameLife = new Float32Array(MAX_FLAME_COUNT)
  const flameVel = new Float32Array(MAX_FLAME_COUNT * 3)
  for (let i = 0; i < MAX_FLAME_COUNT; i++) {
    flameLife[i] = 0
    flamePos[i * 3 + 1] = -100
  }
  flameGeo.setAttribute('position', new THREE.BufferAttribute(flamePos, 3))
  const flameMat = new THREE.PointsMaterial({
    color: 0xff5a2a,
    size: 0.7,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(flameGeo, flameMat)

  let activeBudget = MAX_FLAME_COUNT
  let flameHead = 0
  const spawn = (carPos: THREE.Vector3, carRot: THREE.Euler, colorOverride?: number) => {
    if (colorOverride !== undefined) flameMat.color.setHex(colorOverride)
    const backOffset = new THREE.Vector3(0, 0.55, -1.9).applyEuler(carRot)
    const px = carPos.x + backOffset.x
    const py = carPos.y + backOffset.y
    const pz = carPos.z + backOffset.z
    const back = new THREE.Vector3(0, 0, -1).applyEuler(carRot)
    const i = flameHead
    flamePos[i * 3 + 0] = px + (Math.random() - 0.5) * 0.35
    flamePos[i * 3 + 1] = py
    flamePos[i * 3 + 2] = pz + (Math.random() - 0.5) * 0.35
    flameVel[i * 3 + 0] = back.x * (4 + Math.random() * 2) + (Math.random() - 0.5) * 0.3
    flameVel[i * 3 + 1] = (Math.random() - 0.3) * 0.4
    flameVel[i * 3 + 2] = back.z * (4 + Math.random() * 2) + (Math.random() - 0.5) * 0.3
    flameLife[i] = 0.5
    flameHead = (flameHead + 1) % activeBudget
  }

  const advance = (dt: number) => {
    for (let i = 0; i < MAX_FLAME_COUNT; i++) {
      if (flameLife[i] <= 0) continue
      flamePos[i * 3 + 0] += flameVel[i * 3 + 0] * dt
      flamePos[i * 3 + 1] += flameVel[i * 3 + 1] * dt
      flamePos[i * 3 + 2] += flameVel[i * 3 + 2] * dt
      flameLife[i] -= dt * 2.0
      if (flameLife[i] <= 0) flamePos[i * 3 + 1] = -100
    }
    flameGeo.attributes.position.needsUpdate = true
  }

  const setBudget = (n: number) => {
    activeBudget = Math.max(10, Math.min(MAX_FLAME_COUNT, Math.floor(n)))
    for (let i = activeBudget; i < MAX_FLAME_COUNT; i++) {
      if (flameLife[i] > 0) {
        flameLife[i] = 0
        flamePos[i * 3 + 1] = -100
      }
    }
    if (flameHead >= activeBudget) flameHead = 0
    flameGeo.attributes.position.needsUpdate = true
  }

  const getBudget = () => activeBudget

  return { points, spawn, advance, setBudget, getBudget }
}
