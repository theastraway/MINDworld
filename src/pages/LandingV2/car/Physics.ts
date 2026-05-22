import * as THREE from 'three'
import type { CarBuild } from './Car'

export interface CarInput {
  forward: number // [-1..1]
  turn: number    // [-1..1]
  boost: boolean
  /**
   * Handbrake / drift. When true, lateral grip drops (car slides longer
   * after a corner exits), yaw rate amplifies for the same steering input,
   * body roll exaggerates, and the rear wheels visually lock (spin at
   * half rate). Default driving behavior with `drift=false` is unchanged.
   */
  drift?: boolean
}

export interface CarState {
  velocity: number
  angularVelocity: number
}

// Drives the car one frame: acceleration + damping, turn-rate scaled by
// speed, world clamping, wheel spin + front-wheel steering, brake-light
// color toggle, and body roll on the hull/upper/cab.
//
// Magic numbers (preserved verbatim from the monolith for `drift=false`):
//   targetAccel base = 16 (boost = 26)
//   velocity damping = 0.93           (drift = 0.97 → slides further)
//   turn coefficient = 2.4            (drift = 2.4 × 1.4 = 3.36)
//   low-speed turn scale = 0.35 (under 0.3 abs velocity)
//   angularVelocity damping = 0.83
//   world clamp = ±90 on x/z
//   wheel spin coefficient = 3.6      (rear wheels = 0.5× when drift)
//   body roll coefficient = 3.2       (drift = 3.2 × 1.8 = 5.76)
//   body roll lerp = 0.1
export function updateCar(
  build: CarBuild,
  state: CarState,
  input: CarInput,
  dt: number
): void {
  const { group: car, hull, upper, cab, tail, tail2, wheels } = build
  const { forward, turn, boost, drift = false } = input

  const targetAccel = forward * (boost ? 26 : 16)
  state.velocity += targetAccel * dt
  // Drift = looser lateral damping → car slides further before settling.
  state.velocity *= drift ? 0.97 : 0.93

  const turnMultiplier = drift ? 1.4 : 1.0
  const turnRate = turn * 2.4 * turnMultiplier * dt * (Math.abs(state.velocity) > 0.3 ? 1 : 0.35)
  state.angularVelocity += turnRate
  state.angularVelocity *= 0.83
  car.rotation.y += state.angularVelocity

  const dir = new THREE.Vector3(0, 0, 1).applyEuler(car.rotation)
  car.position.add(dir.multiplyScalar(state.velocity * dt))
  car.position.x = THREE.MathUtils.clamp(car.position.x, -90, 90)
  car.position.z = THREE.MathUtils.clamp(car.position.z, -90, 90)

  // Wheels: spin + steering on front pair. When drifting, the rear wheels
  // (i = 2, 3) spin at half rate to telegraph the locked-rear look.
  const spinFront = state.velocity * dt * 3.6
  const spinRear = drift ? spinFront * 0.5 : spinFront
  wheels.forEach((wg, i) => {
    const isFront = i < 2
    ;(wg.children[0] as THREE.Mesh).rotation.x -= isFront ? spinFront : spinRear
    if (isFront) wg.rotation.y = THREE.MathUtils.lerp(wg.rotation.y, turn * 0.5, 0.2)
  })

  // Tail lights: pulse hotter red when drifting, deep red when braking,
  // default red otherwise.
  const braking = forward < 0
  const tailColor = drift ? 0xff0a0a : braking ? 0xff0000 : 0xff3333
  ;(tail.material as THREE.MeshBasicMaterial).color.setHex(tailColor)
  ;(tail2.material as THREE.MeshBasicMaterial).color.setHex(tailColor)

  // Body roll/tilt on turn. Drift exaggerates by 1.8× the target angle.
  const rollMultiplier = drift ? 1.8 : 1.0
  const targetRoll = -state.angularVelocity * 3.2 * rollMultiplier
  hull.rotation.z = THREE.MathUtils.lerp(hull.rotation.z, targetRoll, 0.1)
  upper.rotation.z = hull.rotation.z
  cab.rotation.z = hull.rotation.z
}
