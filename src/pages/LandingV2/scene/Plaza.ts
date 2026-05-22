import * as THREE from 'three'

import { fetchWorldStats, type WorldStats } from '../live/liveData'

/**
 * Plaza + MIND Tower build (LandingV2 Wave 2, B3 scope).
 *
 * What lives in this module:
 *   1. The central plaza disc, brand-red brand ring, cream outer accent
 *      ring (placeholder for the Founder Stone easter egg), and 4 brand-gold
 *      cardinal inlays at radius 14.
 *   2. The MIND Tower obelisk at scene origin — 4 stacked M-I-N-D letter
 *      prisms reading top-to-bottom (M at top, D at bottom), each a
 *      BoxGeometry with the existing letter PNG on its front face and a
 *      brand-red emissive material on the other 5 faces, capped by a slim
 *      pyramidal cone in brand red.
 *   3. The intensified pillar-of-light beam (kept + widened + taller). Its
 *      base opacity responds to a `summit` flag on the build handle —
 *      hard-coded false here; Wave 3 C2 (Summit) will wire the toggle.
 *   4. The live-stats ring of canvas-texture sprites floating at altitude
 *      84. The fetch is fire-and-forget; if `GET /public/world-stats` is
 *      unavailable (404, network, or absent endpoint — B2 ships next wave)
 *      the ring stays hidden. NEVER fabricated numbers.
 *   5. The existing 4 orbiting MIND letters (the garage halo around the
 *      car at spawn) — preserved untouched at radius 8, altitude 7.
 *
 * The caller drives the per-frame animation via {@link PlazaBuild.update}
 * — pass `time` (clock seconds) every frame and the module handles beam
 * pulse, tower emissive pulse, stats-ring rotation, and letter orbit.
 */

const BRAND_RED = 0xf43f3f
const BRAND_RED_EMISSIVE = 0xff5a5a
const BRAND_GOLD = 0xffcc4d
const ACCENT_CREAM = 0xf6e8d9

// Tower layout — 4 letters stacked, each prism 18 units tall.
// D bottom (y center 9), N (27), I (45), M top (63); cap above to y=78.
const TOWER_LETTER_HEIGHT = 18
const TOWER_LETTER_WIDTH = 12
const TOWER_LETTER_DEPTH = 6
const TOWER_LETTER_CENTERS: ReadonlyArray<{ letter: 'M' | 'I' | 'N' | 'D'; y: number }> = [
  { letter: 'D', y: 9 },
  { letter: 'N', y: 27 },
  { letter: 'I', y: 45 },
  { letter: 'M', y: 63 },
]

// Stats ring — sits above the tower (tower top edge y=72, cap to y=78).
const STATS_RING_ALTITUDE = 84
const STATS_RING_RADIUS = 14
const STATS_RING_ROTATION_SPEED = 0.05 // rad / sec
const STATS_SPRITE_MAX = 6

export interface PlazaBuild {
  // Meshes that get attached directly to the scene root
  plaza: THREE.Mesh
  plazaRing: THREE.Mesh
  /** Cream outer accent at r=16.5 (Founder Stone placeholder per § 13 egg 4). */
  outerAccentRing: THREE.Mesh
  /** Brand-gold inlays at cardinal points of the plaza (radius 14). */
  cardinalInlays: THREE.Mesh[]
  /** The intensified pillar-of-light beam. */
  beam: THREE.Mesh
  /** The MIND Tower obelisk group (origin-centered, 78 units tall). */
  tower: THREE.Group
  /** Live-stats ring group (hidden until the API returns data). */
  statsRing: THREE.Group
  /** Existing 4 M-I-N-D letters orbiting around the spawn area. */
  letterMeshes: THREE.Mesh[]

  /**
   * Per-frame animation tick. Pass `clock.getElapsedTime()` and the camera
   * (so the orbit letters can billboard toward it). The summit flag
   * saturates the beam opacity from ambient 0.18 to 0.45 once the user
   * triggers the Wave 3 C2 cinematic.
   */
  update(time: number, camera: THREE.Camera, summit?: boolean): void
}

/**
 * Creates a square `BoxGeometry` with a different material on its front
 * face vs. the rest. Used for each letter prism in the MIND Tower — front
 * face shows the letter PNG over a brand-red base, the other 5 faces are
 * solid brand-red emissive.
 *
 * BoxGeometry material face order: [+X, -X, +Y, -Y, +Z, -Z]. We map the
 * letter texture to +Z (the "front" toward the spawn road at z=18).
 */
function createTowerLetterPrism(letter: 'M' | 'I' | 'N' | 'D', textureLoader: THREE.TextureLoader): THREE.Mesh {
  const tex = textureLoader.load(`/${letter}.png`)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8

  const solidEmissive = new THREE.MeshStandardMaterial({
    color: BRAND_RED,
    emissive: BRAND_RED_EMISSIVE,
    emissiveIntensity: 0.55,
    roughness: 0.45,
    metalness: 0.15,
  })

  // Front face: same emissive backing + the letter PNG overlaid via map +
  // alphaTest so the transparent areas of the PNG reveal the red base.
  // Using a single material with alphaTest avoids the dreaded "z-fighting
  // on a separate plane glued to the box" while still letting the PNG
  // read crisply.
  const front = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    emissive: BRAND_RED_EMISSIVE,
    emissiveMap: tex,
    emissiveIntensity: 0.95,
    transparent: true,
    alphaTest: 0.08,
    roughness: 0.35,
    metalness: 0.1,
    side: THREE.FrontSide,
  })

  const geo = new THREE.BoxGeometry(TOWER_LETTER_WIDTH, TOWER_LETTER_HEIGHT, TOWER_LETTER_DEPTH)
  // Material array — +X, -X, +Y, -Y, +Z (front), -Z
  const mesh = new THREE.Mesh(geo, [solidEmissive, solidEmissive, solidEmissive, solidEmissive, front, solidEmissive])
  mesh.castShadow = true
  mesh.receiveShadow = true
  // Tag the front material for the emissive-pulse animation.
  mesh.userData.frontMaterial = front
  mesh.userData.sideMaterial = solidEmissive
  return mesh
}

/**
 * Builds the MIND Tower obelisk + cap. Centered at origin, extending from
 * y=0 to y=78 (4 letter prisms + slim cap pyramid).
 */
function createMindTower(loadingManager?: THREE.LoadingManager): THREE.Group {
  const group = new THREE.Group()
  group.position.set(0, 0, 0)
  const textureLoader = new THREE.TextureLoader(loadingManager)

  const animatedFronts: THREE.MeshStandardMaterial[] = []
  const animatedSides: THREE.MeshStandardMaterial[] = []
  TOWER_LETTER_CENTERS.forEach(({ letter, y }) => {
    const prism = createTowerLetterPrism(letter, textureLoader)
    prism.position.y = y
    group.add(prism)
    animatedFronts.push(prism.userData.frontMaterial as THREE.MeshStandardMaterial)
    animatedSides.push(prism.userData.sideMaterial as THREE.MeshStandardMaterial)
  })

  // Brand-red emissive cap — slim square-base pyramid (ConeGeometry with 4
  // radial segments) sitting on top of the M prism from y=72 to y=78.
  const capGeo = new THREE.ConeGeometry(2, 6, 4)
  const capMat = new THREE.MeshStandardMaterial({
    color: BRAND_RED,
    emissive: BRAND_RED_EMISSIVE,
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0.25,
  })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.y = 75
  cap.rotation.y = Math.PI / 4 // diamond orientation
  cap.castShadow = true
  group.add(cap)

  // ── Energy rings — 3 brand-red emissive rings that travel up the tower
  // on a 4-second loop. Bloom in PostFX makes them read as light pulses
  // climbing the obelisk — like signal propagating through a column of
  // memory. Position is animated by the Plaza update() loop below.
  const ringGeo = new THREE.TorusGeometry(7.5, 0.18, 6, 32)
  const ringMat = new THREE.MeshStandardMaterial({
    color: BRAND_RED,
    emissive: BRAND_RED_EMISSIVE,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0.85,
    roughness: 0.4,
    metalness: 0.3,
  })
  const energyRings: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2 // horizontal
    // Stagger initial y so the three pulses are evenly spaced through
    // the climb cycle. update() reassigns each frame.
    ring.position.y = 6 + i * 22
    group.add(ring)
    energyRings.push(ring)
  }

  group.userData.animatedFronts = animatedFronts
  group.userData.animatedSides = animatedSides
  group.userData.capMaterial = capMat
  group.userData.energyRings = energyRings
  return group
}

/**
 * Builds a transparent canvas-texture sprite that reads as "<NUMBER> LABEL".
 * Brand-red number, off-white label. Returns a Sprite ready to drop into
 * the stats ring.
 */
function createStatSprite(numberText: string, label: string): THREE.Sprite {
  const W = 512
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // Truly impossible on every modern browser, but TS requires the guard.
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }))
  }

  ctx.clearRect(0, 0, W, H)
  // Brand-red number — large, bold, with a soft glow shadow.
  ctx.fillStyle = '#F43F3F'
  ctx.font = '700 64px "Inter", "Helvetica Neue", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(244, 63, 63, 0.55)'
  ctx.shadowBlur = 18
  ctx.fillText(numberText, W / 2, 50)

  // White label — smaller, letter-spaced.
  ctx.shadowBlur = 0
  ctx.fillStyle = '#F8F4EE'
  ctx.font = '500 26px "Inter", "Helvetica Neue", system-ui, sans-serif'
  ctx.fillText(label, W / 2, 104)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })
  const sprite = new THREE.Sprite(mat)
  // Scale picked to read at 36-unit camera distance — same scale used by
  // the existing monument label dots in buildMonument.
  sprite.scale.set(8, 2, 1)
  return sprite
}

/**
 * Formats an integer with thousands separators using en-US locale. Kept
 * separate so the format is predictable in tests + visual review.
 */
function formatStatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Builds the stats-ring group around the tower at altitude 84. Returns an
 * empty group when data is null — caller leaves it in the scene and the
 * later async fetch can populate it.
 */
function populateStatsRing(group: THREE.Group, stats: WorldStats | null): void {
  // Clear any previously-rendered sprites (sessionStorage hit shouldn't
  // double-add, but defensive).
  while (group.children.length) {
    const child = group.children[0]
    group.remove(child)
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  }

  if (!stats) {
    group.visible = false
    return
  }

  // Build the list of (number, label) pairs ONLY for fields the API
  // actually returned. NEVER invent a label for a missing field.
  const entries: Array<{ value: number; label: string }> = []
  if (stats.entity_count !== undefined) {
    entries.push({ value: stats.entity_count, label: 'ENTITIES' })
  }
  if (stats.relationship_count !== undefined) {
    entries.push({ value: stats.relationship_count, label: 'RELATIONSHIPS' })
  }
  if (stats.model_count !== undefined) {
    entries.push({ value: stats.model_count, label: 'AI MODELS' })
  }
  if (stats.user_count_approx !== undefined) {
    entries.push({ value: stats.user_count_approx, label: 'MINDS' })
  }

  if (entries.length === 0) {
    group.visible = false
    return
  }

  const cap = Math.min(entries.length, STATS_SPRITE_MAX)
  for (let i = 0; i < cap; i++) {
    const { value, label } = entries[i]
    const sprite = createStatSprite(formatStatNumber(value), label)
    const angle = (i / cap) * Math.PI * 2
    sprite.position.set(Math.cos(angle) * STATS_RING_RADIUS, 0, Math.sin(angle) * STATS_RING_RADIUS)
    group.add(sprite)
  }
  group.visible = true
}

// Central plaza disc (the road network's hub), the red brand ring, the
// MIND Tower obelisk (B3), the live stats ring, and the four orbiting
// MIND letterforms (garage halo) + vertical pillar of light.
//
// Pass an optional `loadingManager` so a UI loader can track texture-load
// progress (M/I/N/D letterform PNGs are the only async assets the world
// currently downloads). Without it the textures load via the default global
// manager (existing behavior).
export function createPlaza(loadingManager?: THREE.LoadingManager): PlazaBuild {
  // ── Central plaza disc (matte road material, preserved from prior build).
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85, metalness: 0.0 })
  const plazaGeo = new THREE.CircleGeometry(16, 48)
  plazaGeo.rotateX(-Math.PI / 2)
  const plaza = new THREE.Mesh(plazaGeo, roadMat)
  plaza.position.y = 0.05
  plaza.receiveShadow = true

  // ── Brand ring on plaza (existing — preserved at r=15-15.5).
  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(15, 15.5, 64),
    new THREE.MeshBasicMaterial({ color: BRAND_RED, side: THREE.DoubleSide }),
  )
  plazaRing.rotation.x = -Math.PI / 2
  plazaRing.position.y = 0.06

  // ── Cream outer accent ring (Founder Stone easter-egg placeholder).
  const outerAccentRing = new THREE.Mesh(
    new THREE.RingGeometry(16.2, 16.8, 64),
    new THREE.MeshBasicMaterial({ color: ACCENT_CREAM, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }),
  )
  outerAccentRing.rotation.x = -Math.PI / 2
  outerAccentRing.position.y = 0.055

  // ── Brand-gold cardinal inlays at radius 14 (N / E / S / W).
  const cardinalInlays: THREE.Mesh[] = []
  const inlayGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24)
  const inlayMat = new THREE.MeshStandardMaterial({
    color: BRAND_GOLD,
    emissive: BRAND_GOLD,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.65,
  })
  // Cardinal directions on the XZ plane.
  const cardinals: ReadonlyArray<[number, number]> = [
    [0, -14], // north
    [14, 0], // east
    [0, 14], // south
    [-14, 0], // west
  ]
  cardinals.forEach(([x, z]) => {
    const inlay = new THREE.Mesh(inlayGeo, inlayMat)
    inlay.position.set(x, 0.09, z)
    cardinalInlays.push(inlay)
  })

  // ── Intensified pillar-of-light beam.
  // Per § 4: top r=1.2, bottom r=3.0, height=40, base at y=0, top at y=40
  // (contained within the lower half of the 78-unit tower).
  const beamGeo = new THREE.CylinderGeometry(1.2, 3.0, 40, 28, 1, true)
  const beamMat = new THREE.MeshBasicMaterial({
    color: BRAND_RED,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.position.y = 20 // center the 40-unit cylinder so bottom sits at y=0

  // ── MIND Tower obelisk (origin-centered, 78 units tall) — B3
  // Passes loadingManager so the tower's textures contribute to load progress.
  const tower = createMindTower(loadingManager)

  // ── Stats ring group (positioned, but empty until fetch resolves) — B3
  const statsRing = new THREE.Group()
  statsRing.position.set(0, STATS_RING_ALTITUDE, 0)
  statsRing.visible = false

  // Fire-and-forget the live-stats fetch. Sprites animate in once data
  // arrives. On any failure the ring stays invisible.
  void fetchWorldStats().then((stats) => {
    populateStatsRing(statsRing, stats)
  })

  // ── Existing orbiting M-I-N-D garage halo (radius 8, altitude 7).
  // Billboarded planes orbiting above the plaza; track loader progress.
  const textureLoader = new THREE.TextureLoader(loadingManager)
  const letterMeshes: THREE.Mesh[] = []
  const LETTERS: ReadonlyArray<'M' | 'I' | 'N' | 'D'> = ['M', 'I', 'N', 'D']
  LETTERS.forEach((letter, i) => {
    const tex = textureLoader.load(`/${letter}.png`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const planeGeo = new THREE.PlaneGeometry(5.5, 5.5)
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const m = new THREE.Mesh(planeGeo, planeMat)
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    m.position.set(Math.cos(a) * 8, 7, Math.sin(a) * 8)
    m.userData.baseAngle = a
    letterMeshes.push(m)
  })

  // ── Per-frame animation tick.
  const animatedFronts = tower.userData.animatedFronts as THREE.MeshStandardMaterial[]
  const animatedSides = tower.userData.animatedSides as THREE.MeshStandardMaterial[]
  const capMaterial = tower.userData.capMaterial as THREE.MeshStandardMaterial
  const energyRings = (tower.userData.energyRings as THREE.Mesh[]) ?? []
  // Energy-ring climb: 4-second loop, ring travels y=2 → y=72 (tower
  // height) then fades + recycles. Three rings staggered by 1/3 cycle so
  // there's always one mid-climb.
  const RING_CYCLE = 4
  const RING_Y_START = 2
  const RING_Y_END = 72

  const update = (time: number, camera: THREE.Camera, summit: boolean = false): void => {
    // Beam pulse — base opacity responds to summit flag.
    const beamBase = summit ? 0.45 : 0.18
    const beamAmp = summit ? 0.12 : 0.06
    beamMat.opacity = beamBase + Math.sin(time * 1.6) * beamAmp

    // Tower emissive pulse, in sync with the beam.
    const pulse = 0.5 + Math.sin(time * 1.6) * 0.35
    animatedFronts.forEach((m) => {
      m.emissiveIntensity = 0.7 + pulse * 0.5
    })
    animatedSides.forEach((m) => {
      m.emissiveIntensity = 0.35 + pulse * 0.5
    })
    capMaterial.emissiveIntensity = 0.9 + pulse * 0.6

    // Energy rings climb the tower on staggered phases. Fade out near
    // the top so the disappearance reads as the pulse dissolving into
    // the cap, not popping out of frame.
    energyRings.forEach((ring, i) => {
      const phase = ((time / RING_CYCLE) + i / energyRings.length) % 1
      const y = RING_Y_START + phase * (RING_Y_END - RING_Y_START)
      ring.position.y = y
      const mat = ring.material as THREE.MeshStandardMaterial
      // Opacity: rises quickly at the bottom, peaks mid-climb, fades at top.
      mat.opacity = Math.sin(phase * Math.PI) * 0.85
      mat.emissiveIntensity = 1.4 + Math.sin(phase * Math.PI) * 0.8
    })

    // Stats ring slow rotation (only when visible — saves a matrix update).
    if (statsRing.visible) {
      statsRing.rotation.y = time * STATS_RING_ROTATION_SPEED
    }

    // Orbiting halo letters (preserved behavior).
    letterMeshes.forEach((m) => {
      const baseAngle = (m.userData.baseAngle as number) + time * 0.12
      m.position.x = Math.cos(baseAngle) * 8
      m.position.z = Math.sin(baseAngle) * 8
      m.position.y = 7 + Math.sin(time * 1.2 + baseAngle * 2) * 0.4
      m.lookAt(camera.position.x, m.position.y, camera.position.z)
    })
  }

  return {
    plaza,
    plazaRing,
    outerAccentRing,
    cardinalInlays,
    beam,
    tower,
    statsRing,
    letterMeshes,
    update,
  }
}
