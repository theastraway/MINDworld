/**
 * Patents Pavilion — District 8 (northwest, [-32, 24]).
 *
 * Per MIND_WORLD_VISION § 3 D8: vault building with rotating "Patents Pending"
 * hologram. **HARD RULE: NO numbers, NO IDs, NO filing dates.** Only the
 * canonical phrase "Patents pending" — non-negotiable per CLAUDE.md.
 *
 * Mesh budget: vault box + 4 reinforcement strips + lock disc + lock dot +
 * rotating billboard plane (with billboard tag for SceneRoot) = ~10 meshes.
 */

import * as THREE from 'three'
import type { District } from '../types'
import { createDistrictShell, createTextLabelTexture, stdMat } from './_shared'

export function buildPatentsPavilion(d: District): THREE.Group {
  const { group, sculpt, labelDot } = createDistrictShell(d)

  // ── Vault: heavy cube with reinforcement strips ─────────────────────
  const vault = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.6, 2.6),
    stdMat(0xeeeeee, { roughness: 0.7, metalness: 0.4 })
  )
  vault.position.y = 1.8
  vault.castShadow = true
  sculpt.add(vault)

  // Reinforcement strips on the front face (cross pattern)
  const stripMat = stdMat(0x555555, { metalness: 0.6, roughness: 0.4 })
  const vStrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.55, 0.08), stripMat)
  vStrip.position.set(0, 1.8, 1.32)
  sculpt.add(vStrip)
  const hStrip = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.18, 0.08), stripMat)
  hStrip.position.set(0, 1.8, 1.32)
  sculpt.add(hStrip)

  // ── Lock disc + center dot ───────────────────────────────────────────
  const lock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.25, 24),
    stdMat(d.color, { emissive: d.color, emissiveIntensity: 0.3 })
  )
  lock.rotation.x = Math.PI / 2
  lock.position.set(0, 1.8, 1.42)
  sculpt.add(lock)

  const lockDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    stdMat(0x1a1a1a)
  )
  lockDot.position.set(0, 1.8, 1.56)
  sculpt.add(lockDot)

  // ── Rotating "Patents Pending" billboard above the vault ─────────────
  // Plane is double-sided so it reads from any angle. Stamped with
  // userData.spin = true so a future polish pass can sync rotation to
  // the central animation loop; for now the existing sculpt rotation
  // already cycles the whole group.
  //
  // Text is GOLD on a translucent dark background — gold matches the
  // brand "patents" accent. NEVER include patent numbers or dates.
  const tex = createTextLabelTexture('Patents Pending', '#FFCC4D', null, 90, 768, 256)
  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 1.2),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  )
  billboard.position.set(0, 4.2, 0)
  billboard.userData = { spin: true }
  sculpt.add(billboard)

  // Subtle backing halo behind the billboard so the gold text reads
  // against the dusk sky.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.4),
    new THREE.MeshBasicMaterial({
      color: 0x1a0f1a,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
  )
  halo.position.set(0, 4.2, -0.05)
  halo.userData = { spin: true }
  sculpt.add(halo)

  group.userData = { monument: d, sculpt, labelDot }
  return group
}
