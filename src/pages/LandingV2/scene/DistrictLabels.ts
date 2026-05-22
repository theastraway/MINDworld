import * as THREE from 'three'
import type { District } from '../districts/types'

/**
 * Floating district name labels — one billboard sprite above each
 * monument showing the district title, visible from across the world.
 *
 * Why: until now you had to drive within 6u of a monument to see what
 * it is. Players naturally wandered blind. Labels solve "where do I go"
 * the moment you spawn — you can read MEMORY · GRAPH · MODELS etc.
 * from the orbit camera during the intro.
 *
 * Design: each label is a canvas-textured Sprite (billboards to camera
 * automatically). Brand-red text on transparent background with a soft
 * cream halo for legibility against any sky palette. Floats at altitude
 * 9 above the plinth (monument bodies max out ~6, so the label sits
 * just above the geometry without colliding).
 *
 * The hidden MINDsense Sanctuary does NOT get a label — it's hidden
 * by design until you find it.
 */

const LABEL_ALTITUDE = 9
const LABEL_SCALE_X = 10
const LABEL_SCALE_Y = 2.5
const CANVAS_W = 768
const CANVAS_H = 200

function makeLabelTexture(text: string, color: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')!

  // Halo — wide soft cream glow so the text reads against any background.
  const cream = '#f6e8d9'
  ctx.font = `900 88px -apple-system, "Inter", "Helvetica Neue", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Multiple stroke passes for a thick soft halo.
  ctx.strokeStyle = cream
  ctx.lineWidth = 18
  ctx.shadowColor = cream
  ctx.shadowBlur = 24
  ctx.strokeText(text, CANVAS_W / 2, CANVAS_H / 2)
  ctx.shadowBlur = 0

  // District-colored brand fill on top.
  const hex = '#' + color.toString(16).padStart(6, '0')
  ctx.fillStyle = hex
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2)

  // Brand-red underline accent.
  const underlineW = CANVAS_W * 0.55
  const underlineX = (CANVAS_W - underlineW) / 2
  ctx.fillStyle = '#F43F3F'
  ctx.fillRect(underlineX, CANVAS_H / 2 + 50, underlineW, 5)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export interface DistrictLabelsHandle {
  group: THREE.Group
  dispose: () => void
}

export function createDistrictLabels(districts: ReadonlyArray<District>): DistrictLabelsHandle {
  const group = new THREE.Group()
  const textures: THREE.CanvasTexture[] = []
  const materials: THREE.SpriteMaterial[] = []

  for (const d of districts) {
    if (d.hidden) continue // Sanctuary stays hidden by design

    const tex = makeLabelTexture(d.title.toUpperCase(), d.color)
    textures.push(tex)

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false, // labels should remain legible at distance
    })
    materials.push(mat)

    const sprite = new THREE.Sprite(mat)
    sprite.position.set(d.position[0], LABEL_ALTITUDE, d.position[1])
    sprite.scale.set(LABEL_SCALE_X, LABEL_SCALE_Y, 1)
    group.add(sprite)
  }

  const dispose = () => {
    for (const t of textures) t.dispose()
    for (const m of materials) m.dispose()
  }

  return { group, dispose }
}
