import * as THREE from 'three'

/**
 * Welcome billboard — a freestanding 3D sign south of the plaza that
 * greets the player on spawn. Two stacked panels on a metal post:
 *
 *   [ WELCOME TO MIND WORLD ]
 *   [ Drive · WASD · Discover ]
 *
 * Position: (0, 0, 42) — behind the car spawn (z=18), facing north so
 * the FACE points toward the car + tower. Player sees the back of the
 * sign at first but as they drive forward + the camera follows, the
 * front lights up the moment they brush past it.
 *
 * Visual: brand-cream sign face with brand-red border + emissive
 * underline (caught by bloom). Post in dark steel. Slight breeze sway
 * via update() on a 0.3 Hz sine.
 */

const SIGN_WIDTH = 16
const SIGN_TITLE_HEIGHT = 3.2
const SIGN_SUB_HEIGHT = 1.6
const SIGN_BOTTOM_Y = 4
const POST_HEIGHT = 5
// Positioned just outside the intro-orbit radius (which is 16 around the
// car at z=18). At z=37 the orbit camera sweeps right past it on the
// south arc, putting "WELCOME TO MIND WORLD" in the establishing shot.
// HEADING = 0 → sign face points back toward the orbit center (south
// face of sign visible from the camera's south-arc positions).
const POSITION = new THREE.Vector3(0, 0, 37)
const HEADING = 0

function makeSignTexture(line: string, opts: { size?: number; isTitle: boolean }): THREE.CanvasTexture {
  const w = 1024
  const h = opts.isTitle ? 220 : 110
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Cream background with rounded brand-red border.
  ctx.fillStyle = '#f6e8d9'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#F43F3F'
  ctx.lineWidth = opts.isTitle ? 8 : 5
  ctx.strokeRect(0, 0, w, h)

  // Brand-red underline (emissive-adjacent — bloom will catch it).
  ctx.fillStyle = '#F43F3F'
  ctx.fillRect(0, h - (opts.isTitle ? 18 : 10), w, opts.isTitle ? 14 : 7)

  // Text — heavy sans, slightly tracked.
  ctx.fillStyle = '#101012'
  const fontSize = opts.size ?? (opts.isTitle ? 120 : 56)
  ctx.font = `900 ${fontSize}px -apple-system, "Inter", "Helvetica Neue", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(line, w / 2, h / 2 - 4)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export interface BillboardHandle {
  group: THREE.Group
  update: (time: number) => void
  dispose: () => void
}

export function createWelcomeBillboard(): BillboardHandle {
  const group = new THREE.Group()
  group.position.copy(POSITION)
  group.rotation.y = HEADING

  // Posts — two thin steel columns at ±SIGN_WIDTH/2.
  const postGeo = new THREE.CylinderGeometry(0.12, 0.16, POST_HEIGHT + SIGN_TITLE_HEIGHT + SIGN_SUB_HEIGHT + 0.4, 8)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 })
  const postY = (POST_HEIGHT + SIGN_TITLE_HEIGHT + SIGN_SUB_HEIGHT + 0.4) / 2
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(sign * (SIGN_WIDTH / 2 - 0.4), postY, 0)
    post.castShadow = true
    group.add(post)
  }

  // Title panel — front-facing texture, simple plane.
  const titleTex = makeSignTexture('WELCOME TO MIND WORLD', { isTitle: true })
  const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, side: THREE.DoubleSide, transparent: false })
  const titleGeo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_TITLE_HEIGHT)
  const titlePanel = new THREE.Mesh(titleGeo, titleMat)
  titlePanel.position.y = SIGN_BOTTOM_Y + SIGN_SUB_HEIGHT + 0.2 + SIGN_TITLE_HEIGHT / 2
  group.add(titlePanel)

  // Subtitle panel — smaller, below.
  const subTex = makeSignTexture('Drive · WASD · Discover', { isTitle: false })
  const subMat = new THREE.MeshBasicMaterial({ map: subTex, side: THREE.DoubleSide, transparent: false })
  const subGeo = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_SUB_HEIGHT)
  const subPanel = new THREE.Mesh(subGeo, subMat)
  subPanel.position.y = SIGN_BOTTOM_Y + SIGN_SUB_HEIGHT / 2
  group.add(subPanel)

  // Brand-red emissive accent strip at the top — bloom-friendly hot edge.
  const accentGeo = new THREE.BoxGeometry(SIGN_WIDTH + 0.2, 0.18, 0.12)
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xF43F3F,
    emissive: 0xFF5A5A,
    emissiveIntensity: 1.4,
  })
  const accent = new THREE.Mesh(accentGeo, accentMat)
  accent.position.y = SIGN_BOTTOM_Y + SIGN_SUB_HEIGHT + 0.2 + SIGN_TITLE_HEIGHT + 0.18
  group.add(accent)

  // Gentle breeze sway — rotate the WHOLE billboard by ±0.6° around the
  // post axis. Reads as "freestanding sign moving with the air."
  const baseHeading = HEADING
  const update = (time: number) => {
    group.rotation.y = baseHeading + Math.sin(time * 0.3) * 0.011
  }

  const dispose = () => {
    postGeo.dispose()
    postMat.dispose()
    titleGeo.dispose()
    titleMat.dispose()
    titleTex.dispose()
    subGeo.dispose()
    subMat.dispose()
    subTex.dispose()
    accentGeo.dispose()
    accentMat.dispose()
  }

  return { group, update, dispose }
}
