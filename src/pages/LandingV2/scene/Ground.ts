import * as THREE from 'three'

// Procedural low-poly ground plane: vertex-height noise plus per-vertex color
// mixing between two sand tones. Edges rise into a soft basin via a
// distance-from-center smoothstep so the world feels bowl-shaped at the rim.
export function createGround(): THREE.Mesh {
  const groundSize = 240
  const groundSegments = 60
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, groundSegments, groundSegments)
  groundGeo.rotateX(-Math.PI / 2)

  const pos = groundGeo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const baseColor = new THREE.Color(0xb59c84)
  const altColor  = new THREE.Color(0xa08773)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    // distance from center for radial gradient
    const r = Math.hypot(x, z)
    const noise = Math.sin(x * 0.18) * Math.cos(z * 0.18) * 0.4
                + Math.sin(x * 0.05 + z * 0.07) * 0.9
    const edge = THREE.MathUtils.smoothstep(r, 30, 120) * 1.2
    pos.setY(i, noise + edge)
    const c = baseColor.clone().lerp(altColor, (Math.sin(x * 0.2) + Math.cos(z * 0.15)) * 0.5 + 0.5)
    colors[i * 3 + 0] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  groundGeo.computeVertexNormals()
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.receiveShadow = true
  return ground
}
