// One-shot procedural sound effects + held-tone handles.
//
// All sfx are factory functions: each invocation builds a small node graph,
// plays it, and schedules its own disposal once the envelope decays. No
// resource pooling — Web Audio cleans up garbage-collected nodes that have
// finished playing, and these chains are tiny (≤8 nodes). Peak gain across
// all sfx is capped at 0.15 — quieter than the engine sound, so they
// punctuate the experience without overpowering it.
//
// Held-tone helpers (`playTireScreech`, `playHorn`) return start/stop
// handles instead of firing-and-forgetting — the caller toggles them when
// drift/horn state changes.

// ──────────────────────────────────────────────────────────────────────
// One-shot factory functions
// ──────────────────────────────────────────────────────────────────────

/**
 * Major-third arpeggio (C5 → E5 → G5) on triangle oscillators. Total
 * duration ~0.4s. Fires when the car enters monument proximity.
 */
export function playDiscoverChime(ctx: AudioContext, bus: GainNode): void {
  const notes: number[] = [523.25, 659.25, 783.99] // C5, E5, G5
  const noteSpacing = 0.08
  const noteDuration = 0.32
  const baseGain = 0.12

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq

    const env = ctx.createGain()
    env.gain.value = 0

    osc.connect(env).connect(bus)

    const start = ctx.currentTime + i * noteSpacing
    const peak = start + 0.01
    const end = start + noteDuration

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(baseGain, peak)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.start(start)
    osc.stop(end + 0.02)
  })
}

/**
 * Ascending major triad fanfare (C5-E5-G5-C6) on sawtooth oscillators
 * through a lowpass at 4kHz. Total duration ~1.5s. Fires once when the
 * summit cinematic begins.
 */
export function playSummitFanfare(ctx: AudioContext, bus: GainNode): void {
  const notes: number[] = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
  const noteSpacing = 0.18
  const noteDuration = 1.1
  const baseGain = 0.1

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 4000
  lowpass.Q.value = 0.4
  lowpass.connect(bus)

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq

    const env = ctx.createGain()
    env.gain.value = 0
    osc.connect(env).connect(lowpass)

    const start = ctx.currentTime + i * noteSpacing
    const peak = start + 0.02
    const end = start + noteDuration

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(baseGain, peak)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.start(start)
    osc.stop(end + 0.05)
  })

  // Disconnect the shared lowpass once the longest note has decayed.
  setTimeout(() => {
    try {
      lowpass.disconnect()
    } catch {
      // ignore
    }
  }, (notes.length * noteSpacing + noteDuration + 0.2) * 1000)
}

/**
 * Fast 6-note random pentatonic flourish in the high register on triangle
 * oscillators. Total duration ~0.5s. Fires on any easter-egg discovery.
 */
export function playEasterEggSparkle(ctx: AudioContext, bus: GainNode): void {
  // C major pentatonic, octaves 5-6 (C5 E5 G5 A5 C6 E6 G6 A6 C7)
  const scale: number[] = [
    523.25, 659.25, 783.99, 880, 1046.5, 1318.51, 1567.98, 1760, 2093,
  ]
  const noteCount = 6
  const noteSpacing = 0.06
  const noteDuration = 0.2
  const baseGain = 0.08

  for (let i = 0; i < noteCount; i++) {
    const freq = scale[Math.floor(Math.random() * scale.length)]
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq

    const env = ctx.createGain()
    env.gain.value = 0
    osc.connect(env).connect(bus)

    const start = ctx.currentTime + i * noteSpacing
    const peak = start + 0.005
    const end = start + noteDuration

    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(baseGain, peak)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.start(start)
    osc.stop(end + 0.02)
  }
}

/**
 * Single short sine tick at G5 (~40ms). Fires on primary-CTA hover (use
 * sparingly — never on every interactive element).
 */
export function playUiHover(ctx: AudioContext, bus: GainNode): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 783.99 // G5

  const env = ctx.createGain()
  env.gain.value = 0
  osc.connect(env).connect(bus)

  const start = ctx.currentTime
  const peak = start + 0.005
  const end = start + 0.04

  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(0.06, peak)
  env.gain.exponentialRampToValueAtTime(0.0001, end)

  osc.start(start)
  osc.stop(end + 0.01)
}

// ──────────────────────────────────────────────────────────────────────
// Held-tone factories — return start/stop handles
// ──────────────────────────────────────────────────────────────────────

export interface HeldHandle {
  start: () => void
  stop: () => void
}

/**
 * Tire-screech generator. White-noise through a sharply resonant bandpass
 * (Q=8 at 1800 Hz) plus a fast attack envelope. Loops while the drift flag
 * is held. Quietly disposes when stop() is called.
 *
 * Per-instance node graph — calling start() again after stop() re-creates
 * the chain, so toggling drift mid-session keeps working.
 */
export function createTireScreech(ctx: AudioContext, bus: GainNode): HeldHandle {
  let noise: AudioBufferSourceNode | null = null
  let env: GainNode | null = null
  let filter: BiquadFilterNode | null = null
  let active = false

  const start = () => {
    if (active) return
    active = true
    try {
      // Short 1-second noise buffer, looped.
      const sampleRate = ctx.sampleRate
      const length = sampleRate * 1
      const buffer = ctx.createBuffer(1, length, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1

      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true

      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1800
      bp.Q.value = 8

      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(bp).connect(g).connect(bus)

      const t = ctx.currentTime
      // Fast attack to 0.1, sustains while drift is held.
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.1, t + 0.04)

      src.start(t)

      noise = src
      env = g
      filter = bp
    } catch {
      active = false
    }
  }

  const stop = () => {
    if (!active) return
    active = false
    try {
      const t = ctx.currentTime
      if (env) {
        env.gain.cancelScheduledValues(t)
        env.gain.setTargetAtTime(0, t, 0.08)
      }
      // Stop the noise source ~0.4s later so the gain has time to fade.
      const noiseLocal = noise
      const envLocal = env
      const filterLocal = filter
      noise = null
      env = null
      filter = null
      setTimeout(() => {
        try {
          noiseLocal?.stop()
          noiseLocal?.disconnect()
          filterLocal?.disconnect()
          envLocal?.disconnect()
        } catch {
          // ignore
        }
      }, 400)
    } catch {
      // ignore
    }
  }

  return { start, stop }
}

/**
 * Horn handle — A4 square wave with slight vibrato (5 Hz, ±10 cents).
 * Sustains while H key is held. Same per-instance-on-start pattern as
 * tire screech.
 */
export function createHorn(ctx: AudioContext, bus: GainNode): HeldHandle {
  let osc: OscillatorNode | null = null
  let vibrato: OscillatorNode | null = null
  let vibratoGain: GainNode | null = null
  let env: GainNode | null = null
  let active = false

  const start = () => {
    if (active) return
    active = true
    try {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = 440 // A4

      // Vibrato: 5 Hz sine modulating ±10 cents
      const v = ctx.createOscillator()
      v.type = 'sine'
      v.frequency.value = 5
      const vg = ctx.createGain()
      vg.gain.value = 4 // detune is in cents; ±10 -> set amplitude ~4 (sin range)
      v.connect(vg).connect(o.detune)

      const g = ctx.createGain()
      g.gain.value = 0

      o.connect(g).connect(bus)

      const t = ctx.currentTime
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.08, t + 0.02)

      o.start(t)
      v.start(t)

      osc = o
      vibrato = v
      vibratoGain = vg
      env = g
    } catch {
      active = false
    }
  }

  const stop = () => {
    if (!active) return
    active = false
    try {
      const t = ctx.currentTime
      if (env) {
        env.gain.cancelScheduledValues(t)
        env.gain.setTargetAtTime(0, t, 0.04)
      }
      const oscLocal = osc
      const vibLocal = vibrato
      const vibGainLocal = vibratoGain
      const envLocal = env
      osc = null
      vibrato = null
      vibratoGain = null
      env = null
      setTimeout(() => {
        try {
          oscLocal?.stop()
          vibLocal?.stop()
          oscLocal?.disconnect()
          vibLocal?.disconnect()
          vibGainLocal?.disconnect()
          envLocal?.disconnect()
        } catch {
          // ignore
        }
      }, 200)
    } catch {
      // ignore
    }
  }

  return { start, stop }
}
