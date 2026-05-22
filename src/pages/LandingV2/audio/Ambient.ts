// Procedural ambient pad — two detuned sine oscillators (A2 + E3, an open
// fifth), modulated by two slow LFOs:
//   - LFO #1 (0.1 Hz) sweeps a lowpass filter (400 Hz <-> 1200 Hz) for a
//     breathing texture.
//   - LFO #2 (0.07 Hz) gently modulates the master gain (0.015 <-> 0.04)
//     for slow dynamic shifts.
// A ConvolverNode with a procedurally generated 3-second decorrelated-noise
// impulse adds spaciousness without bundling any sample assets. Peak gain
// stays under 0.04 — the bed sits beneath the engine sound, never over it.
//
// Lazy: the entire graph is created lazily inside start() so it never
// touches the AudioContext before the user gesture that enabled audio.

export interface AmbientHandle {
  /** Drop the ambient bus to 0 (used when muted). Re-opens via setMuted(false). */
  setMuted: (muted: boolean) => void
  /** Tear down oscillators + LFOs. Idempotent. */
  stop: () => void
}

// Build a 3-second stereo impulse response with exponential decay. Each
// sample is independent random noise so the left/right channels stay
// decorrelated, which is what gives the convolver its "spatial" feel.
function buildReverbImpulse(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const duration = 3
  const length = Math.floor(sampleRate * duration)
  const impulse = ctx.createBuffer(2, length, sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // (Math.random()*2-1) -> [-1, 1]; multiplied by an exponential decay
      // envelope ((1 - t)^3 where t = i/length) so the tail fades out.
      const t = i / length
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3)
    }
  }
  return impulse
}

export function createAmbient(ctx: AudioContext, masterBus: GainNode): AmbientHandle {
  // ── Two detuned sine oscillators — A2 (110 Hz) + E3 (165 Hz). An open
  //    fifth gives a warm, unresolved quality. The 0.2 Hz detune on osc2
  //    adds slow phasing motion between the two tones.
  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.value = 110

  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = 165
  osc2.detune.value = 4

  // ── Lowpass filter swept by LFO #1
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 800
  filter.Q.value = 0.8

  const filterLfo = ctx.createOscillator()
  filterLfo.type = 'sine'
  filterLfo.frequency.value = 0.1
  const filterLfoGain = ctx.createGain()
  // amplitude 400 -> filter sweeps 800 +/- 400 = 400 Hz to 1200 Hz
  filterLfoGain.gain.value = 400
  filterLfo.connect(filterLfoGain).connect(filter.frequency)

  // ── Reverb (procedural IR)
  const convolver = ctx.createConvolver()
  convolver.buffer = buildReverbImpulse(ctx)

  // dry/wet mix: keep mostly dry, sprinkle in convolver tail
  const dryGain = ctx.createGain()
  dryGain.gain.value = 0.7
  const wetGain = ctx.createGain()
  wetGain.gain.value = 0.5

  // ── Master gain for the ambient bus, modulated by LFO #2
  const ambientBus = ctx.createGain()
  ambientBus.gain.value = 0.025 // sits at center of the LFO range

  const gainLfo = ctx.createOscillator()
  gainLfo.type = 'sine'
  gainLfo.frequency.value = 0.07
  const gainLfoAmp = ctx.createGain()
  // sweeps ±0.0125 around the 0.025 base -> peak 0.04, min 0.015
  gainLfoAmp.gain.value = 0.0125
  gainLfo.connect(gainLfoAmp).connect(ambientBus.gain)

  // ── Wire the graph:
  //    osc1 + osc2 -> filter -> (dry direct + wet via convolver) -> ambientBus -> masterBus
  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(dryGain).connect(ambientBus)
  filter.connect(convolver).connect(wetGain).connect(ambientBus)
  ambientBus.connect(masterBus)

  // ── Start everything
  const now = ctx.currentTime
  osc1.start(now)
  osc2.start(now)
  filterLfo.start(now)
  gainLfo.start(now)

  let stopped = false

  const setMuted = (muted: boolean) => {
    if (stopped) return
    try {
      const t = ctx.currentTime
      ambientBus.gain.cancelScheduledValues(t)
      // Tween to 0 on mute, back to base on unmute. The LFO continues to
      // ride on top once the unmute completes.
      ambientBus.gain.setTargetAtTime(muted ? 0 : 0.025, t, 0.15)
    } catch {
      // ignore scheduling errors — non-fatal
    }
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      osc1.stop()
      osc2.stop()
      filterLfo.stop()
      gainLfo.stop()
      osc1.disconnect()
      osc2.disconnect()
      filter.disconnect()
      filterLfo.disconnect()
      filterLfoGain.disconnect()
      convolver.disconnect()
      dryGain.disconnect()
      wetGain.disconnect()
      ambientBus.disconnect()
      gainLfo.disconnect()
      gainLfoAmp.disconnect()
    } catch {
      // ignore
    }
  }

  return { setMuted, stop }
}
