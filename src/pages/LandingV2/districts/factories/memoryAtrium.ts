/**
 * Memory Atrium — District 1 (north, [0, -42]).
 *
 * Per MIND_WORLD_VISION § 3 D1: crystalline translucent archive building
 * (3-tier ziggurat geometry, frosted glass via MeshPhysicalMaterial w/
 * transmission). Inside: floating glowing books on shelves (instanced for
 * perf — target ~80 books). Brand red emissive.
 *
 * Mesh budget: ~10 ziggurat slabs + 1 InstancedMesh of 80 books = ~11 draw
 * calls. Well inside the ≤200-mesh per-district budget.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, seeded, stdMat } from './_shared'

const BOOK_COUNT = 80

export function buildMemoryAtrium(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Ziggurat: 3 tiers of translucent glass ───────────────────────────
  // Frosted glass via MeshPhysicalMaterial (transmission). Falls back
  // gracefully to plain mesh on older renderers.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.15,
    transmission: 0.85,
    thickness: 0.6,
    ior: 1.4,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  })

  const tier1 = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 5), glass)
  tier1.position.y = 1.2
  tier1.castShadow = true
  sculpt.add(tier1)

  const tier2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 3.6), glass)
  tier2.position.y = 2.6
  tier2.castShadow = true
  sculpt.add(tier2)

  const tier3 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), glass)
  tier3.position.y = 4.0
  tier3.castShadow = true
  sculpt.add(tier3)

  // Crowning crystal on top — solid emissive
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85, 0),
    stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.7 })
  )
  crystal.position.y = 5.2
  crystal.castShadow = true
  sculpt.add(crystal)

  // ── Instanced glowing books inside ───────────────────────────────────
  // Single InstancedMesh: 80 small boxes positioned in three shelf bands.
  const bookGeo = new THREE.BoxGeometry(0.45, 0.7, 0.18)
  const bookMat = new THREE.MeshStandardMaterial({
    color: 0xffd6d6,
    emissive: d.color,
    emissiveIntensity: 0.35,
    roughness: 0.55,
    metalness: 0.2,
    flatShading: true,
  })
  const books = new THREE.InstancedMesh(bookGeo, bookMat, BOOK_COUNT)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3(1, 1, 1)
  const p = new THREE.Vector3()
  const e = new THREE.Euler()

  for (let i = 0; i < BOOK_COUNT; i++) {
    const tier = i < 36 ? 0 : i < 60 ? 1 : 2
    const radius = tier === 0 ? 2.0 : tier === 1 ? 1.4 : 0.85
    const y = tier === 0 ? 0.9 : tier === 1 ? 2.3 : 3.7
    const angle = (i / (tier === 0 ? 36 : tier === 1 ? 24 : 20)) * Math.PI * 2
    const wobble = (seeded(d.position[0] + d.position[1], i) - 0.5) * 0.15
    p.set(
      Math.cos(angle) * (radius + wobble),
      y + (seeded(d.position[0], i * 3) - 0.5) * 0.2,
      Math.sin(angle) * (radius + wobble)
    )
    e.set(0, -angle + Math.PI / 2, 0)
    q.setFromEuler(e)
    m.compose(p, q, s)
    books.setMatrixAt(i, m)
  }
  books.instanceMatrix.needsUpdate = true
  books.castShadow = false // perf — 80 shadow casters is too many here
  sculpt.add(books)

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
