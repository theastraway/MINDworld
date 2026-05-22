import * as THREE from 'three'

// Skid mark decal system.
//
// Lays thin dark plane decals flat on the ground (y=0.04, above the
// ground plane at y=0) whenever the car is drifting or cornering hard.
// Each decal is oriented to the car's heading at spawn time and
// persists for the session — no fade — so the user sees a visible
// trail of where they've been.
//
// Ring-buffered to keep the GPU footprint bounded: oldest decal is
// recycled when the buffer fills.

const SKID_BUFFER_SIZE = 200

export interface SkidSystem {
  /** The group to add to the scene; holds every decal mesh. */
  group: THREE.Group
  /**
   * Spawn one skid mark per rear wheel. `carPos` is the world-space car
   * position, `carRot` is the car's Euler rotation (we only use Y / yaw).
   * Two decals get placed — one under each rear wheel — using the same
   * offsets the dust system uses.
   */
  spawn: (carPos: THREE.Vector3, carRot: THREE.Euler) => void
  /** Dispose geometry + material. Call on scene teardown. */
  dispose: () => void
}

/** Local rear-wheel offsets, matching the wheel positions in `Car.ts`. */
const REAR_WHEEL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1.05, -1.2],
  [1.05, -1.2],
]

export function createSkids(): SkidSystem {
  const group = new THREE.Group()

  // Single shared geometry + material — all decals use the same look,
  // so we only need to allocate once. Each mesh shares them.
  const geo = new THREE.PlaneGeometry(0.4, 1.0)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })

  // Pre-allocate the ring buffer. Each slot starts invisible (scale 0)
  // until first spawn so it doesn't render a stack of identical decals
  // at the origin on page load.
  //
  // Each slot uses Euler order 'YXZ' so that yaw is applied FIRST (around
  // the world up axis) and THEN the X tilt lays the plane flat. With the
  // default 'XYZ' order, the post-tilt Y rotation rotates around the
  // already-rotated plane's local Y (which points sideways in world
  // space), not around world up — that would tip the decal sideways.
  const slots: THREE.Mesh[] = []
  for (let i = 0; i < SKID_BUFFER_SIZE; i++) {
    const m = new THREE.Mesh(geo, mat)
    m.rotation.order = 'YXZ'
    m.rotation.set(-Math.PI / 2, 0, 0) // lay flat
    m.position.set(0, 0.04, 0)
    m.scale.set(0, 0, 0) // hidden until used
    group.add(m)
    slots.push(m)
  }

  let head = 0

  const spawn = (carPos: THREE.Vector3, carRot: THREE.Euler): void => {
    const yaw = carRot.y
    // World-space offset of each rear wheel. The car's rotation only
    // touches Y (yaw), so applying a manual Y rotation to the local
    // (lx, _, lz) offset gives the same world position as
    // `THREE.Vector3.applyEuler` would but without the allocation.
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    for (const [lx, lz] of REAR_WHEEL_OFFSETS) {
      const wx = carPos.x + cosY * lx + sinY * lz
      const wz = carPos.z - sinY * lx + cosY * lz

      const slot = slots[head]
      slot.position.set(wx, 0.04, wz)
      // With YXZ order: first yaw around world up, then tilt flat.
      slot.rotation.set(-Math.PI / 2, yaw, 0)
      slot.scale.set(1, 1, 1)
      head = (head + 1) % SKID_BUFFER_SIZE
    }
  }

  const dispose = (): void => {
    geo.dispose()
    mat.dispose()
  }

  return { group, spawn, dispose }
}
