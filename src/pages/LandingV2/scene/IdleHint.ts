import * as THREE from 'three'
import type { District } from '../districts/types'

/**
 * Idle hint — a brand-red floating arrow above the car that points at
 * the nearest undiscovered district. Surfaces only when the player has
 * been stationary (|velocity| < 0.6) for >5 seconds AND there's still
 * an undiscovered district to find.
 *
 * Disappears the moment the player starts driving again — non-intrusive,
 * only shows up when the player actually seems lost.
 *
 * Visual: a flat triangle (ConeGeometry with 3 segments) at altitude 5
 * above the car, glowing brand-red, gentle bob + brand-red emissive
 * for bloom. Rotates around Y to point at the target.
 */

const HINT_ALTITUDE = 5
const HINT_IDLE_THRESHOLD_SEC = 5
const HINT_VELOCITY_THRESHOLD = 0.6

export interface IdleHintHandle {
  group: THREE.Group
  /**
   * Per-frame update.
   * @param dt elapsed seconds since last frame
   * @param velocity current car velocity magnitude
   * @param carPos world position of the car
   * @param visited set of discovered district keys
   * @param districts all districts (incl. hidden) — hidden is excluded
   *                   internally
   */
  update: (
    dt: number,
    velocity: number,
    carPos: THREE.Vector3,
    visited: Set<string>,
    districts: ReadonlyArray<District>,
  ) => void
  dispose: () => void
}

export function createIdleHint(): IdleHintHandle {
  const group = new THREE.Group()
  // Arrow shape: tall flat triangle pointing along +Z (will be rotated
  // each frame to face the target district). Two-sided so it reads from
  // any angle.
  const arrowGeo = new THREE.ConeGeometry(0.55, 1.4, 3)
  // Rotate the cone so the point aims along +Z instead of +Y.
  arrowGeo.rotateX(Math.PI / 2)
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0xff5a5a,
    emissive: 0xff5a5a,
    emissiveIntensity: 2.4,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  })
  const arrow = new THREE.Mesh(arrowGeo, arrowMat)
  group.add(arrow)

  let idleSec = 0
  let visibleOpacity = 0

  const update: IdleHintHandle['update'] = (dt, velocity, carPos, visited, districts) => {
    // Track idle time.
    if (Math.abs(velocity) < HINT_VELOCITY_THRESHOLD) {
      idleSec += dt
    } else {
      idleSec = 0
    }

    // Find the nearest undiscovered (non-hidden) district.
    let nearest: District | null = null
    let nearestDist = Infinity
    for (const d of districts) {
      if (d.hidden) continue
      if (visited.has(d.key)) continue
      const dx = d.position[0] - carPos.x
      const dz = d.position[1] - carPos.z
      const dist = Math.hypot(dx, dz)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = d
      }
    }

    const shouldShow = idleSec > HINT_IDLE_THRESHOLD_SEC && nearest !== null
    // Lerp the opacity toward the target so the show/hide transition
    // doesn't pop.
    const target = shouldShow ? 1 : 0
    visibleOpacity = THREE.MathUtils.lerp(visibleOpacity, target, dt * 4)
    arrowMat.opacity = visibleOpacity
    arrow.visible = visibleOpacity > 0.02

    if (!arrow.visible || !nearest) return

    // Position arrow above the car with a gentle bob.
    arrow.position.set(
      carPos.x,
      carPos.y + HINT_ALTITUDE + Math.sin(idleSec * 2) * 0.25,
      carPos.z,
    )

    // Rotate arrow to point at the district (atan2 of dz, dx for world Y).
    const dx = nearest.position[0] - carPos.x
    const dz = nearest.position[1] - carPos.z
    arrow.rotation.y = Math.atan2(dx, dz)
  }

  const dispose = () => {
    arrowGeo.dispose()
    arrowMat.dispose()
  }

  return { group, update, dispose }
}
