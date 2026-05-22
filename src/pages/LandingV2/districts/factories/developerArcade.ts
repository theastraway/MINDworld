/**
 * Developer Arcade — District 7 (west, [-32, 12]).
 *
 * Per MIND_WORLD_VISION § 3 D7: retro neon arcade theme. Glowing `< >` code
 * brackets, MCP flag flying high, "MIND Developer Hub" terminal screen.
 *
 * Mesh budget: 2 brackets (~6 meshes each) + flag pole + flag + terminal +
 * 6 dot row + arcade cabinet sign = ~20 meshes.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, createTextLabelTexture, stdMat } from './_shared'

export function buildDeveloperArcade(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Arcade cabinet base ──────────────────────────────────────────────
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 2.2, 1.8),
    stdMat(0x1a1f2c)
  )
  cabinet.position.y = 1.6
  cabinet.castShadow = true
  cabinet.receiveShadow = true
  sculpt.add(cabinet)

  // Neon trim along cabinet top edge
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(1.95, 0.06, 8, 24, Math.PI),
    new THREE.MeshBasicMaterial({ color: d.color })
  )
  trim.position.set(0, 2.7, 0)
  trim.rotation.x = Math.PI / 2
  sculpt.add(trim)

  // ── Terminal screen on cabinet face ─────────────────────────────────
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshBasicMaterial({
      map: createTextLabelTexture('REST · MCP', '#7CFFC4', '#0a1a14', 100, 512, 256),
    })
  )
  screen.position.set(0, 1.9, 0.92)
  sculpt.add(screen)

  // Screen bezel
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.4, 0.08),
    stdMat(0x222222)
  )
  bezel.position.set(0, 1.9, 0.88)
  sculpt.add(bezel)

  // ── Code brackets `< >` glowing on either side ──────────────────────
  const brBox = (xPos: number, mirror: boolean): THREE.Group => {
    const g = new THREE.Group()
    const armMat = stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.7 })
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.3), armMat)
    arm1.rotation.z = mirror ? -Math.PI / 4 : Math.PI / 4
    arm1.position.y = 0.6
    arm1.castShadow = true
    g.add(arm1)
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.3), armMat)
    arm2.rotation.z = mirror ? Math.PI / 4 : -Math.PI / 4
    arm2.position.y = -0.6
    arm2.castShadow = true
    g.add(arm2)
    g.position.set(xPos, 3.6, 0)
    return g
  }
  sculpt.add(brBox(-2.4, false))
  sculpt.add(brBox(2.4, true))

  // ── 3 dots between the brackets, code-comment style ──────────────────
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      stdMat(0xffffff, { emissive: d.color, emissiveIntensity: 0.55 })
    )
    dot.position.set(-0.5 + i * 0.5, 3.6, 0)
    sculpt.add(dot)
  }

  // ── MCP flag flying high on a pole behind cabinet ───────────────────
  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 5.5, 8),
    stdMat(0x444444)
  )
  flagPole.position.set(1.6, 2.75, -0.7)
  sculpt.add(flagPole)

  const mcpTex = createTextLabelTexture('MCP', '#ffffff', null, 110, 256, 128)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.6),
    new THREE.MeshBasicMaterial({
      map: mcpTex,
      transparent: true,
      side: THREE.DoubleSide,
      color: d.color,
    })
  )
  flag.position.set(2.2, 4.8, -0.7)
  sculpt.add(flag)

  // ── REST badge on a side post ────────────────────────────────────────
  const restPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 4.0, 8),
    stdMat(0x444444)
  )
  restPole.position.set(-1.6, 2.0, -0.7)
  sculpt.add(restPole)

  const restTex = createTextLabelTexture('REST', '#ffffff', null, 110, 256, 128)
  const restBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshBasicMaterial({
      map: restTex,
      transparent: true,
      side: THREE.DoubleSide,
      color: d.color,
    })
  )
  restBadge.position.set(-1.15, 3.6, -0.7)
  sculpt.add(restBadge)

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
