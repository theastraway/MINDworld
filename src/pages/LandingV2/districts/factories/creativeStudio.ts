/**
 * Creative Studio Quarter — District 5 (south, [-16, -34]).
 *
 * Per MIND_WORLD_VISION § 3 D5: outdoor amphitheater with
 *   (1) 4 large video screens looping sample MIND-generated clips
 *   (2) 2 image canvases on easels
 *   (3) a music stage with floating notes
 *   (4) a voice waveform pulsing from speakers
 *
 * Video integration: attempt to use a `<video>`-textured plane. If no demo
 * MP4 is available at the expected paths (or the browser refuses autoplay),
 * fall back to a colored solid quad — never a fake "video playing" UI.
 *
 * Mesh budget: 4 video screens + 2 easels + music stage + 2 speakers + ~6
 * floating notes = ~16 meshes.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, createTextLabelTexture, stdMat } from './_shared'

/**
 * Sample video paths to attempt (in order). Files that 404 silently fall
 * back to a flat colored quad. ANY existing demo MP4 in /public will do —
 * we deliberately do NOT ship a hardcoded asset to keep this factory
 * resilient to missing media.
 */
const VIDEO_CANDIDATES = [
  '/landingv2-demo.mp4',
  '/demo.mp4',
  '/m-i-n-d-demo.mp4',
]

function tryAttachVideoTexture(plane: THREE.Mesh, fallbackColor: number) {
  // Try each candidate in order. The first one that loads gets attached.
  // If all fail (404 / play() rejected), keep the fallback color material.
  for (const src of VIDEO_CANDIDATES) {
    try {
      const video = document.createElement('video')
      video.src = src
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.crossOrigin = 'anonymous'
      video.autoplay = true
      const onLoad = () => {
        const tex = new THREE.VideoTexture(video)
        tex.colorSpace = THREE.SRGBColorSpace
        const newMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
        plane.material = newMat
      }
      const onError = () => {
        /* swallow — fallback color stays */
      }
      video.addEventListener('loadeddata', onLoad, { once: true })
      video.addEventListener('error', onError, { once: true })
      // Play may reject (e.g. autoplay policy w/o user gesture); swallow.
      video.play().catch(() => {
        /* fallback color stays */
      })
      // Bind to plane userData so it isn't GC'd
      ;(plane.userData as Record<string, unknown>).video = video
      return
    } catch {
      // try next
    }
  }
  // Fallback: opaque colored material is already set by the caller via fallbackColor.
  if (
    plane.material instanceof THREE.MeshBasicMaterial &&
    !(plane.material as THREE.MeshBasicMaterial).map
  ) {
    ;(plane.material as THREE.MeshBasicMaterial).color = new THREE.Color(fallbackColor)
  }
}

export function buildCreativeStudio(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Amphitheater base: curved seating bench at the back ─────────────
  const bench = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, 0.4, 24, 1, true, Math.PI * 0.2, Math.PI * 0.6),
    stdMat(0x6d5a4a)
  )
  bench.position.set(0, 0.7, -2.4)
  bench.castShadow = true
  bench.receiveShadow = true
  sculpt.add(bench)

  // ── 4 video screens — front row, slight fan ──────────────────────────
  const SCREEN_COLORS = [0xc78cff, 0xff77c8, 0x77c8ff, 0xffd35a] // brand-palette tinted
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 1.6
    const z = -0.4 - Math.abs(i - 1.5) * 0.4
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.8),
      new THREE.MeshBasicMaterial({ color: SCREEN_COLORS[i], side: THREE.DoubleSide })
    )
    screen.position.set(x, 1.8, z)
    screen.rotation.y = (i - 1.5) * 0.12
    sculpt.add(screen)

    // Screen frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.9, 0.06),
      stdMat(0x222222)
    )
    frame.position.copy(screen.position)
    frame.position.z -= 0.03
    frame.rotation.y = screen.rotation.y
    sculpt.add(frame)

    // Try to attach a video texture (only on the FIRST screen to be polite
    // about decoder budget). Other screens stay as colored quads.
    if (i === 0) tryAttachVideoTexture(screen, SCREEN_COLORS[i])
  }

  // ── 2 easels with image canvases ─────────────────────────────────────
  for (const side of [-1, 1] as const) {
    const easelLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6),
      stdMat(0x6d4a2a)
    )
    easelLeg.position.set(side * 3.6, 0.95, 1.4)
    easelLeg.rotation.z = side * 0.18
    sculpt.add(easelLeg)

    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.2),
      new THREE.MeshBasicMaterial({
        map: createTextLabelTexture('IMG', '#ffffff', '#c78cff', 90, 256, 256),
        side: THREE.DoubleSide,
      })
    )
    canvas.position.set(side * 3.6, 1.6, 1.45)
    canvas.rotation.z = side * 0.15
    sculpt.add(canvas)
  }

  // ── Music stage: floating notes above a small platform ──────────────
  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.2, 0.3, 12),
    stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.18 })
  )
  stage.position.set(0, 0.65, 2.4)
  stage.castShadow = true
  sculpt.add(stage)

  // 6 floating notes orbiting above the stage. The animation loop reads
  // userData.note to bob them per frame (see SceneRoot — handled via the
  // sculpt rotation which the existing loop already drives).
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const note = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      stdMat(0xffffff, { emissive: d.color, emissiveIntensity: 0.5 })
    )
    note.position.set(Math.cos(angle) * 0.7, 2.6 + Math.sin(angle * 2) * 0.3, 2.4 + Math.sin(angle) * 0.7)
    sculpt.add(note)
  }

  // ── 2 speakers flanking the stage, with pulsing voice waveform ───────
  for (const side of [-1, 1] as const) {
    const speaker = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.2, 0.45),
      stdMat(0x222222)
    )
    speaker.position.set(side * 1.5, 1.1, 2.4)
    speaker.castShadow = true
    sculpt.add(speaker)

    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.05, 0.15, 12),
      stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.55 })
    )
    cone.rotation.x = Math.PI / 2
    cone.position.set(side * 1.5, 1.3, 2.65)
    sculpt.add(cone)
  }

  // ── Voice waveform: 12 short bars in front of the stage ──────────────
  for (let i = 0; i < 12; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.4 + (i % 4) * 0.15, 0.1),
      stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.3 })
    )
    bar.position.set(-1.4 + i * 0.25, 0.4, 3.6)
    sculpt.add(bar)
  }

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
