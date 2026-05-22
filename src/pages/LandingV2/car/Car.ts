import * as THREE from 'three'

export interface CarBuild {
  group: THREE.Group
  // Per-mesh handles the animation loop reaches into each frame.
  hull: THREE.Mesh
  upper: THREE.Mesh
  cab: THREE.Mesh
  tail: THREE.Mesh
  tail2: THREE.Mesh
  wheels: THREE.Group[]
}

// Builds the lego-style car: lower red hull, narrower upper hull, black cab,
// white roof stripe, spoiler, four wheels with hubs, headlights, tail lights,
// and a forward-facing headlight spotlight. Returns the group plus the
// individual mesh handles the per-frame `updateCar` needs for body roll,
// brake-light toggling, and wheel spin.
export function buildCar(): CarBuild {
  const car = new THREE.Group()

  // Lower hull (red)
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.55, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xF43F3F, roughness: 0.25, metalness: 0.6, flatShading: true })
  )
  hull.position.y = 0.55
  hull.castShadow = true
  car.add(hull)

  // Upper hull (longer narrow piece for hood + tail)
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.4, 2),
    new THREE.MeshStandardMaterial({ color: 0xd8362c, roughness: 0.3, metalness: 0.6, flatShading: true })
  )
  upper.position.set(0, 1.0, -0.1)
  upper.castShadow = true
  car.add(upper)

  // Cabin (dark glass)
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.55, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.15, metalness: 0.9, flatShading: true })
  )
  cab.position.set(0, 1.35, -0.2)
  cab.castShadow = true
  car.add(cab)

  // White roof stripe
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, 3.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
  stripe.position.set(0, 1.61, 0)
  car.add(stripe)

  // Spoiler
  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.1, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x101012, flatShading: true })
  )
  spoiler.position.set(0, 1.05, -1.8)
  car.add(spoiler)
  const spoilerL = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.5, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x101012 })
  )
  spoilerL.position.set(-0.9, 0.85, -1.75)
  car.add(spoilerL)
  const spoilerR = spoilerL.clone()
  spoilerR.position.x = 0.9
  car.add(spoilerR)

  // Wheels with axle hubs
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 18)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.85, flatShading: true })
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.7 })
  const wheels: THREE.Group[] = []
  const wheelPositions: [number, number, number][] = [
    [1.05, 0.5, 1.2], [-1.05, 0.5, 1.2], [1.05, 0.5, -1.2], [-1.05, 0.5, -1.2],
  ]
  wheelPositions.forEach((p) => {
    const wg = new THREE.Group()
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.z = Math.PI / 2
    w.castShadow = true
    wg.add(w)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8), hubMat)
    hub.rotation.z = Math.PI / 2
    wg.add(hub)
    wg.position.set(...p)
    car.add(wg)
    wheels.push(wg)
  })

  // Headlights + tail lights
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff6d6 })
  )
  head.position.set(0.55, 0.85, 1.85)
  car.add(head)
  const head2 = head.clone()
  head2.position.x = -0.55
  car.add(head2)

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.15, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  )
  tail.position.set(0.55, 0.85, -1.85)
  car.add(tail)
  const tail2 = tail.clone()
  tail2.position.x = -0.55
  car.add(tail2)

  // Headlight spotlights
  const beamSpot = new THREE.SpotLight(0xffeecc, 2.2, 28, Math.PI / 6, 0.45, 1)
  beamSpot.position.set(0, 1.0, 1.6)
  beamSpot.target.position.set(0, 0, 8)
  car.add(beamSpot)
  car.add(beamSpot.target)

  car.position.set(0, 0, 18)
  car.rotation.y = Math.PI

  return { group: car, hull, upper, cab, tail, tail2, wheels }
}
