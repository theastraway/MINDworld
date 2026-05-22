/**
 * Life Board City — District 6 (southwest, [-38, -20]).
 *
 * Per MIND_WORLD_VISION § 3 D6: floating kanban-card buildings. Each "building"
 * is a giant Trello-style card with sample task text. Cards drift gently
 * up-and-down (the existing SceneRoot animation loop already bobs the sculpt
 * group; we add per-card noise inside userData for finer movement in Wave 4).
 *
 * 5 floating cards — instanced via real meshes (not InstancedMesh) since each
 * needs a distinct text label.
 *
 * Mesh budget: 5 card boxes + 5 brand accent strips + 5 label planes = 15.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, createTextLabelTexture, stdMat } from './_shared'

const SAMPLE_CARDS: Array<{ text: string }> = [
  { text: 'Ship MIND v2' },
  { text: 'Call Dad' },
  { text: 'KGC pitch' },
  { text: 'Run 5k' },
  { text: 'Read for 30 min' },
]

export function buildLifeBoardCity(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  SAMPLE_CARDS.forEach((c, i) => {
    // Slight stagger so they don't lock-step bob in the animation loop.
    const x = (i - 2) * 1.2
    const z = (i % 2 === 0 ? 1 : -1) * 0.4
    const y = 1.4 + i * 0.7

    const cardGroup = new THREE.Group()
    cardGroup.position.set(x, y, z)
    cardGroup.rotation.set(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.05
    )
    // Stamp per-card bob phase so a Wave 4 polish pass can read it without
    // recomputing.
    cardGroup.userData = { bobPhase: i * 0.7 }

    // Card body
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.3, 0.12),
      stdMat(0xffffff)
    )
    card.castShadow = true
    cardGroup.add(card)

    // Brand accent strip on left edge
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.3, 0.14),
      new THREE.MeshBasicMaterial({ color: d.color })
    )
    strip.position.x = -0.94
    cardGroup.add(strip)

    // Text label on the front
    const labelTex = createTextLabelTexture(c.text, '#222222', null, 80, 512, 256)
    const labelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.85),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
    )
    labelPlane.position.z = 0.07
    cardGroup.add(labelPlane)

    sculpt.add(cardGroup)
  })

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
