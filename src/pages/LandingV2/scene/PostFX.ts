/**
 * Cinematic post-processing pipeline for MIND World.
 *
 * Pipeline (top to bottom of stack):
 *   1. RenderPass        — base scene
 *   2. SSAOPass          — ambient occlusion (HI-QUALITY ONLY; toggled by LOD)
 *   3. UnrealBloomPass   — selective glow on emissive surfaces only
 *                          (threshold 0.85 → tower cap/letters, plinth rings,
 *                          monument label dots, car headlights, tail lights,
 *                          boost flames, drift sparks, beam pillar)
 *   4. SMAAPass          — anti-aliasing on low-poly edges
 *   5. OutputPass        — final ACES tone-map + sRGB conversion
 *
 * The composer is created lazily and returns a `PostFXHandle` exposing
 * `render()`, `onResize()`, `setQuality()`, and `dispose()`. SceneRoot
 * wraps the composer in a try/catch so any failure to construct it
 * (e.g. unsupported WebGL extension on an old browser) falls back to
 * the original `renderer.render(scene, camera)` path — never crashes.
 *
 * Brand notes:
 *   - Bloom strength + threshold tuned so the dusk SKY does not bloom,
 *     only emissive surfaces. The world keeps its warm dusk character.
 *   - ACES Filmic tone-mapping with exposure 1.05 gives cinematic
 *     warmth without crushing the brand red.
 *   - SSAO is wired between RenderPass and Bloom so contact shadows
 *     darken plinth-to-ground and tower-to-plaza joints; it is removed
 *     when the FPS-adaptive LOD flips to lo-quality.
 */

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export interface PostFXHandle {
  /** Underlying EffectComposer — exposed for advanced callers (debugging only). */
  composer: EffectComposer
  /** Draw a frame through the composed pipeline. Replaces `renderer.render(scene, camera)`. */
  render: () => void
  /** Resize all internal render targets when the canvas resizes. */
  onResize: (width: number, height: number) => void
  /**
   * Toggle expensive passes for FPS-adaptive LOD.
   *   - `lo === true`  → SSAO removed from the pipeline (saves ~5-15%)
   *   - `lo === false` → SSAO re-inserted between RenderPass and Bloom
   * Idempotent — calling with the current value is a no-op.
   */
  setQuality: (lo: boolean) => void
  /** Tear down composer + every pass. Called from SceneRoot.dispose(). */
  dispose: () => void
}

export interface PostFXOptions {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  width: number
  height: number
}

/**
 * Builds the post-FX pipeline. Mutates `renderer` to enable ACES tone-mapping
 * and sets `toneMappingExposure = 1.05`. Throws if EffectComposer construction
 * fails — the caller (SceneRoot) MUST wrap this in try/catch and fall back to
 * direct rendering on failure.
 */
export function createPostFX(opts: PostFXOptions): PostFXHandle {
  const { renderer, scene, camera, width, height } = opts

  // ── Tone-mapping for cinematic warmth ─────────────────────
  // ACES Filmic gives the dusk world a filmic roll-off in the highlights
  // (tower beam, brand red) without crushing the warm sand ground. The
  // 1.05 exposure is a touch above neutral to compensate for the
  // tone-mapper's mid-tone darkening.
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  // ── EffectComposer ────────────────────────────────────────
  const composer = new EffectComposer(renderer)
  composer.setSize(width, height)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // ── Pass 1: RenderPass (base scene) ───────────────────────
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // ── Pass 2: SSAO (hi-quality only — added after RenderPass) ──
  // Kernel 16 / radius 8 / minDist 0.005 / maxDist 0.1 produces a soft
  // contact occlusion ring under plinths, the tower, parked cars, and
  // monument bases without the speckled noise that aggressive SSAO
  // settings cause. Inserted at index 1 so it composes ONTO the base
  // scene render BEFORE bloom samples the result.
  const ssaoPass = new SSAOPass(scene, camera, width, height, 16)
  ssaoPass.kernelRadius = 8
  ssaoPass.minDistance = 0.005
  ssaoPass.maxDistance = 0.1
  // Default output mode is the AO-composited scene — leave as-is.
  composer.addPass(ssaoPass)

  // ── Pass 3: UnrealBloomPass (selective glow) ──────────────
  // threshold 0.85 means only surfaces whose luminance exceeds ~0.85
  // bloom. That excludes the dusk sky (mid-luma) and the warm sand
  // ground (low-luma) while catching the brand-red tower cap, the
  // MIND letter front-faces (emissiveMap), the plinth rings (MeshBasic
  // at brand-red), the monument label dots, the car headlights/tail
  // lights, the boost flames (AdditiveBlending), drift sparks, and
  // the beam pillar. strength 0.6 + radius 0.45 = soft halo, not
  // video-game-y over-bloom.
  const bloomResolution = new THREE.Vector2(width, height)
  const bloomPass = new UnrealBloomPass(
    bloomResolution,
    /* strength = */ 0.6,
    /* radius   = */ 0.45,
    /* threshold= */ 0.85
  )
  composer.addPass(bloomPass)

  // ── Pass 4: SMAA (anti-aliasing) ──────────────────────────
  // SMAA gives clean edges on the low-poly aesthetic without the cost
  // of MSAA at high pixel ratios. Cheaper than FXAA on modern GPUs and
  // preserves sub-pixel detail (helpful for the orbiting halo letters
  // and stats-ring sprites).
  const smaaPass = new SMAAPass()
  composer.addPass(smaaPass)

  // ── Pass 5: OutputPass (tone-map + sRGB) ──────────────────
  // OutputPass handles the tone-mapping + sRGB conversion that the
  // composer's internal float render targets bypass. Without this,
  // the final image is washed out / wrong-gamma.
  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  // ── Quality state ─────────────────────────────────────────
  // We track lo/hi quality so re-flips can re-attach / detach SSAO
  // without reconstructing the whole composer (which would cost the
  // shadow-map + render-target re-allocation hitch).
  let loQuality = false

  const render = () => {
    composer.render()
  }

  const onResize = (w: number, h: number) => {
    composer.setSize(w, h)
    // UnrealBloomPass tracks its own resolution Vector2 — keep it in sync.
    bloomPass.resolution.set(w, h)
    // SSAOPass + SMAAPass internal RTs are resized via composer.setSize,
    // but SSAOPass also tracks width/height fields used in shader uniforms.
    ssaoPass.width = w
    ssaoPass.height = h
  }

  const setQuality = (lo: boolean) => {
    if (loQuality === lo) return
    loQuality = lo
    if (lo) {
      // Remove SSAO from the pipeline. EffectComposer.removePass takes the
      // Pass instance and re-shuffles `passes` internally.
      composer.removePass(ssaoPass)
    } else {
      // Re-insert SSAO at index 1 (right after RenderPass, before Bloom).
      composer.insertPass(ssaoPass, 1)
    }
  }

  const dispose = () => {
    // Pass.dispose() is a no-op on Three's base Pass but child passes
    // override it where needed (SSAOPass owns render targets + shaders;
    // UnrealBloomPass owns multiple downsample RTs; SMAAPass owns
    // textures). Safe to call on every pass.
    composer.passes.forEach((p) => {
      try {
        p.dispose()
      } catch {
        // Some passes don't implement dispose — swallow.
      }
    })
    // Composer owns its read/write RTs.
    composer.dispose()
  }

  return { composer, render, onResize, setQuality, dispose }
}
