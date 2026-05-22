/**
 * Knowledge Graph Observatory — District 2 (northeast, [32, -12]).
 *
 * Per MIND_WORLD_VISION § 3 D2 + § 12: a HemisphereGeometry wireframe dome
 * containing a live 3D graph fetched from `GET /public/world-stats`
 * (B2 endpoint). Visualized as instanced spheres with edges. If the API is
 * unavailable, render a deterministic generative graph (NO fake numbers
 * shown anywhere — only geometry).
 *
 * Live-data integration is the headline behavior for this district. The
 * factory kicks off a `fetchWorldStats()` call at construction time and
 * resizes the node count once data arrives — but only the count drives
 * geometry, never user-facing numbers.
 *
 * Mesh budget: 1 dome (wireframe), 1 InstancedMesh of nodes (≤40),
 * 1 LineSegments for edges. ~3 draw calls.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { fetchWorldStats } from '../../live/liveData'
import { createDistrictShell, seeded, stdMat } from './_shared'

const MAX_NODES = 40
const MIN_NODES = 12

export function buildKnowledgeGraphObservatory(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Geodesic dome (wireframe) ────────────────────────────────────────
  const domeGeo = new THREE.SphereGeometry(3.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  const dome = new THREE.LineSegments(
    new THREE.WireframeGeometry(domeGeo),
    new THREE.LineBasicMaterial({ color: d.color, transparent: true, opacity: 0.55 })
  )
  dome.position.y = 0.4
  sculpt.add(dome)

  // Open dome rim — solid ring for visual anchor
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.09, 8, 32),
    new THREE.MeshBasicMaterial({ color: d.color })
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.4
  sculpt.add(rim)

  // ── Initial node layout (deterministic; resizes when live data lands) ──
  // Build a max-size instanced mesh and only mark MIN_NODES visible. When
  // fetchWorldStats resolves, scale up to MAX_NODES if entities are present.
  const nodeGeo = new THREE.IcosahedronGeometry(0.16, 0)
  const nodeMat = stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.6 })
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, MAX_NODES)

  // Edge geometry: pre-allocate up to MAX_NODES*2 line segments.
  const edgePositions = new Float32Array(MAX_NODES * 2 * 3)
  const edgeGeo = new THREE.BufferGeometry()
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3))
  const edgeMat = new THREE.LineBasicMaterial({
    color: d.color,
    transparent: true,
    opacity: 0.45,
  })
  const edges = new THREE.LineSegments(edgeGeo, edgeMat)

  const seedX = d.position[0]
  const seedZ = d.position[1]

  const positionsByIdx: THREE.Vector3[] = []
  for (let i = 0; i < MAX_NODES; i++) {
    // Fibonacci-sphere-ish distribution capped to upper hemisphere
    const phi = Math.acos(1 - (seeded(seedX, i) * 0.85 + 0.05))
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    const r = 2.4 + seeded(seedZ, i) * 0.6
    const v = new THREE.Vector3(
      r * Math.cos(theta) * Math.sin(phi),
      0.6 + r * 0.6 + Math.abs(Math.cos(phi)) * 1.2,
      r * Math.sin(theta) * Math.sin(phi)
    )
    positionsByIdx.push(v)
  }

  function applyNodeCount(visible: number) {
    const clamped = Math.max(MIN_NODES, Math.min(MAX_NODES, visible))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3(1, 1, 1)
    const hidden = new THREE.Vector3(0, -1000, 0)
    for (let i = 0; i < MAX_NODES; i++) {
      const p = i < clamped ? positionsByIdx[i] : hidden
      m.compose(p, q, s)
      nodes.setMatrixAt(i, m)
    }
    nodes.instanceMatrix.needsUpdate = true

    // Rebuild edges: connect each visible node to its 2 nearest visible nodes
    let edgeIdx = 0
    for (let i = 0; i < clamped; i++) {
      const a = positionsByIdx[i]
      const others = positionsByIdx
        .slice(0, clamped)
        .map((b, j) => ({ b, j, d: a.distanceTo(b) }))
        .filter((x) => x.j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
      for (const { b } of others) {
        if (edgeIdx >= edgePositions.length) break
        edgePositions[edgeIdx++] = a.x
        edgePositions[edgeIdx++] = a.y
        edgePositions[edgeIdx++] = a.z
        edgePositions[edgeIdx++] = b.x
        edgePositions[edgeIdx++] = b.y
        edgePositions[edgeIdx++] = b.z
      }
    }
    // Zero out remaining edge slots
    for (let i = edgeIdx; i < edgePositions.length; i++) edgePositions[i] = 0
    edgeGeo.attributes.position.needsUpdate = true
    edgeGeo.setDrawRange(0, edgeIdx / 3)
  }

  // Initial render: MIN_NODES so something visible immediately
  applyNodeCount(MIN_NODES)
  sculpt.add(nodes)
  sculpt.add(edges)

  // ── Live data integration ────────────────────────────────────────────
  // Non-blocking. If the call succeeds and entity_count > 0, scale node
  // visibility proportionally (log10 mapped into [MIN_NODES, MAX_NODES]).
  // NEVER show a fake number — geometry-only response.
  fetchWorldStats()
    .then((stats) => {
      if (!stats || typeof stats.entity_count !== 'number') return
      const ec = stats.entity_count
      if (ec <= 0) return
      // Map log10(ec) to node count. ec=10 → ~12, ec=1000 → ~24, ec=100k → ~40.
      const visible = Math.round(MIN_NODES + (MAX_NODES - MIN_NODES) * Math.min(1, Math.log10(ec + 1) / 5))
      applyNodeCount(visible)
    })
    .catch(() => {
      /* swallow — generative fallback is fine */
    })

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
