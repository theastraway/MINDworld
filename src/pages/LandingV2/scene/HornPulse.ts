import * as THREE from 'three'

/**
 * Horn-press shockwave — when the player presses H, a brand-red ring
 * pulse expands outward from the car's position along the ground plane,
 * fading as it grows. Visual partner to the procedural horn tone.
 *
 * Implementation: a single TorusGeometry wireframe ring (no actual mesh
 * mass) flat on the ground (rotation.x = -π/2), scaled outward from
 * radius 0 to 30 over 1.4 seconds, with opacity fading from 1 → 0.
 *
 * Capacity: up to 4 simultaneous pulses (player can spam-press H).
 * Pre-allocated pool of meshes — zero per-frame allocation.
 */

const PULSE_CAPACITY = 4
const PULSE_DURATION = 1.4
const PULSE_MAX_RADIUS = 30
const PULSE_TUBE_RADIUS = 0.18

export interface HornPulseHandle {
  group: THREE.Group
  fire: (originX: number, originZ: number) => void
  update: (dt: number) => void
  dispose: () => void
}

interface PulseSlot {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  active: boolean
  elapsed: number
}

export function createHornPulses(): HornPulseHandle {
  const group = new THREE.Group()
  // Each pulse needs its OWN material so it can fade independently.
  // Geometry can be shared — torus radius 1, scaled per-frame to grow.
  const sharedGeo = new THREE.TorusGeometry(1, PULSE_TUBE_RADIUS, 6, 48)

  const slots: PulseSlot[] = []
  for (let i = 0; i < PULSE_CAPACITY; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff5a5a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    const mesh = new THREE.Mesh(sharedGeo, material)
    mesh.rotation.x = -Math.PI / 2 // flat on ground
    mesh.visible = false
    group.add(mesh)
    slots.push({ mesh, material, active: false, elapsed: 0 })
  }

  let nextSlot = 0

  const fire = (originX: number, originZ: number) => {
    // Find a free slot — if none, recycle the oldest one (slot at
    // nextSlot has the most elapsed time).
    let slot = slots.find((s) => !s.active)
    if (!slot) {
      slot = slots[nextSlot]
      nextSlot = (nextSlot + 1) % PULSE_CAPACITY
    }
    slot.active = true
    slot.elapsed = 0
    slot.mesh.visible = true
    slot.mesh.position.set(originX, 0.05, originZ)
    slot.mesh.scale.setScalar(0.5)
    slot.material.opacity = 1
  }

  const update = (dt: number) => {
    for (const slot of slots) {
      if (!slot.active) continue
      slot.elapsed += dt
      const t = slot.elapsed / PULSE_DURATION
      if (t >= 1) {
        slot.active = false
        slot.mesh.visible = false
        continue
      }
      // Ease-out scale: starts fast, slows as it grows.
      const easeOut = 1 - Math.pow(1 - t, 2.2)
      const radius = 0.5 + easeOut * PULSE_MAX_RADIUS
      slot.mesh.scale.setScalar(radius)
      // Opacity: full at t=0, zero at t=1, with a quick fade tail so
      // the ring doesn't pop out.
      slot.material.opacity = (1 - t) * (1 - t) // quadratic fade
    }
  }

  const dispose = () => {
    sharedGeo.dispose()
    for (const s of slots) s.material.dispose()
  }

  return { group, fire, update, dispose }
}
