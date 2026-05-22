import * as THREE from 'three'
import type { Monument } from '../districts/types'

// Builds the radial road network: one paved arm from the central plaza out
// to each monument, dashed centerlines, a sign post and a colored sign
// board with a small white arrow.
//
// All meshes are added to `scene` directly (the road network is too granular
// to bother grouping). Caller owns disposal via the standard scene traversal.
export function buildHighways(scene: THREE.Scene, monuments: Monument[]): void {
  // Shared materials hoisted out of the per-monument loop. Each of these
  // was being re-allocated once per monument (×8) when one instance does
  // the job — same color, same params, no per-monument variation.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85, metalness: 0.0 })
  const roadMarkMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee })
  const signPostMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, flatShading: true })
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

  monuments.forEach((m) => {
    const start = new THREE.Vector3(0, 0, 0)
    const end = new THREE.Vector3(m.position[0], 0, m.position[1])
    const length = start.distanceTo(end) - 4 // stop before monument plinth
    const angle = Math.atan2(m.position[0], m.position[1])
    const roadGeo = new THREE.PlaneGeometry(4.5, length)
    roadGeo.rotateX(-Math.PI / 2)
    const road = new THREE.Mesh(roadGeo, roadMat)
    road.position.set(
      Math.sin(angle) * (length / 2 + 14),
      0.04,
      Math.cos(angle) * (length / 2 + 14)
    )
    road.rotation.y = angle
    road.receiveShadow = true
    scene.add(road)

    // Dashed road markings
    const dashCount = Math.floor(length / 3)
    for (let i = 0; i < dashCount; i++) {
      const t = (i + 0.5) / dashCount
      const dashGeo = new THREE.PlaneGeometry(0.18, 1.0)
      dashGeo.rotateX(-Math.PI / 2)
      const dash = new THREE.Mesh(dashGeo, roadMarkMat)
      const px = Math.sin(angle) * (14 + length * t)
      const pz = Math.cos(angle) * (14 + length * t)
      dash.position.set(px, 0.07, pz)
      dash.rotation.y = angle
      scene.add(dash)
    }

    // Sign post at start of each road (just outside plaza)
    const signPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8),
      signPostMat
    )
    const signX = Math.sin(angle) * 18
    const signZ = Math.cos(angle) * 18
    signPost.position.set(signX + Math.cos(angle) * 3.2, 1.6, signZ - Math.sin(angle) * 3.2)
    signPost.castShadow = true
    scene.add(signPost)

    // Sign board
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.9, 0.12),
      new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.4, flatShading: true, emissive: m.color, emissiveIntensity: 0.18 })
    )
    signBoard.position.copy(signPost.position)
    signBoard.position.y = 2.8
    signBoard.rotation.y = angle
    signBoard.castShadow = true
    scene.add(signBoard)
    // Arrow on sign board (white triangular block)
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.6, 3),
      arrowMat
    )
    arrow.rotation.z = -Math.PI / 2
    arrow.position.set(0.7, 0, 0.08)
    signBoard.add(arrow)
  })
}
