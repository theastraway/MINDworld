// Procedural audio bed for LandingV2.
//
// This module is the single audio entry point for the scene. It owns:
//   - the AudioContext (lazily created on the first start() call, which
//     must be invoked after a user gesture so autoplay rules pass)
//   - a `masterBus: GainNode` that every audio source routes through, so
//     mute is one point of control
//   - the engine + boost oscillators (existing behavior)
//   - the ambient pad loop (Ambient.ts)
//   - the speed-correlated wind noise (Wind.ts)
//   - the tire-screech / horn held-tone handles (Sfx.ts)
//   - factory triggers for the one-shot sfx (discover chime, summit
//     fanfare, easter-egg sparkle, ui hover)
//
// AudioContext can only start after a user gesture (autoplay rules), so the
// caller is expected to start() the engine only once the intro card is
// dismissed AND mute is off. tickAudio() is throttled to roughly every 5
// frames internally — calling it every frame is fine and matches the
// monolith's behavior; the throttle counter lives inside this module so
// the scene loop stays clean.
//
// CRITICAL: setTargetAtTime called every frame queued thousands of events
// into the Web Audio schedule list, eventually throwing and killing the
// animation loop. The throttle (every 5 frames) plus cancelScheduledValues
// inside tickAudio keeps the queue bounded.
//
// iOS Safari: the AudioContext may start in `suspended` state even after a
// user gesture. start() calls ctx.resume() defensively to cover that case.

import { createAmbient, type AmbientHandle } from './Ambient'
import { createWind, type WindHandle } from './Wind'
import {
  createHorn,
  createTireScreech,
  playDiscoverChime as sfxPlayDiscoverChime,
  playEasterEggSparkle as sfxPlayEasterEggSparkle,
  playSummitFanfare as sfxPlaySummitFanfare,
  playUiHover as sfxPlayUiHover,
  type HeldHandle,
} from './Sfx'

interface EngineNodes {
  ctx: AudioContext
  /** Single mute point — every source routes through this gain. */
  masterBus: GainNode
  /** Dedicated bus for one-shot sfx so we can cap their level distinctly. */
  sfxBus: GainNode
  engineOsc: OscillatorNode
  engineGain: GainNode
  boostOsc: OscillatorNode
  boostGain: GainNode
  ambient: AmbientHandle
  wind: WindHandle
  tireScreech: HeldHandle
  horn: HeldHandle
}

export interface EngineHandle {
  /** Lazily create + start the audio nodes. Safe to call multiple times. */
  start: () => void
  /** Set muted state — drops/restores the master bus gain. */
  setMuted: (muted: boolean) => void
  /** Drop everything to 0 immediately (used when muted toggles on). */
  mute: () => void
  /** Per-frame call. Internally throttled. Drives engine + wind. */
  tickAudio: (velocity: number, boost: boolean) => void
  /** Toggle drift state — turns the tire screech loop on/off. */
  setDrift: (drift: boolean) => void
  /** Toggle horn — sustained A4 square while held. */
  setHorn: (on: boolean) => void
  /** One-shot — fires the monument-discover chime. */
  playDiscoverChime: () => void
  /** One-shot — fires the summit fanfare (use sparingly; ~1.5s long). */
  playSummitFanfare: () => void
  /** One-shot — fires the easter-egg sparkle. */
  playEasterEggSparkle: () => void
  /** One-shot — fires the UI hover tick (use sparingly — primary CTAs only). */
  playUiHover: () => void
  /** Stop oscillators + close the context. Idempotent. */
  dispose: () => void
}

export function createEngine(): EngineHandle {
  let nodes: EngineNodes | null = null
  let audioFrameCounter = 0
  let disposed = false
  let muted = false

  const start = () => {
    if (nodes || disposed) return
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      // iOS Safari: contexts may start suspended even after a gesture.
      // resume() is a no-op when already running, so call it defensively.
      void ctx.resume()

      // ── Master bus + sfx bus (single mute point) ──────────
      const masterBus = ctx.createGain()
      masterBus.gain.value = muted ? 0 : 1
      masterBus.connect(ctx.destination)

      const sfxBus = ctx.createGain()
      sfxBus.gain.value = 1
      sfxBus.connect(masterBus)

      // ── Engine oscillator + filter chain ──────────────────
      const engineOsc = ctx.createOscillator()
      engineOsc.type = 'sawtooth'
      engineOsc.frequency.value = 60
      const engineGain = ctx.createGain()
      engineGain.gain.value = 0
      const engineFilter = ctx.createBiquadFilter()
      engineFilter.type = 'lowpass'
      engineFilter.frequency.value = 600
      engineOsc.connect(engineFilter).connect(engineGain).connect(masterBus)
      engineOsc.start()

      // ── Boost layer — higher harmonic ─────────────────────
      const boostOsc = ctx.createOscillator()
      boostOsc.type = 'square'
      boostOsc.frequency.value = 180
      const boostGain = ctx.createGain()
      boostGain.gain.value = 0
      const boostFilter = ctx.createBiquadFilter()
      boostFilter.type = 'bandpass'
      boostFilter.frequency.value = 800
      boostFilter.Q.value = 1.2
      boostOsc.connect(boostFilter).connect(boostGain).connect(masterBus)
      boostOsc.start()

      // ── Ambient pad + wind ────────────────────────────────
      const ambient = createAmbient(ctx, masterBus)
      const wind = createWind(ctx, masterBus)

      // ── Held-tone handles (tire screech, horn) ────────────
      const tireScreech = createTireScreech(ctx, sfxBus)
      const horn = createHorn(ctx, sfxBus)

      nodes = {
        ctx,
        masterBus,
        sfxBus,
        engineOsc,
        engineGain,
        boostOsc,
        boostGain,
        ambient,
        wind,
        tireScreech,
        horn,
      }
    } catch {
      // Audio unsupported, silent fail
    }
  }

  const setMuted = (m: boolean) => {
    muted = m
    if (!nodes) return
    try {
      const t = nodes.ctx.currentTime
      nodes.masterBus.gain.cancelScheduledValues(t)
      nodes.masterBus.gain.setTargetAtTime(m ? 0 : 1, t, 0.08)
      // Propagate to sub-modules so they can stop scheduling internally
      // (no-op for unmute path — wind picks up via setVelocity, ambient via
      // its own ramp inside setMuted).
      nodes.ambient.setMuted(m)
      nodes.wind.setMuted(m)
    } catch {
      // ignore
    }
  }

  // Legacy alias — preserves the existing scene shell's `engine.mute()` call.
  const mute = () => setMuted(true)

  const tickAudio = (velocity: number, boost: boolean) => {
    audioFrameCounter++
    if (audioFrameCounter % 5 !== 0) return
    if (!nodes) return
    try {
      const speed = Math.abs(velocity)
      const targetFreq = 60 + speed * 12 + (boost ? 30 : 0)
      const targetGain = Math.min(0.05 + speed * 0.015, 0.18)
      const now = nodes.ctx.currentTime
      nodes.engineOsc.frequency.cancelScheduledValues(now)
      nodes.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08)
      nodes.engineGain.gain.cancelScheduledValues(now)
      nodes.engineGain.gain.setTargetAtTime(targetGain, now, 0.12)
      nodes.boostGain.gain.cancelScheduledValues(now)
      nodes.boostGain.gain.setTargetAtTime(boost && speed > 2 ? 0.06 : 0, now, 0.12)
      // Speed-correlated wind layer
      nodes.wind.setVelocity(velocity)
    } catch {
      // Audio scheduling errors are non-fatal — let the visual loop continue
    }
  }

  const setDrift = (drift: boolean) => {
    if (!nodes) return
    if (drift) nodes.tireScreech.start()
    else nodes.tireScreech.stop()
  }

  const setHorn = (on: boolean) => {
    if (!nodes) return
    if (on) nodes.horn.start()
    else nodes.horn.stop()
  }

  const playDiscoverChime = () => {
    if (!nodes || muted) return
    sfxPlayDiscoverChime(nodes.ctx, nodes.sfxBus)
  }

  const playSummitFanfare = () => {
    if (!nodes || muted) return
    sfxPlaySummitFanfare(nodes.ctx, nodes.sfxBus)
  }

  const playEasterEggSparkle = () => {
    if (!nodes || muted) return
    sfxPlayEasterEggSparkle(nodes.ctx, nodes.sfxBus)
  }

  const playUiHover = () => {
    if (!nodes || muted) return
    sfxPlayUiHover(nodes.ctx, nodes.sfxBus)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (!nodes) return
    try {
      nodes.ambient.stop()
      nodes.wind.stop()
      nodes.tireScreech.stop()
      nodes.horn.stop()
      nodes.engineOsc.stop()
      nodes.boostOsc.stop()
      nodes.ctx.close()
    } catch {
      // ignore
    }
    nodes = null
  }

  return {
    start,
    setMuted,
    mute,
    tickAudio,
    setDrift,
    setHorn,
    playDiscoverChime,
    playSummitFanfare,
    playEasterEggSparkle,
    playUiHover,
    dispose,
  }
}
