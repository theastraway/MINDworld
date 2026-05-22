/**
 * Walking NPC robots in Agent Town (Wave 4 / D2 — vision § 3 District 4).
 *
 * 6 low-poly biped agents that loop simple waypoint paths around the
 * Agent Town plinth. Each NPC:
 *   - Has a per-NPC body color from the brand-friendly palette
 *   - Walks at 1–2 u/s between 4–6 random waypoints inside a ~12-unit radius
 *   - Bobs vertically (0.5 Hz sine on the torso) and swings arms + legs
 *   - Carries a sprite-text speech bubble above its head that cycles
 *     between 8 verifiable agent-task lines every 4–6s
 *   - Faces its current heading (rotates the whole body, not just torso)
 *
 * Performance:
 *   - 6 NPCs × ~7 meshes per NPC (body, head, 2 arms, 2 legs, antenna)
 *     + 1 sprite per NPC = 48 visible objects total. No instancing —
 *     each NPC animates independently and the count is too low to win
 *     anything from instanced rendering.
 *   - Speech bubbles are CanvasTexture sprites at 256×96; they billboard
 *     for free via THREE.Sprite, and their textures are rebuilt only on
 *     text changes (not per-frame).
 *
 * Constraints honored:
 *   - No collision detection. The car drives THROUGH the NPCs — they are
 *     decorative. The vision spec is explicit on this.
 *   - All speech-bubble lines describe real MIND agent capabilities
 *     (research, email send, scheduling, MIND query, etc.). No
 *     fabricated stats, no fake brand names.
 *   - Shadows ON for body parts so the NPCs read as inhabitants, not
 *     billboards.
 */

import * as THREE from 'three'

export interface NpcsHandle {
  group: THREE.Group
  update: (time: number, carPos: THREE.Vector3) => void
  dispose: () => void
}

/** Verifiable one-liner descriptions of real MIND agent tasks. */
const TASK_LINES: readonly string[] = [
  'Researching...',
  'Sending email...',
  'Scheduling...',
  'Querying MIND...',
  'Logging activity...',
  'Reading docs...',
  'Capturing thought...',
  'Planning sprint...',
]

/** Brand-aware per-NPC body colors. */
const NPC_COLORS: readonly number[] = [
  0xf43f3f, // brand red
  0x4fb3f7, // sky blue
  0x77e8a0, // mint green
  0xffcc4d, // brand gold
  0xc78cff, // lavender
  0x44e2c9, // cyber teal
]

const NPC_COUNT = 6
const NPC_TORSO_Y = 1.2
const NPC_WALK_RADIUS = 12
const WAYPOINT_REACH_EPS = 0.4

interface NpcRig {
  group: THREE.Group
  body: THREE.Mesh
  leftArm: THREE.Mesh
  rightArm: THREE.Mesh
  leftLeg: THREE.Mesh
  rightLeg: THREE.Mesh
  bubble: THREE.Sprite
  bubbleCanvas: HTMLCanvasElement
  bubbleTexture: THREE.CanvasTexture
  /** World-space waypoints the NPC cycles through (a loop). */
  waypoints: THREE.Vector3[]
  /** Index of the next waypoint to head toward. */
  waypointIndex: number
  /** Units per second (1.0–2.0). */
  speed: number
  /** Phase offset so all NPCs aren't bobbing in lockstep. */
  phase: number
  /** Time (seconds) at which the speech bubble should cycle next. */
  nextBubbleSwapAt: number
  /** Index into TASK_LINES currently displayed. */
  bubbleLineIndex: number
}

// ─── Speech-bubble canvas painter ─────────────────────────────────────
// Renders a rounded pill with brand-cream text + subtle dark backdrop
// so the text reads against any sky/ground combination.

function paintBubble(
  canvas: HTMLCanvasElement,
  text: string,
  fillColor: number,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  // Rounded pill background.
  const r = h * 0.32
  ctx.fillStyle = 'rgba(20, 14, 18, 0.86)'
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.quadraticCurveTo(w, 0, w, r)
  ctx.lineTo(w, h - r)
  ctx.quadraticCurveTo(w, h, w - r, h)
  ctx.lineTo(r, h)
  ctx.quadraticCurveTo(0, h, 0, h - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()

  // Brand-color accent stripe along the left edge.
  ctx.fillStyle = '#' + fillColor.toString(16).padStart(6, '0')
  ctx.fillRect(0, h * 0.25, 6, h * 0.5)

  // Centered text — brand cream.
  ctx.fillStyle = '#f6e8d9'
  ctx.font = '600 38px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, w / 2 + 3, h / 2)
}

function buildNpcRig(
  baseColor: number,
  startPos: THREE.Vector3,
  waypoints: THREE.Vector3[],
  speed: number,
  phase: number,
  initialLineIndex: number,
): NpcRig {
  const group = new THREE.Group()
  group.position.copy(startPos)

  const bodyMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.5,
    metalness: 0.15,
    flatShading: true,
  })
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.6,
    metalness: 0.2,
    flatShading: true,
  })
  const limbMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.55,
    metalness: 0.18,
    flatShading: true,
  })
  const antennaMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.4,
    metalness: 0.6,
    flatShading: true,
  })
  const antennaTipMat = new THREE.MeshBasicMaterial({ color: baseColor })

  // ── Body (torso).
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), bodyMat)
  body.position.y = NPC_TORSO_Y + 0.0
  body.castShadow = true
  group.add(body)

  // ── Head.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat)
  head.position.y = NPC_TORSO_Y + 0.95
  head.castShadow = true
  group.add(head)

  // ── Antenna on top of the head.
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6),
    antennaMat,
  )
  antenna.position.y = NPC_TORSO_Y + 1.32
  antenna.castShadow = true
  group.add(antenna)
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    antennaTipMat,
  )
  antennaTip.position.y = NPC_TORSO_Y + 1.46
  group.add(antennaTip)

  // ── Arms — pivot at the shoulder so they swing convincingly when we
  // rotate them around X on each tick.
  const armGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2)
  // Translate the geometry so its "shoulder end" sits at the local origin;
  // the rest of the arm hangs below. Then any rotation.x is a clean swing.
  armGeo.translate(0, -0.45, 0)

  const leftArm = new THREE.Mesh(armGeo, limbMat)
  leftArm.position.set(-0.55, NPC_TORSO_Y + 0.55, 0)
  leftArm.castShadow = true
  group.add(leftArm)

  const rightArm = new THREE.Mesh(armGeo, limbMat)
  rightArm.position.set(0.55, NPC_TORSO_Y + 0.55, 0)
  rightArm.castShadow = true
  group.add(rightArm)

  // ── Legs — pivot at the hip the same way.
  const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25)
  legGeo.translate(0, -0.35, 0)

  const leftLeg = new THREE.Mesh(legGeo, limbMat)
  leftLeg.position.set(-0.2, NPC_TORSO_Y - 0.6, 0)
  leftLeg.castShadow = true
  group.add(leftLeg)

  const rightLeg = new THREE.Mesh(legGeo, limbMat)
  rightLeg.position.set(0.2, NPC_TORSO_Y - 0.6, 0)
  rightLeg.castShadow = true
  group.add(rightLeg)

  // ── Speech bubble (Sprite — auto-billboards).
  const bubbleCanvas = document.createElement('canvas')
  bubbleCanvas.width = 384
  bubbleCanvas.height = 96
  paintBubble(bubbleCanvas, TASK_LINES[initialLineIndex] ?? '', baseColor)
  const bubbleTexture = new THREE.CanvasTexture(bubbleCanvas)
  bubbleTexture.colorSpace = THREE.SRGBColorSpace
  bubbleTexture.needsUpdate = true
  const bubbleMat = new THREE.SpriteMaterial({
    map: bubbleTexture,
    transparent: true,
    depthTest: true,
  })
  const bubble = new THREE.Sprite(bubbleMat)
  bubble.scale.set(2.4, 0.6, 1)
  bubble.position.y = NPC_TORSO_Y + 2.1
  group.add(bubble)

  return {
    group,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    bubble,
    bubbleCanvas,
    bubbleTexture,
    waypoints,
    waypointIndex: 0,
    speed,
    phase,
    nextBubbleSwapAt: 0, // set on first update once `time` is known
    bubbleLineIndex: initialLineIndex,
  }
}

/**
 * Generates 4–6 waypoints in a ring around the town center.
 * Uses angular spacing so the path doesn't backtrack on itself —
 * each NPC walks a loose convex loop.
 */
function generateWaypoints(
  townX: number,
  townZ: number,
  rng: () => number,
): THREE.Vector3[] {
  const count = 4 + Math.floor(rng() * 3) // 4, 5, or 6
  const baseAngle = rng() * Math.PI * 2
  const points: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    // Walk angles in monotonic order with some jitter so the loop is convex.
    const angle = baseAngle + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.4
    // Radius between 3 and NPC_WALK_RADIUS to keep the NPCs near the
    // town silhouette without bunching up at the very edge.
    const r = 3 + rng() * (NPC_WALK_RADIUS - 3)
    points.push(new THREE.Vector3(townX + Math.cos(angle) * r, 0, townZ + Math.sin(angle) * r))
  }
  return points
}

/** Cheap, deterministic PRNG so the same world has the same NPC layout
 * across reloads — easier to spot regressions, easier to screenshot. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function createNpcs(townPosition: [number, number]): NpcsHandle {
  const group = new THREE.Group()
  const npcs: NpcRig[] = []

  const rng = makeRng(0xa9c0_2026)

  for (let i = 0; i < NPC_COUNT; i++) {
    const color = NPC_COLORS[i] ?? 0xeeeeee
    const speed = 1.0 + rng() // 1.0 – 2.0 u/s
    const phase = rng() * Math.PI * 2
    const waypoints = generateWaypoints(townPosition[0], townPosition[1], rng)
    const startPos = waypoints[0].clone()
    const initialLine = Math.floor(rng() * TASK_LINES.length)
    const rig = buildNpcRig(color, startPos, waypoints, speed, phase, initialLine)
    // Aim toward the next waypoint (waypointIndex=1) for natural opening yaw.
    rig.waypointIndex = 1
    const next = waypoints[1] ?? waypoints[0]
    rig.group.rotation.y = Math.atan2(
      next.x - startPos.x,
      next.z - startPos.z,
    )
    npcs.push(rig)
    group.add(rig.group)
  }

  function update(time: number, _carPos: THREE.Vector3): void {
    // Underscore-prefix on carPos: we don't gate animation on car
    // proximity. NPCs walk continuously regardless — they're scenic.
    void _carPos

    for (const npc of npcs) {
      // ── Speech-bubble cycle (4–6s per line).
      if (npc.nextBubbleSwapAt === 0) {
        npc.nextBubbleSwapAt = time + 4 + Math.random() * 2
      } else if (time >= npc.nextBubbleSwapAt) {
        npc.bubbleLineIndex = (npc.bubbleLineIndex + 1) % TASK_LINES.length
        paintBubble(
          npc.bubbleCanvas,
          TASK_LINES[npc.bubbleLineIndex] ?? '',
          NPC_COLORS[npcs.indexOf(npc)] ?? 0xeeeeee,
        )
        npc.bubbleTexture.needsUpdate = true
        npc.nextBubbleSwapAt = time + 4 + Math.random() * 2
      }

      // ── Waypoint navigation.
      const target = npc.waypoints[npc.waypointIndex]
      const pos = npc.group.position
      const dx = target.x - pos.x
      const dz = target.z - pos.z
      const dist = Math.hypot(dx, dz)
      if (dist < WAYPOINT_REACH_EPS) {
        // Reached waypoint — advance.
        npc.waypointIndex = (npc.waypointIndex + 1) % npc.waypoints.length
      } else {
        // Move toward the target at `speed` u/s. We use a tiny fixed step
        // (16ms) instead of a real dt because the parent loop already
        // ticks at ~60fps; this keeps the NPC speed visually consistent
        // and avoids needing dt threaded through.
        const step = npc.speed * (1 / 60)
        pos.x += (dx / dist) * step
        pos.z += (dz / dist) * step
        // Smooth heading via short-arc lerp.
        const desiredYaw = Math.atan2(dx, dz)
        const cur = npc.group.rotation.y
        let delta = desiredYaw - cur
        // Wrap to [-π, π] so we always rotate the short way.
        delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
        npc.group.rotation.y = cur + delta * 0.12
      }

      // ── Per-frame bob + limb swing — only when moving.
      const moving = dist >= WAYPOINT_REACH_EPS
      if (moving) {
        // Vertical torso bob: low-amplitude 1.2 Hz sine.
        npc.body.position.y = NPC_TORSO_Y + Math.sin(time * 6 + npc.phase) * 0.04
        // Arm + leg swing — opposing limbs phase-locked 180° apart.
        const swing = Math.sin(time * 6 + npc.phase) * 0.55
        npc.leftArm.rotation.x = swing
        npc.rightArm.rotation.x = -swing
        npc.leftLeg.rotation.x = -swing * 0.7
        npc.rightLeg.rotation.x = swing * 0.7
      } else {
        // Settle limbs neutral when idle so they don't twitch at waypoints.
        npc.body.position.y = NPC_TORSO_Y
        npc.leftArm.rotation.x *= 0.8
        npc.rightArm.rotation.x *= 0.8
        npc.leftLeg.rotation.x *= 0.8
        npc.rightLeg.rotation.x *= 0.8
      }
    }
  }

  function dispose(): void {
    for (const npc of npcs) {
      // Sprite texture + material need explicit dispose; mesh geometry +
      // materials are cleaned by the SceneRoot.scene.traverse() pass on
      // teardown, but the speech-bubble CanvasTexture is owned by us.
      npc.bubbleTexture.dispose()
      const bubMat = npc.bubble.material
      bubMat.dispose()
    }
  }

  return { group, update, dispose }
}
