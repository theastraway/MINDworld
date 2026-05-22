import * as THREE from 'three'

// ─── Easter Egg world geometry + proximity helpers (vision § 13) ───────
//
// This module owns the in-world geometry for the easter eggs that have
// a physical, drivable presence in the scene:
//
//   1. Achilles Statue  — low-poly bronze warrior on a stone plinth in
//      the southeastern mountain ring (≈ [68, 0, 68]). Drive within
//      5 units → fires the achilles discovery callback.
//   2. Founder Stone    — small carved stone tile under the eastern
//      edge of the plaza outer accent ring (≈ [16.5, 0.05, 0]). Drive
//      within 1.5 units → fires the founder_stone discovery callback.
//
// The Konami code, horn fireworks, and time-of-day eggs are wired
// elsewhere (Keyboard.ts + SceneRoot.ts) — they don't have a static
// world position to detect against.
//
// Per the C6 brief, the Achilles statue is decorative only — there is
// NO real Achilles AI agent metadata referenced in the world copy.
// The vision doc allows a "founder note" on discovery, but the overlay
// card in `ui/EasterEggCard.tsx` keeps that text neutral.

export interface EasterEggHandle {
  group: THREE.Group
  /** World position of the Achilles statue (XZ-plane proximity check). */
  achillesPosition: THREE.Vector3
  /** World position of the Founder Stone tile (XZ-plane proximity check). */
  founderStonePosition: THREE.Vector3
  /** Achilles statue + plinth — exposed for the chest-glyph pulse update. */
  achillesGlyphMaterial: THREE.MeshStandardMaterial
  /** Founder Stone gold inlay — exposed for a subtle emissive pulse. */
  founderStoneInlayMaterial: THREE.MeshStandardMaterial
  /** Advance the subtle per-frame pulses (glyph emissive, inlay shimmer). */
  update: (time: number) => void
  dispose: () => void
}

// ─── Achilles Statue ──────────────────────────────────────────────────
//
// Low-poly humanoid silhouette (~3 units tall) on a cylindrical stone
// plinth. Bronze body, gold MIND glyph on the chest. The pose is a
// neutral standing-warrior stance — no fabricated narrative.

const BRONZE = 0x8B6914
const STONE_GREY = 0x8a8a8a
const BRAND_GOLD = 0xFFCC4D

function buildAchillesStatue(): {
  group: THREE.Group
  glyphMaterial: THREE.MeshStandardMaterial
} {
  const statue = new THREE.Group()

  // ── Plinth (stone cylinder).
  const plinthMat = new THREE.MeshStandardMaterial({
    color: STONE_GREY,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  })
  const plinthGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.0, 12)
  const plinth = new THREE.Mesh(plinthGeo, plinthMat)
  plinth.position.y = 0.5
  plinth.castShadow = true
  plinth.receiveShadow = true
  statue.add(plinth)

  // ── Bronze body parts.
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: BRONZE,
    roughness: 0.55,
    metalness: 0.65,
    flatShading: true,
  })

  // Legs — single column for low-poly silhouette.
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.5), bronzeMat)
  legs.position.y = 1.55
  legs.castShadow = true
  statue.add(legs)

  // Torso — slightly wider, tapered.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.55), bronzeMat)
  torso.position.y = 2.55
  torso.castShadow = true
  statue.add(torso)

  // Shoulders — small bevel pieces.
  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.55), bronzeMat)
  shoulderL.position.set(-0.55, 2.75, 0)
  shoulderL.castShadow = true
  statue.add(shoulderL)
  const shoulderR = shoulderL.clone()
  shoulderR.position.x = 0.55
  statue.add(shoulderR)

  // Arms — held loosely at the sides.
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), bronzeMat)
  armL.position.set(-0.55, 2.15, 0)
  armL.castShadow = true
  statue.add(armL)
  const armR = armL.clone()
  armR.position.x = 0.55
  statue.add(armR)

  // Head — slightly smaller cube atop the torso.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), bronzeMat)
  head.position.y = 3.35
  head.castShadow = true
  statue.add(head)

  // ── MIND glyph on the chest (gold emissive square).
  const glyphMat = new THREE.MeshStandardMaterial({
    color: BRAND_GOLD,
    emissive: BRAND_GOLD,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.8,
  })
  const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.04), glyphMat)
  // Slightly proud of the torso front so it catches the light.
  glyph.position.set(0, 2.6, 0.31)
  statue.add(glyph)

  return { group: statue, glyphMaterial: glyphMat }
}

// ─── Founder Stone ────────────────────────────────────────────────────
//
// Small carved stone tile under the eastern edge of the plaza outer
// accent ring (r=16.2-16.8). Drive over it → reveals Anthony's
// handwritten note via EasterEggCard.
//
// Position: [16.5, 0.05, 0] — directly on the outer accent ring, eastern
// quadrant, so the user sees it as part of the plaza-edge ornamentation
// rather than a random tile in open ground.

function buildFounderStone(): {
  group: THREE.Group
  inlayMaterial: THREE.MeshStandardMaterial
} {
  const stone = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({
    color: STONE_GREY,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  })
  const tileGeo = new THREE.BoxGeometry(1.2, 0.1, 0.8)
  const tile = new THREE.Mesh(tileGeo, stoneMat)
  tile.position.y = 0
  tile.receiveShadow = true
  stone.add(tile)

  // Gold inlay on top — a short engraved line in brand-gold, suggestive
  // of a maker's mark without spelling out a wordmark.
  const inlayMat = new THREE.MeshStandardMaterial({
    color: BRAND_GOLD,
    emissive: BRAND_GOLD,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.75,
  })
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.012, 0.06), inlayMat)
  // Sit just above the tile's top face so it reads as engraved/inlaid.
  inlay.position.y = 0.058
  stone.add(inlay)

  // Small companion inlay — a brand-red dot to nod at the brand without
  // being a logo. Reuses a separate emissive material so the pulse
  // animation only touches the gold inlay.
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xF43F3F })
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), dotMat)
  dot.position.set(0.5, 0.058, 0)
  stone.add(dot)

  return { group: stone, inlayMaterial: inlayMat }
}

/**
 * Build all static easter-egg geometry and return a single group ready
 * to be added to the scene.
 */
export function createEasterEggs(): EasterEggHandle {
  const group = new THREE.Group()

  // ── Achilles statue at the southeastern mountain ring.
  // Position is in world coords; the statue's geometry is built around
  // its own origin so we can translate the group as a whole.
  const achillesPosition = new THREE.Vector3(68, 0, 68)
  const achilles = buildAchillesStatue()
  achilles.group.position.copy(achillesPosition)
  // Face the statue inward toward the plaza so visitors driving up to
  // it see the chest glyph on approach.
  achilles.group.rotation.y = Math.atan2(-achillesPosition.x, -achillesPosition.z)
  group.add(achilles.group)

  // ── Founder Stone on the eastern edge of the plaza outer accent ring.
  const founderStonePosition = new THREE.Vector3(16.5, 0.05, 0)
  const founderStone = buildFounderStone()
  founderStone.group.position.copy(founderStonePosition)
  // Rotate so the inlay runs along the tangent of the ring (perpendicular
  // to the radius). Stone sits at angle 0 (east), so tangent = z-axis →
  // rotate 90° around y to align long axis with z.
  founderStone.group.rotation.y = Math.PI / 2
  group.add(founderStone.group)

  // ── Per-frame pulses.
  // Glyph: 0.6 ± 0.25 emissive intensity, ~0.6 Hz sine.
  // Inlay: 0.45 ± 0.15 emissive intensity, ~0.4 Hz sine, phase-offset so
  // the two pulses don't sync.
  const update = (time: number) => {
    const glyphPulse = 0.6 + Math.sin(time * 1.2) * 0.25
    achilles.glyphMaterial.emissiveIntensity = glyphPulse
    const inlayPulse = 0.45 + Math.sin(time * 0.8 + 1.5) * 0.15
    founderStone.inlayMaterial.emissiveIntensity = inlayPulse
  }

  const dispose = () => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const m = obj.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else if (m) m.dispose()
      }
    })
  }

  return {
    group,
    achillesPosition,
    founderStonePosition,
    achillesGlyphMaterial: achilles.glyphMaterial,
    founderStoneInlayMaterial: founderStone.inlayMaterial,
    update,
    dispose,
  }
}
