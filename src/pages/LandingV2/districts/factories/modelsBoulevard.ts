/**
 * Models Boulevard — District 3 (east, [14, 36]).
 *
 * Per MIND_WORLD_VISION § 3 D3: a boulevard of model towers — each tower is
 * a tall colored prism with a brand-colored CANVAS-TEXTURE TEXT LABEL.
 * **Use TEXT labels, NEVER real provider logos** — trademark-safe.
 *
 * 8 named towers (Claude, GPT, Gemini, Grok, DeepSeek, Llama, Mistral, Qwen)
 * + 30 smaller silhouette prisms in a fan layout labeled "and 40+ more".
 *
 * Provider colors per § 3:
 *   Claude #D97757 · GPT #10A37F · Gemini #4285F4 · Grok #000000 (white text)
 *   DeepSeek #4D6BFE · Llama #0866FF · Mistral #FF7000 · Qwen #615CED
 *
 * Mesh budget: 8 named tower meshes + 8 label sprites + 1 InstancedMesh for
 * 30 silhouette prisms + 1 "and 40+ more" sign = ~18 draw calls.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, createTextLabelTexture, seeded, stdMat } from './_shared'

interface ProviderSpec {
  label: string
  color: number
  /** Text color on the label sprite — usually white, except black background. */
  textColor: string
}

// ORDER MATTERS — drives left-to-right boulevard position.
const PROVIDERS: ProviderSpec[] = [
  { label: 'CLAUDE', color: 0xd97757, textColor: '#ffffff' },
  { label: 'GPT', color: 0x10a37f, textColor: '#ffffff' },
  { label: 'GEMINI', color: 0x4285f4, textColor: '#ffffff' },
  { label: 'GROK', color: 0x101010, textColor: '#ffffff' },
  { label: 'DEEPSEEK', color: 0x4d6bfe, textColor: '#ffffff' },
  { label: 'LLAMA', color: 0x0866ff, textColor: '#ffffff' },
  { label: 'MISTRAL', color: 0xff7000, textColor: '#ffffff' },
  { label: 'QWEN', color: 0x615ced, textColor: '#ffffff' },
]

const SILHOUETTE_COUNT = 30

export function buildModelsBoulevard(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── 8 named provider towers, fanned along the boulevard ─────────────
  // Each tower: tall colored prism + a "billboard plane" facing the camera
  // axis (we render double-sided so the text reads from both sides as the
  // car drives by).
  const towerWidth = 1.1
  const towerDepth = 1.1
  const spacing = 2.4 // distance between tower centers along the row

  // Lay out 8 towers in two staggered rows of 4 for visual interest.
  PROVIDERS.forEach((p, i) => {
    const row = i < 4 ? 0 : 1
    const col = i % 4
    const x = (col - 1.5) * spacing
    const z = row === 0 ? -1.6 : 1.6
    const height = 4.5 + (i % 3) * 0.7

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(towerWidth, height, towerDepth),
      stdMat(p.color, { emissive: p.color, emissiveIntensity: 0.18 })
    )
    tower.position.set(x, height / 2 + 0.5, z)
    tower.castShadow = true
    sculpt.add(tower)

    // Label plane sitting just below the top of the tower, double-sided.
    // Canvas-rendered TEXT — trademark-safe, NOT a real logo.
    const labelTex = createTextLabelTexture(p.label, p.textColor, null, 110, 512, 192)
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTex,
      transparent: true,
      side: THREE.DoubleSide,
    })
    const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), labelMat)
    // Two label planes — one on each broad face so it reads from both directions
    labelPlane.position.set(x, height + 0.2, z + towerDepth / 2 + 0.02)
    sculpt.add(labelPlane)

    const labelPlaneBack = labelPlane.clone()
    labelPlaneBack.material = labelMat.clone()
    labelPlaneBack.position.set(x, height + 0.2, z - towerDepth / 2 - 0.02)
    labelPlaneBack.rotation.y = Math.PI
    sculpt.add(labelPlaneBack)
  })

  // ── 30 silhouette prisms — "and 40+ more" ───────────────────────────
  // Single InstancedMesh of small prisms scattered behind the named towers.
  const silhouetteGeo = new THREE.BoxGeometry(0.4, 1, 0.4)
  const silhouetteMat = new THREE.MeshStandardMaterial({
    color: 0x444b58,
    roughness: 0.6,
    metalness: 0.15,
    flatShading: true,
  })
  const silhouettes = new THREE.InstancedMesh(silhouetteGeo, silhouetteMat, SILHOUETTE_COUNT)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const seedX = d.position[0]
  const seedZ = d.position[1]
  for (let i = 0; i < SILHOUETTE_COUNT; i++) {
    const r = 4.5 + seeded(seedX, i) * 2.5
    const a = seeded(seedZ, i) * Math.PI * 2
    const h = 0.8 + seeded(seedX, i * 7) * 2.5
    const p = new THREE.Vector3(Math.cos(a) * r, h / 2 + 0.5, Math.sin(a) * r)
    const s = new THREE.Vector3(1, h, 1)
    m.compose(p, q, s)
    silhouettes.setMatrixAt(i, m)
  }
  silhouettes.instanceMatrix.needsUpdate = true
  silhouettes.castShadow = true
  sculpt.add(silhouettes)

  // ── "and 40+ more" sign ──────────────────────────────────────────────
  const moreTex = createTextLabelTexture('and 40+ more', '#ffffff', null, 60, 512, 128)
  const moreSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: moreTex, transparent: true, side: THREE.DoubleSide })
  )
  moreSign.position.set(0, 6.4, 0)
  sculpt.add(moreSign)

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
