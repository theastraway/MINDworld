// Speed-correlated procedural wind noise. White noise looped through a
// bandpass filter centered around 1500 Hz gives a soft "whoosh" character.
// A slow LFO modulates the filter frequency to make the wind feel alive
// rather than static. Gain opens up linearly as velocity exceeds 8 (matches
// the car's high-speed regime) and caps at 0.06 — well below the engine
// sound, so it adds presence without masking it.

export interface WindHandle {
  /** Update wind gain from current absolute velocity. */
  setVelocity: (velocity: number) => void
  /** Drop wind to silent (used when muted). */
  setMuted: (muted: boolean) => void
  /** Tear down. Idempotent. */
  stop: () => void
}

// Build a 2-second mono white-noise buffer; looped indefinitely it
// produces continuous wind. 2 seconds is long enough to avoid audible
// loop-points and short enough to stay cheap on memory.
function buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * 2
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

export function createWind(ctx: AudioContext, masterBus: GainNode): WindHandle {
  const noise = ctx.createBufferSource()
  noise.buffer = buildNoiseBuffer(ctx)
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1500
  filter.Q.value = 0.7

  // Slow LFO warbles the filter center between ~1200 Hz and ~1800 Hz
  const filterLfo = ctx.createOscillator()
  filterLfo.type = 'sine'
  filterLfo.frequency.value = 0.25
  const filterLfoGain = ctx.createGain()
  filterLfoGain.gain.value = 300
  filterLfo.connect(filterLfoGain).connect(filter.frequency)

  const windBus = ctx.createGain()
  windBus.gain.value = 0

  noise.connect(filter).connect(windBus).connect(masterBus)

  const now = ctx.currentTime
  noise.start(now)
  filterLfo.start(now)

  let stopped = false
  let muted = false

  const setVelocity = (velocity: number) => {
    if (stopped) return
    const speed = Math.abs(velocity)
    // Threshold = 8: under 8 the wind is silent. Above 8 it opens
    // proportionally up to 0.06 max at speed >= 14.
    const target = muted ? 0 : Math.max(0, Math.min((speed - 8) / 6, 1)) * 0.06
    try {
      const t = ctx.currentTime
      windBus.gain.cancelScheduledValues(t)
      windBus.gain.setTargetAtTime(target, t, 0.18)
    } catch {
      // ignore — non-fatal
    }
  }

  const setMuted = (m: boolean) => {
    muted = m
    if (stopped) return
    try {
      const t = ctx.currentTime
      windBus.gain.cancelScheduledValues(t)
      if (muted) windBus.gain.setTargetAtTime(0, t, 0.12)
      // Unmute path: the next setVelocity() call will lift the gain back to
      // its speed-correlated target, so nothing to do here.
    } catch {
      // ignore
    }
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      noise.stop()
      filterLfo.stop()
      noise.disconnect()
      filter.disconnect()
      filterLfo.disconnect()
      filterLfoGain.disconnect()
      windBus.disconnect()
    } catch {
      // ignore
    }
  }

  return { setVelocity, setMuted, stop }
}
