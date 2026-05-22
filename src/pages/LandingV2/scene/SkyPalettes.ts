// Time-of-day palette table for the LandingV2 sky + lighting (Wave 4 / D1
// — vision § 1 brand palette + § 2 outer ring + § 13 easter egg 5).
//
// Four palettes — dawn / day / dusk / night. Dusk is the default mounted
// state (matches the current production look + the warm cinematic vibe
// the brand is anchored on). The T-key easter egg cycles through them.
//
// Each palette carries everything the scene needs to feel coherent at
// that hour:
//
//   - top / mid / bottom — three sky-gradient stops fed into the shader
//     uniforms on `Sky.ts`. The shader smoothsteps between them along the
//     dome's vertical axis (top of the dome → top stop; horizon → bottom
//     stop) so the gradient reads as a real atmospheric sky rather than
//     a flat back-clear color.
//   - ambient — the AmbientLight color. Tints the entire scene a tiny bit
//     even where the directional sun isn't reaching.
//   - hemiSky / hemiGround — the HemisphereLight upper/lower colors.
//     Drives the soft cool-from-sky / warm-from-ground bounce that makes
//     low-poly geometry read as lit-by-sky rather than flat-shaded.
//   - sunIntensity — multiplier baked onto the DirectionalLight at scene
//     boot (1.1). The palette stores the absolute target value so the
//     SceneRoot can `directionalLight.intensity = palette.sunIntensity`
//     directly without remembering the base.
//   - fog — the FogExp2 color. Matches the bottom sky stop closely so
//     the horizon dissolves into atmosphere instead of cutting sharply.
//
// IMPORTANT — ACES tone-map compensation
// The Wave-2 / B1 PostFX pipeline applies ACES Filmic tone-mapping at
// OutputPass. ACES darkens mid-tones and desaturates shadows. Dusk's
// `top` + `mid` stops are PRE-bumped here (0x352630 / 0x8a5454 — the
// same values already living on `Sky.ts` before D1) so the warm dusk
// character is preserved AFTER tone-mapping. Dawn/day/night were tuned
// against the same tone-mapped pipeline by sampling rendered output, so
// values may look "wrong" raw but render correctly on-screen.
//
// All hex values are 0xRRGGBB integers (Three.js Color-friendly).

import * as THREE from 'three'

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * The four phases of the cycle, ordered the way the T-key easter egg
 * advances. Starts on dusk (the default mounted state), proceeds to
 * night, then dawn, then day, then back around to dusk.
 *
 * Exported so the React shell can index the current phase + advance it
 * with a single `(idx + 1) % CYCLE_ORDER.length`.
 */
export const CYCLE_ORDER: ReadonlyArray<TimeOfDay> = ['dusk', 'night', 'dawn', 'day']

export interface SkyPalette {
  /** Sky-shader uniform — top of the dome (zenith). */
  top: number
  /** Sky-shader uniform — middle band of the dome. */
  mid: number
  /** Sky-shader uniform — bottom of the dome (horizon). */
  bottom: number
  /** AmbientLight color. */
  ambient: number
  /** HemisphereLight upper-hemisphere color (sky bounce). */
  hemiSky: number
  /** HemisphereLight lower-hemisphere color (ground bounce). */
  hemiGround: number
  /** DirectionalLight (sun) intensity — absolute value. Day ≈ 1.20, night ≈ 0.35. */
  sunIntensity: number
  /** Scene fog color. Should track the bottom stop so the horizon dissolves. */
  fog: number
}

export const SKY_PALETTES: Record<TimeOfDay, SkyPalette> = {
  // Soft amber sunrise. Plum top fades into peach mid + warm cream
  // horizon. Sun is just-up so directional intensity drops slightly
  // below dusk's. Ambient is warm-tinted to keep the world inviting.
  dawn: {
    top: 0x3a2c4a,
    mid: 0xc97a6a,
    bottom: 0xe8c8a0,
    ambient: 0xfff0e0,
    hemiSky: 0xffd5b8,
    hemiGround: 0x3a2630,
    sunIntensity: 0.85,
    fog: 0xddbfa0,
  },

  // Midday clarity. Cool blue zenith → washed cyan band → warm sand
  // horizon. Highest sun intensity in the cycle so emissive surfaces
  // (brand red beam, monument letters) stay visible against the sky
  // luminance.
  day: {
    top: 0x4a8fcf,
    mid: 0x9cc8e8,
    bottom: 0xe8e0c8,
    ambient: 0xffffff,
    hemiSky: 0xc8e0ff,
    hemiGround: 0x6a7060,
    sunIntensity: 1.2,
    fog: 0xc8d8e0,
  },

  // CURRENT DEFAULT — cinematic dusk. Matches the bumped-for-ACES
  // values that have been on `Sky.ts` since the B1 post-FX wave so
  // the initial mounted scene looks identical to production.
  dusk: {
    top: 0x352630,
    mid: 0x8a5454,
    bottom: 0xe6c9a8,
    ambient: 0xffffff,
    hemiSky: 0xffe8c9,
    hemiGround: 0x3a2630,
    sunIntensity: 1.1,
    fog: 0xc9b9a8,
  },

  // Deep blue-black night. Cool ambient + low directional + cool
  // hemisphere preserves silhouettes. Brand-red emissives + the MIND
  // Tower beam read as primary light sources at night, which is the
  // intended cinematic — the world feels nocturnal but never grimdark.
  night: {
    top: 0x0a0f1f,
    mid: 0x1a1f3a,
    bottom: 0x2a2f4a,
    ambient: 0x6080a0,
    hemiSky: 0x4060a0,
    hemiGround: 0x0a0f1f,
    sunIntensity: 0.35,
    fog: 0x1a1f3a,
  },
}

/**
 * Friendly label for the active phase — used in the easter-egg toast that
 * fires on every T-key press so the user knows which phase they just
 * advanced to.
 */
export const PHASE_LABEL: Record<TimeOfDay, string> = {
  dawn: 'Dawn',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
}

/**
 * Cheap allocation-free conversion of a hex int into a `THREE.Color`
 * instance. Used by the Sky module + SceneRoot when applying palette
 * uniforms / light colors. Centralised here so all consumers go through
 * the same path (and so it's easy to swap to a perceptual color space
 * later if we ever upgrade the lerp).
 */
export function colorFromHex(hex: number): THREE.Color {
  return new THREE.Color(hex)
}
