import * as THREE from 'three'

/**
 * Drifting cloud layer high above the MIND World.
 *
 * Soft, low-opacity planes float at altitude 38–46u, drifting on a slow
 * world-X wind. Each cloud is a billboard quad with a procedural radial
 * gradient canvas-texture (warm cream center, transparent edges) so the
 * silhouette reads as a fluffy blob rather than a hard rectangle.
 *
 * Performance: 18 quads, each ~64 tris when triangulated, all sharing one
 * canvas-texture + one material → cheap. No lighting calls (MeshBasicMaterial).
 *
 * Visual intent: the first frame should not feel static. Even before the
 * player drives, the sky is moving — same trick Bruno Simon uses on his
 * portfolio to make the world feel alive on landing.
 */

const CLOUD_COUNT = 18
const CLOUD_ALTITUDE_MIN = 38
const CLOUD_ALTITUDE_MAX = 46
const CLOUD_RADIUS_MIN = 60
const CLOUD_RADIUS_MAX = 160
const CLOUD_SCALE_MIN = 14
const CLOUD_SCALE_MAX = 28
const CLOUD_DRIFT_SPEED = 1.2 // world units / sec

function makeCloudTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  // Radial gradient — warm cream center fading to transparent edge.
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255, 240, 220, 0.55)')
  grad.addColorStop(0.5, 'rgba(255, 220, 200, 0.28)')
  grad.addColorStop(1, 'rgba(255, 220, 200, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface CloudsHandle {
  group: THREE.Group
  update: (dt: number) => void
  dispose: () => void
}

export function createClouds(): CloudsHandle {
  const group = new THREE.Group()
  const texture = makeCloudTexture()
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false, // clouds are above the fog plane; let them stay legible
  })
  const geometry = new THREE.PlaneGeometry(1, 1)

  // Per-cloud drift offset so they don't all march in lockstep.
  const drifts: number[] = []

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = new THREE.Mesh(geometry, material)
    const angle = Math.random() * Math.PI * 2
    const radius = CLOUD_RADIUS_MIN + Math.random() * (CLOUD_RADIUS_MAX - CLOUD_RADIUS_MIN)
    const altitude = CLOUD_ALTITUDE_MIN + Math.random() * (CLOUD_ALTITUDE_MAX - CLOUD_ALTITUDE_MIN)
    const scale = CLOUD_SCALE_MIN + Math.random() * (CLOUD_SCALE_MAX - CLOUD_SCALE_MIN)
    cloud.position.set(Math.cos(angle) * radius, altitude, Math.sin(angle) * radius)
    cloud.scale.setScalar(scale)
    // Lay the quad flat (face down) so the radial gradient reads as a
    // bird's-eye silhouette of a cloud, not a flat wall.
    cloud.rotation.x = -Math.PI / 2
    // Slight per-cloud yaw so successive billboards don't look identical.
    cloud.rotation.z = Math.random() * Math.PI * 2
    group.add(cloud)
    drifts.push(Math.random() * 200 - 100)
  }

  const update = (dt: number) => {
    // Wind blows along +X. When a cloud crosses the far boundary, wrap it
    // back to the opposite edge so the layer feels continuous.
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cloud = group.children[i] as THREE.Mesh
      drifts[i] += CLOUD_DRIFT_SPEED * dt
      cloud.position.x = drifts[i] + (cloud.userData.baseX ?? 0)
      if (cloud.position.x > CLOUD_RADIUS_MAX + 40) {
        // Recycle: jump to opposite side with fresh drift offset.
        drifts[i] = -(CLOUD_RADIUS_MAX + 40)
        cloud.userData.baseX = 0
      }
    }
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { group, update, dispose }
}
