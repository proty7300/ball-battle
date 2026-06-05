// audio.js — procedural SFX via the Web Audio API.
// No external audio files required, so it works fully offline.
// Sounds are synthesized live from oscillators + filtered noise.

let ctx = null
let master = null
let enabled = true

function ac() {
  if (!ctx && typeof window !== 'undefined') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.3
      master.connect(ctx.destination)
    } catch (e) {
      enabled = false
    }
  }
  return ctx
}

// Must be called from a user gesture (click/keydown) to satisfy autoplay rules.
export function resumeAudio() {
  const c = ac()
  if (c && c.state === 'suspended') c.resume()
}

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v))
}

export function setEnabled(v) {
  enabled = !!v
}

function ramp(gainNode, t0, attack, decay, peak) {
  gainNode.gain.setValueAtTime(0.0001, t0)
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
}

function tone({ type = 'sine', freq = 440, freqEnd, dur = 0.15, peak = 0.5, when = 0 }) {
  if (!enabled) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + when
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  ramp(g, t0, Math.min(0.012, dur * 0.25), dur, peak)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noiseBurst({ dur = 0.3, peak = 0.5, filterType = 'lowpass', freq = 1000, freqEnd, when = 0 }) {
  if (!enabled) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + when
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const filt = c.createBiquadFilter()
  filt.type = filterType
  filt.frequency.setValueAtTime(freq, t0)
  if (freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur)
  const g = c.createGain()
  ramp(g, t0, 0.005, dur, peak)
  src.connect(filt)
  filt.connect(g)
  g.connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// ── Public SFX palette ───────────────────────────────────────────────────────
export const sfx = {
  // soft click on wall / ball bounce
  bounce() {
    tone({ type: 'triangle', freq: 330, freqEnd: 150, dur: 0.07, peak: 0.22 })
  },
  // generic damage hit; louder with bigger damage
  hit(power = 1) {
    const p = Math.min(0.5, 0.18 + power * 0.02)
    tone({ type: 'square', freq: 230, freqEnd: 90, dur: 0.11, peak: p })
    noiseBurst({ dur: 0.07, peak: p * 0.6, filterType: 'highpass', freq: 1800 })
  },
  // ability / ultimate cast whoosh
  ability() {
    tone({ type: 'sawtooth', freq: 280, freqEnd: 720, dur: 0.18, peak: 0.28 })
  },
  ultimate() {
    tone({ type: 'sawtooth', freq: 110, freqEnd: 620, dur: 0.6, peak: 0.4 })
    tone({ type: 'sine', freq: 300, freqEnd: 950, dur: 0.6, peak: 0.22, when: 0.02 })
  },
  // big boom; power scales loudness/length
  explosion(power = 1) {
    const p = Math.max(0.3, Math.min(0.85, 0.4 + power * 0.12))
    noiseBurst({ dur: 0.5, peak: p, filterType: 'lowpass', freq: 900, freqEnd: 60 })
    tone({ type: 'sine', freq: 95, freqEnd: 28, dur: 0.45, peak: 0.5 })
  },
  // king's golden sword shing
  sword() {
    tone({ type: 'square', freq: 950, freqEnd: 1700, dur: 0.06, peak: 0.16 })
    noiseBurst({ dur: 0.05, peak: 0.1, filterType: 'highpass', freq: 5000 })
  },
  // phoenix fireball drop
  fireball() {
    noiseBurst({ dur: 0.25, peak: 0.3, filterType: 'bandpass', freq: 700, freqEnd: 220 })
    tone({ type: 'sine', freq: 420, freqEnd: 160, dur: 0.22, peak: 0.2 })
  },
  // phoenix rebirth rising swell
  reborn() {
    tone({ type: 'sine', freq: 200, freqEnd: 1200, dur: 0.9, peak: 0.5 })
    noiseBurst({ dur: 0.6, peak: 0.35, filterType: 'highpass', freq: 300, freqEnd: 3000 })
  },
  // thomas train horn
  horn() {
    tone({ type: 'sawtooth', freq: 180, dur: 0.55, peak: 0.32 })
    tone({ type: 'sawtooth', freq: 240, dur: 0.55, peak: 0.26, when: 0.03 })
  },
  // victory jingle
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.25, peak: 0.4, when: i * 0.12 }))
  },
}
