import * as THREE from 'three'

/**
 * Soaring bird silhouettes against the dusk sky.
 *
 * 5 small dark V-shaped silhouettes drift in slow lazy figure-8 loops at
 * altitude 28–42 in a wide ring around the world. Each is a tiny custom
 * BufferGeometry — two triangles forming a flat "V" wing shape — colored
 * solid dark brown so they read as silhouettes against any sky palette.
 *
 * Each bird has its own loop center, loop radius, speed, and altitude so
 * they don't fly in formation. Wing-flap animation is a subtle scale.y
 * oscillation (0.7 Hz) — barely visible at distance but adds life.
 *
 * Reference: every Bruno Simon scene + every Apple immersive page has
 * "something flying in the periphery." It's never the focus; it just
 * tells the brain the world is real.
 */

const BIRD_COUNT = 5
const BIRD_BODY_COLOR = 0x2a1f25 // dark mauve — reads as silhouette
const BIRD_ALTITUDE_MIN = 28
const BIRD_ALTITUDE_MAX = 42
const BIRD_LOOP_RADIUS_MIN = 30
const BIRD_LOOP_RADIUS_MAX = 70
const BIRD_LOOP_PERIOD_MIN = 18 // seconds for one loop
const BIRD_LOOP_PERIOD_MAX = 32

export interface BirdsHandle {
  group: THREE.Group
  update: (time: number) => void
  dispose: () => void
}

interface Bird {
  mesh: THREE.Mesh
  centerX: number
  centerZ: number
  altitude: number
  loopRadius: number
  loopPeriod: number
  phase: number // 0 → 2π over loopPeriod
  rightWing: THREE.Mesh
  leftWing: THREE.Mesh
}

function makeBirdGeometry(): THREE.BufferGeometry {
  // Single triangle wing. Two of these mirror-mounted on the bird group
  // give the classic "V" silhouette. 3-vertex geo + 1 face = cheapest
  // possible silhouette.
  const geo = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    0, 0, 0,      // wing root (body)
    1, 0.05, -0.3, // wing tip slightly back + up
    0.55, 0, 0.05, // mid wing
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setIndex([0, 1, 2])
  geo.computeVertexNormals()
  return geo
}

export function createBirds(): BirdsHandle {
  const group = new THREE.Group()

  const wingGeo = makeBirdGeometry()
  const wingMat = new THREE.MeshBasicMaterial({
    color: BIRD_BODY_COLOR,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    fog: true, // birds DO fade with distance — gives them depth
  })

  const birds: Bird[] = []
  for (let i = 0; i < BIRD_COUNT; i++) {
    const birdGroup = new THREE.Group()

    const rightWing = new THREE.Mesh(wingGeo, wingMat)
    birdGroup.add(rightWing)

    const leftWing = new THREE.Mesh(wingGeo, wingMat)
    leftWing.scale.x = -1 // mirror
    birdGroup.add(leftWing)

    // Random circular orbit somewhere in the world's outer band.
    const a = Math.random() * Math.PI * 2
    const r = (BIRD_LOOP_RADIUS_MIN + BIRD_LOOP_RADIUS_MAX) / 2 + (Math.random() - 0.5) * 30
    group.add(birdGroup)
    birds.push({
      mesh: birdGroup,
      centerX: Math.cos(a) * r,
      centerZ: Math.sin(a) * r,
      altitude: BIRD_ALTITUDE_MIN + Math.random() * (BIRD_ALTITUDE_MAX - BIRD_ALTITUDE_MIN),
      loopRadius: BIRD_LOOP_RADIUS_MIN + Math.random() * (BIRD_LOOP_RADIUS_MAX - BIRD_LOOP_RADIUS_MIN),
      loopPeriod: BIRD_LOOP_PERIOD_MIN + Math.random() * (BIRD_LOOP_PERIOD_MAX - BIRD_LOOP_PERIOD_MIN),
      phase: Math.random() * Math.PI * 2,
      rightWing,
      leftWing,
    })
  }

  const update = (time: number) => {
    for (const b of birds) {
      const angle = b.phase + (time / b.loopPeriod) * Math.PI * 2
      b.mesh.position.x = b.centerX + Math.cos(angle) * b.loopRadius
      b.mesh.position.z = b.centerZ + Math.sin(angle) * b.loopRadius
      // Subtle figure-8 altitude variation.
      b.mesh.position.y = b.altitude + Math.sin(angle * 2) * 1.2
      // Face direction of travel — yaw is the tangent of the orbit.
      // d/dθ (cos θ, sin θ) = (-sin θ, cos θ) — heading is atan2.
      b.mesh.rotation.y = -angle + Math.PI / 2

      // Wing flap: scale.y oscillates around 1 at ~0.7 Hz with a small
      // amplitude. Reads as "wings moving" without being flashy.
      const flap = 1 + Math.sin(time * 2 * Math.PI * 0.7 + b.phase) * 0.35
      b.rightWing.scale.y = flap
      b.leftWing.scale.y = flap
    }
  }

  const dispose = () => {
    wingGeo.dispose()
    wingMat.dispose()
  }

  return { group, update, dispose }
}
