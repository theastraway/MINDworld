/**
 * Agent Town — District 4 (southeast, [22, -36]).
 *
 * Per MIND_WORLD_VISION § 3 D4: Town Hall + 6 placeholder cylindrical pylons
 * where NPCs will go. The NPCs themselves are Wave 4 / D2 work — we lay out
 * the town infrastructure so D2 can drop animated bipeds onto the pylons.
 *
 * Mesh budget: 1 Town Hall (composite of ~6 shapes) + 6 pylons + 6 NPC
 * placeholder cubes + flag = ~20 meshes.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, stdMat } from './_shared'

export function buildAgentTown(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Town Hall: hexagonal base + sloped roof + clock tower ─────────────
  const hallBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.1, 2.4, 6),
    stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.12 })
  )
  hallBase.position.y = 1.2
  hallBase.castShadow = true
  sculpt.add(hallBase)

  // Roof: cone over the hex base
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.3, 1.4, 6),
    stdMat(0x2c2c2c)
  )
  roof.position.y = 3.1
  roof.castShadow = true
  sculpt.add(roof)

  // Clock tower in front, rising above the roof
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 4.5, 0.85),
    stdMat(0xe8e8e8)
  )
  tower.position.set(0, 2.25, 1.6)
  tower.castShadow = true
  sculpt.add(tower)

  // Clock face — disc on the tower
  const clock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24),
    stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.45 })
  )
  clock.rotation.x = Math.PI / 2
  clock.position.set(0, 3.9, 2.04)
  sculpt.add(clock)

  // Flag on top of clock tower
  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6),
    stdMat(0x222222)
  )
  flagPole.position.set(0, 5.2, 1.6)
  sculpt.add(flagPole)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshBasicMaterial({ color: d.color, side: THREE.DoubleSide })
  )
  flag.position.set(0.45, 5.55, 1.6)
  sculpt.add(flag)

  // ── 6 cylindrical pylons in a circle around the Town Hall ────────────
  // Wave 4 / D2 (scene/Npcs.ts) walks 6 animated bipeds around the town
  // freely (NOT on the pylons — the bipeds need to walk a loose 12-unit
  // radius path, not stand on plinths). We keep the pylons as a "stage"
  // motif visible when no NPCs are nearby, and drop the placeholder
  // cubes/heads/eyes since the live NPCs supersede them.
  const PYLON_COUNT = 6
  const pylonRadius = 4.8
  for (let i = 0; i < PYLON_COUNT; i++) {
    const angle = (i / PYLON_COUNT) * Math.PI * 2
    const x = Math.cos(angle) * pylonRadius
    const z = Math.sin(angle) * pylonRadius

    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.4, 12),
      stdMat(0x9a9a9a)
    )
    pylon.position.set(x, 0.2, z)
    pylon.castShadow = true
    pylon.receiveShadow = true
    sculpt.add(pylon)
  }

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
