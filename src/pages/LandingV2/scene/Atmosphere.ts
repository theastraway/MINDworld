import * as THREE from 'three'
import type { Monument } from '../districts/types'

// Scatter props that fill out the world around the plaza: traffic cones in
// a loose ring, four wedge ramps near the inner edge, lamp posts on a
// circle just outside the plaza (with point lights for the bulbs), plus
// (Wave 4 / D3 — vision § 2 "Outer ring") an instanced ring of distant
// mountains and a scatter band of conifer + deciduous trees.
//
// Performance:
//   - Mountains use a single InstancedMesh of 24 cones — one geometry,
//     one material, per-instance position/rotation/scale via matrices.
//     Cheap to render at this scale; cheap to dispose.
//   - Trees use two InstancedMeshes (conifer cone-on-trunk and deciduous
//     ball-on-trunk) totaling ~100 instances. Each InstancedMesh holds
//     its own geometry; the trunk + canopy are placed using identical
//     transforms (the trunk just sits underneath the canopy at half
//     trunk-height).
//   - Tree positions skip the radial highways and a 6-unit buffer
//     around every existing district plinth so we don't bury the
//     monuments behind foliage.
//
// All atmosphere geometry is added directly to `scene`; the standard
// SceneRoot.dispose() traversal walks Mesh/Points/Line/Sprite and frees
// geometry + materials. InstancedMesh inherits from Mesh, so it is also
// handled by that traversal — no special dispose hook needed.

export interface AtmosphereOptions {
  /** Monuments are passed so trees can avoid clustering on top of plinths. */
  monuments: Monument[]
}

const MOUNTAIN_PALETTE: readonly number[] = [
  0x3a2630, // dark mauve
  0x5a2a2a, // deep red-brown
  0x5a4a3a, // sand-brown
]

const TREE_CONIFER_NEEDLE = 0x2a4a3a
const TREE_DECIDUOUS_LEAF = 0x5a8a5a
const TREE_TRUNK = 0x4a3a2a

export function buildAtmosphere(scene: THREE.Scene, options?: AtmosphereOptions): void {
  const propMat = new THREE.MeshStandardMaterial({ color: 0xF43F3F, roughness: 0.4, flatShading: true })
  const propWhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, flatShading: true })

  // Traffic cones in rings
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 18 + Math.random() * 60
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12), propMat)
    cone.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r)
    cone.castShadow = true
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.25, 12), propWhiteMat)
    band.position.copy(cone.position)
    band.position.y = 0.5
    scene.add(cone)
    scene.add(band)
  }

  // Ramps near the center — four wedges arranged around the plaza.
  // Original monolith built two unused throwaway buffers (`wedgeGeo`/`v`)
  // for documentation; the actual wedge uses `wedgeGeo2`/`v2`. Keep the
  // shipping geometry only — the unused vars do nothing visible.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8
    const wedgeGeo2 = new THREE.BufferGeometry()
    const v2 = new Float32Array([
      // Triangular prism (length along x: 6, height: 1.5, depth: 3)
      // Front face (triangle)
      -3, 0, 1.5,   3, 0, 1.5,  -3, 1.5, 1.5,
      // Back face (triangle)
       3, 0, -1.5, -3, 0, -1.5, -3, 1.5, -1.5,
      // Top slope (quad → 2 tris)
      -3, 1.5, 1.5,  3, 0, 1.5,  -3, 1.5, -1.5,
       3, 0, 1.5,   3, 0, -1.5, -3, 1.5, -1.5,
      // Left vertical face (quad → 2 tris)
      -3, 0, -1.5, -3, 0, 1.5, -3, 1.5, 1.5,
      -3, 0, -1.5, -3, 1.5, 1.5, -3, 1.5, -1.5,
      // Bottom face (quad → 2 tris)
      -3, 0, -1.5,  3, 0, -1.5,  3, 0, 1.5,
      -3, 0, -1.5,  3, 0, 1.5, -3, 0, 1.5,
      // Right slope cap (already part of slope)
    ])
    wedgeGeo2.setAttribute('position', new THREE.BufferAttribute(v2, 3))
    wedgeGeo2.computeVertexNormals()
    const wedgeMesh = new THREE.Mesh(wedgeGeo2, propMat)
    wedgeMesh.position.set(Math.cos(a) * 24, 0.05, Math.sin(a) * 24)
    wedgeMesh.rotation.y = a + Math.PI / 2
    wedgeMesh.castShadow = true
    wedgeMesh.receiveShadow = true
    scene.add(wedgeMesh)
  }

  // ── Plaza-ring lamp posts (the original 12) ───────────────────────────
  // Shared materials + geometry across the 12 plaza-ring lamps. Same params
  // as the highway-flanking lamps below (E3 wave-5 material consolidation).
  const ringPostMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
  const ringBulbMat = new THREE.MeshBasicMaterial({ color: 0xffe8a8 })
  const ringPostGeo = new THREE.CylinderGeometry(0.12, 0.12, 5, 8)
  const ringBulbGeo = new THREE.SphereGeometry(0.35, 12, 8)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r = 16
    const post = new THREE.Mesh(ringPostGeo, ringPostMat)
    post.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r)
    post.castShadow = true
    scene.add(post)
    const bulb = new THREE.Mesh(ringBulbGeo, ringBulbMat)
    bulb.position.set(post.position.x, 5, post.position.z)
    scene.add(bulb)
    const lp = new THREE.PointLight(0xffe8a8, 0.6, 12)
    lp.position.copy(bulb.position)
    scene.add(lp)
  }

  // ── Additional lamp posts flanking each radial highway (Wave 4 / D3).
  // For each of the 8 main monuments: 2 lamps at radius 22 and 2 at
  // radius 30, perpendicular-offset 3.4 units off the road centerline
  // (the road plane width is 4.5 in Highways.ts, so a 3.4u offset puts
  // the lamp clear of the road shoulder).
  // PointLight intensity kept low (0.45) and range tight (10) so the
  // 16 new lights don't kill perf or flatten the dusk mood.
  const monuments = options?.monuments ?? []
  if (monuments.length > 0) {
    // Reuse the ring-lamp materials and geometry — identical to these in
    // every way except position, so sharing keeps GPU upload + JS heap
    // tight (E3 wave-5 material consolidation).
    for (const m of monuments) {
      const angle = Math.atan2(m.position[0], m.position[1])
      const perpX = Math.cos(angle)
      const perpZ = -Math.sin(angle)
      const offsets: readonly number[] = [22, 30]
      for (const radial of offsets) {
        const cx = Math.sin(angle) * radial
        const cz = Math.cos(angle) * radial
        for (const side of [-1, 1] as const) {
          const lx = cx + perpX * 3.4 * side
          const lz = cz + perpZ * 3.4 * side
          const post = new THREE.Mesh(ringPostGeo, ringPostMat)
          post.position.set(lx, 2.5, lz)
          post.castShadow = true
          scene.add(post)
          const bulb = new THREE.Mesh(ringBulbGeo, ringBulbMat)
          bulb.position.set(lx, 5, lz)
          scene.add(bulb)
          const lp = new THREE.PointLight(0xffe8a8, 0.45, 10)
          lp.position.set(lx, 5, lz)
          scene.add(lp)
        }
      }
    }
  }

  // ── Distant mountain ring (Wave 4 / D3 — vision § 2). ────────────────
  // 24 instanced cone "peaks" at radius 105–115. Heights 18–30 units.
  // Random Y-rotation gives variety; per-instance color via the brand
  // palette (mauve / red-brown / sand-brown). Shadow casting OFF —
  // the directional light's shadow frustum is 80u square (see
  // SceneRoot.ts sun.shadow.camera) and the mountains live well
  // outside it, so casting shadows here would do nothing visible
  // anyway.
  const MOUNTAIN_COUNT = 24
  const mountainGeo = new THREE.ConeGeometry(11, 24, 6)
  const mountainMat = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
    vertexColors: false,
  })
  const mountains = new THREE.InstancedMesh(mountainGeo, mountainMat, MOUNTAIN_COUNT)
  mountains.castShadow = false
  mountains.receiveShadow = false
  const mtnDummy = new THREE.Object3D()
  // Per-instance color attribute (THREE auto-uses it when the material
  // does NOT enable vertexColors; for InstancedMesh we use setColorAt
  // which writes to its dedicated instanceColor attribute and works
  // with vertexColors=false).
  const mtnColor = new THREE.Color()
  for (let i = 0; i < MOUNTAIN_COUNT; i++) {
    const angle = (i / MOUNTAIN_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.18
    const r = 105 + Math.random() * 10
    const height = 18 + Math.random() * 12
    const radiusScale = 0.7 + Math.random() * 0.8 // peak-base width variety
    mtnDummy.position.set(Math.cos(angle) * r, height / 2 - 1, Math.sin(angle) * r)
    mtnDummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
    mtnDummy.scale.set(radiusScale, height / 24, radiusScale)
    mtnDummy.updateMatrix()
    mountains.setMatrixAt(i, mtnDummy.matrix)
    const c = MOUNTAIN_PALETTE[i % MOUNTAIN_PALETTE.length] ?? 0x3a2630
    mtnColor.setHex(c)
    mountains.setColorAt(i, mtnColor)
  }
  mountains.instanceMatrix.needsUpdate = true
  if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true
  scene.add(mountains)

  // ── Tree band (Wave 4 / D3) ───────────────────────────────────────────
  // 40–60 trees scattered in the grass band radius 50–100. 60% conifer
  // (cone on a slim trunk), 40% deciduous (icosahedron on a slim trunk).
  // Avoid placing within 5 units of any district plinth or within 3.5
  // units of a radial highway centerline.
  const TREE_TOTAL = 52
  const CONIFER_FRACTION = 0.6
  const conifers: { x: number; z: number; scale: number; rot: number }[] = []
  const deciduous: { x: number; z: number; scale: number; rot: number }[] = []

  // Precompute district angles for the road-buffer rejection test.
  const districtAngles = monuments.map((m) => Math.atan2(m.position[0], m.position[1]))

  let placed = 0
  let attempts = 0
  while (placed < TREE_TOTAL && attempts < TREE_TOTAL * 25) {
    attempts++
    const angle = Math.random() * Math.PI * 2
    const r = 50 + Math.random() * 50
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r

    // Reject if too close to any monument plinth (5u buffer).
    let tooCloseToPlinth = false
    for (const m of monuments) {
      if (Math.hypot(m.position[0] - x, m.position[1] - z) < 5) {
        tooCloseToPlinth = true
        break
      }
    }
    if (tooCloseToPlinth) continue

    // Reject if within ~3.5u perpendicular distance of any radial
    // highway centerline. The road runs from origin out along
    // (sin(α), cos(α)); the perpendicular distance from a point (x,z)
    // to that line is | x·cos(α) − z·sin(α) |.
    let tooCloseToRoad = false
    for (const roadAngle of districtAngles) {
      const perp = Math.abs(x * Math.cos(roadAngle) - z * Math.sin(roadAngle))
      // Also require the projection along the road direction to be
      // positive — only buffer the segment actually IN the road, not
      // its opposite-side mirror.
      const along = x * Math.sin(roadAngle) + z * Math.cos(roadAngle)
      if (perp < 3.5 && along > 6 && along < 50) {
        tooCloseToRoad = true
        break
      }
    }
    if (tooCloseToRoad) continue

    const scale = 0.85 + Math.random() * 0.7
    const rot = Math.random() * Math.PI * 2
    const isConifer = Math.random() < CONIFER_FRACTION
    if (isConifer) {
      conifers.push({ x, z, scale, rot })
    } else {
      deciduous.push({ x, z, scale, rot })
    }
    placed++
  }

  // Conifer canopy InstancedMesh (cone).
  const coniferCanopyGeo = new THREE.ConeGeometry(1.5, 4, 8)
  // Center the cone's pivot at its base so a unit-Y scale grows upward
  // from ground level.
  coniferCanopyGeo.translate(0, 2, 0)
  const coniferCanopyMat = new THREE.MeshStandardMaterial({
    color: TREE_CONIFER_NEEDLE,
    roughness: 0.8,
    metalness: 0.0,
    flatShading: true,
  })
  const coniferCanopy = new THREE.InstancedMesh(
    coniferCanopyGeo,
    coniferCanopyMat,
    Math.max(conifers.length, 1),
  )
  coniferCanopy.castShadow = true
  coniferCanopy.receiveShadow = true

  // Conifer trunk InstancedMesh (cylinder).
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1.5, 6)
  trunkGeo.translate(0, 0.75, 0) // base at y=0
  const trunkMat = new THREE.MeshStandardMaterial({
    color: TREE_TRUNK,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
  })
  const coniferTrunk = new THREE.InstancedMesh(
    trunkGeo,
    trunkMat,
    Math.max(conifers.length, 1),
  )
  coniferTrunk.castShadow = true
  coniferTrunk.receiveShadow = true

  // Deciduous canopy InstancedMesh (icosahedron).
  const decidCanopyGeo = new THREE.IcosahedronGeometry(1.8, 1)
  decidCanopyGeo.translate(0, 1.5, 0)
  const decidCanopyMat = new THREE.MeshStandardMaterial({
    color: TREE_DECIDUOUS_LEAF,
    roughness: 0.75,
    metalness: 0.0,
    flatShading: true,
  })
  const decidCanopy = new THREE.InstancedMesh(
    decidCanopyGeo,
    decidCanopyMat,
    Math.max(deciduous.length, 1),
  )
  decidCanopy.castShadow = true
  decidCanopy.receiveShadow = true

  // Reuse trunkGeo + trunkMat for the deciduous trunks so we don't
  // double the GPU upload. Separate InstancedMesh (different count).
  const decidTrunk = new THREE.InstancedMesh(
    trunkGeo,
    trunkMat,
    Math.max(deciduous.length, 1),
  )
  decidTrunk.castShadow = true
  decidTrunk.receiveShadow = true

  const treeDummy = new THREE.Object3D()
  conifers.forEach((t, i) => {
    // Canopy sits on top of trunk: trunk is 1.5u tall (translated so
    // base=0), conifer canopy is 4u tall with base=0 in its local
    // frame, so positioning both at world (x, 0, z) with the same
    // scale gives a "trunk shows through, cone tops it" silhouette
    // because the cone's wide base (radius 1.5) hides the trunk-top.
    // We push the canopy up by 1.5u so it actually sits on the trunk.
    treeDummy.position.set(t.x, 1.5 * t.scale, t.z)
    treeDummy.rotation.set(0, t.rot, 0)
    treeDummy.scale.set(t.scale, t.scale, t.scale)
    treeDummy.updateMatrix()
    coniferCanopy.setMatrixAt(i, treeDummy.matrix)
    // Trunk at ground.
    treeDummy.position.set(t.x, 0, t.z)
    treeDummy.updateMatrix()
    coniferTrunk.setMatrixAt(i, treeDummy.matrix)
  })
  deciduous.forEach((t, i) => {
    treeDummy.position.set(t.x, 1.5 * t.scale, t.z)
    treeDummy.rotation.set(0, t.rot, 0)
    treeDummy.scale.set(t.scale, t.scale, t.scale)
    treeDummy.updateMatrix()
    decidCanopy.setMatrixAt(i, treeDummy.matrix)
    treeDummy.position.set(t.x, 0, t.z)
    treeDummy.updateMatrix()
    decidTrunk.setMatrixAt(i, treeDummy.matrix)
  })
  coniferCanopy.instanceMatrix.needsUpdate = true
  coniferTrunk.instanceMatrix.needsUpdate = true
  decidCanopy.instanceMatrix.needsUpdate = true
  decidTrunk.instanceMatrix.needsUpdate = true

  // Hide empty instanced meshes (the Math.max(_, 1) gives us a
  // 1-instance mesh even when the array is empty — make it invisible
  // so it doesn't render a stray tree at the origin).
  if (conifers.length === 0) {
    coniferCanopy.visible = false
    coniferTrunk.visible = false
  }
  if (deciduous.length === 0) {
    decidCanopy.visible = false
    decidTrunk.visible = false
  }
  // Also clamp the instance count so unused tail-end slots in
  // Math.max(_, 1) don't render at the identity matrix.
  coniferCanopy.count = conifers.length || 0
  coniferTrunk.count = conifers.length || 0
  decidCanopy.count = deciduous.length || 0
  decidTrunk.count = deciduous.length || 0

  scene.add(coniferCanopy)
  scene.add(coniferTrunk)
  scene.add(decidCanopy)
  scene.add(decidTrunk)
}
