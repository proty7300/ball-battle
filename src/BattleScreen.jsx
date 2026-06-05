import { useEffect, useRef, useCallback } from 'react'
import {
  BALL_RADIUS,
  setArena,
  createBall, updatePhysics, resolveCollision, checkWinner, getNearestEnemy,
  useAbility, updateProjectiles, updateTrains, updateBlazeUltimate, updateUltimates,
  beginFrame, slowMoFactor, triggerSlowMo, SLOWMO_CHARS,
  isTimeStopped, timeStopOwner,
} from './engine.js'
import { drawFrame } from './renderer.js'
import { CHARACTERS } from './characters.js'
import { sfx, resumeAudio } from './audio.js'

export default function BattleScreen({ teamA, teamB, mode, arenaShape = 'rect', onResult, onRecordingReady }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])

  // Canvas backing-store size depends on arena shape (must match engine setArena()).
  const CW = arenaShape === 'circle' ? 900 : 960
  const CH = arenaShape === 'circle' ? 900 : 540
  const maxW = arenaShape === 'circle' ? 520 : 620

  const initState = useCallback(() => {
    // Configure arena shape BEFORE spawning balls so spawn positions are correct.
    setArena(arenaShape)
    const aN = teamA.length
    const bN = teamB.length
    // Asymmetric balance: smaller team gets an HP buff (capped)
    const buff = (ally, enemy) => Math.min(2.4, Math.max(1, enemy / ally))
    const balls = []
    teamA.forEach((key, i) => {
      const b = createBall(key, 'left', CHARACTERS, 'A', i, aN)
      const m = buff(aN, bN)
      b.maxHp = Math.round(b.maxHp * m)
      b.hp = b.maxHp
      balls.push(b)
    })
    teamB.forEach((key, i) => {
      const b = createBall(key, 'right', CHARACTERS, 'B', i, bN)
      const m = buff(bN, aN)
      b.maxHp = Math.round(b.maxHp * m)
      b.hp = b.maxHp
      balls.push(b)
    })
    stateRef.current = {
      balls,
      projectiles: [],
      particles: [],
      trains: [],
      damageNumbers: [],
      shakeIntensity: { current: 0 },
      slowMo: { active: false, factor: 1.0, until: 0 },
      hitStop: { active: false, frames: 0 },
      phase: 'bouncing',
      startTime: performance.now(),
      winner: null,
    }
  }, [teamA, teamB, arenaShape])

  useEffect(() => {
    initState()
    resumeAudio()
    const unlockAudio = () => resumeAudio()
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // REPLAY: record the whole canvas (works for any number of balls + any arena)
    if (canvas && onRecordingReady) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      const cpuCores = navigator.hardwareConcurrency || 4
      const isLowEnd = isMobile || cpuCores <= 4
      const stream = canvas.captureStream(isLowEnd ? 30 : 60)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: isLowEnd ? 1500000 : 3000000,
        })
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunksRef.current.push(event.data)
        }
        mediaRecorderRef.current.start()
        console.log('Recording started')
      } catch (err) {
        console.warn('Recording not supported:', err)
      }
    }

    const loop = () => {
      const state = stateRef.current
      if (!state) return
      if (state.phase === 'done') return

      const { balls, projectiles, particles, trains, damageNumbers, hitStop } = state
      const ts = performance.now()

      if (hitStop.active) {
        hitStop.frames--
        if (hitStop.frames <= 0) hitStop.active = false
        drawFrame(ctx, state, ts)
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      let dt = ts - (state.lastTs || ts)
      if (!isFinite(dt) || dt <= 0) dt = 16.667
      if (dt > 50) dt = 50
      state.lastTs = ts
      const timeMult = slowMoFactor()
      const simScale = (dt / 16.667) * timeMult
      const currentTs = ts
      beginFrame(dt, timeMult)

      const living = balls.filter((b) => b.hp > 0)

      const anyCharge = living.some((b) => SLOWMO_CHARS.includes(b.charKey) && (b.isChargingUlt || b.ultSlowMo))
      const motionScale = anyCharge ? 0.3 : 1.0
      for (const b of living) updatePhysics(b, currentTs, motionScale)

      let bigHit = false
      if (!isTimeStopped()) for (let i = 0; i < living.length; i++) {
        for (let j = i + 1; j < living.length; j++) {
          const a = living[i]
          const b = living[j]
          const pre = Math.hypot(a.x - b.x, a.y - b.y)
          resolveCollision(a, b, damageNumbers, particles)
          const sp = Math.hypot(a.vx, a.vy) + Math.hypot(b.vx, b.vy)
          if (pre < BALL_RADIUS * 2 + 1 && sp > 14) bigHit = true
        }
      }
      if (bigHit) {
        triggerSlowMo(420, 0.3)
        hitStop.active = true
        hitStop.frames = 4
        state.shakeIntensity.current = Math.max(state.shakeIntensity.current, 14)
      }

      for (const b of living) {
        const enemy = getNearestEnemy(b, living)
        if (!enemy) continue
        if (isTimeStopped() && b !== timeStopOwner()) continue // frozen in time: skip ability/ult
        useAbility(b, enemy, projectiles, trains, particles, damageNumbers, currentTs)
        updateBlazeUltimate(b, enemy, projectiles, particles, ts)
        updateUltimates(b, enemy, projectiles, trains, particles, damageNumbers, ts)
        if (b.shakeRequest) {
          sfx.explosion(b.shakeRequest / 14)
          state.shakeIntensity.current = Math.max(state.shakeIntensity.current, b.shakeRequest)
          b.shakeRequest = 0
        }
        if (b.sfxRequest) {
          if (sfx[b.sfxRequest]) sfx[b.sfxRequest]()
          b.sfxRequest = null
        }
      }

      updateProjectiles(projectiles, balls, particles)
      if (!isTimeStopped()) updateTrains(trains, balls, particles)

      const MAX_PARTICLES = 1200
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES)
      if (!isTimeStopped()) for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i]
        pt.x += pt.vx * simScale
        pt.y += pt.vy * simScale
        if (pt.gravity) pt.vy += pt.gravity * simScale
        if (pt.drag) {
          const dr = Math.pow(pt.drag, simScale)
          pt.vx *= dr
          pt.vy *= dr
        }
        if (pt.spin != null) pt.angle = (pt.angle || 0) + pt.spin * simScale
        pt.life -= (pt.decay || 0.02) * simScale
        if (pt.shrink) pt.size *= Math.pow(pt.shrink, simScale)
        if (pt.life <= 0) particles.splice(i, 1)
      }

      if (state.shakeIntensity.current > 0) {
        state.shakeIntensity.current *= Math.pow(0.9, simScale)
        if (state.shakeIntensity.current < 0.3) state.shakeIntensity.current = 0
      }

      for (const b of balls) {
        if (b.hp <= 0) continue
        if (!b._sfx) b._sfx = { hp: b.hp, vsx: 0, vsy: 0, bt: 0, ult: false, drops: 0, swords: 0, stage: null }
        const sc = b._sfx
        if (b.hp < sc.hp - 0.5) sfx.hit(sc.hp - b.hp)
        sc.hp = b.hp
        const sgx = Math.sign(b.vx)
        const sgy = Math.sign(b.vy)
        if (((sgx !== 0 && sgx !== sc.vsx) || (sgy !== 0 && sgy !== sc.vsy)) && ts - sc.bt > 60) {
          sfx.bounce()
          sc.bt = ts
        }
        if (sgx !== 0) sc.vsx = sgx
        if (sgy !== 0) sc.vsy = sgy
        const ultOn = !!(b.ultStage || b.ultimateActive || b.isChargingUlt)
        if (ultOn && !sc.ult) sfx.ultimate()
        sc.ult = ultOn
        const drops = b.sunDrops || 0
        if (drops > sc.drops) sfx.fireball()
        sc.drops = drops
        const swl = (b.kingSwords && b.kingSwords.length) || 0
        if (swl > sc.swords) sfx.sword()
        sc.swords = swl
        if (b.charKey === 'phoenix' && b.ultStage === 'mode' && sc.stage !== 'mode') sfx.reborn()
        sc.stage = b.ultStage
      }
      if (state._sfxTrains === undefined) state._sfxTrains = trains.length
      if (trains.length > state._sfxTrains) sfx.horn()
      state._sfxTrains = trains.length

      const winner = checkWinner(balls)
      if (winner) {
        state.phase = 'done'
        state.winner = winner
        sfx.win()
        drawFrame(ctx, state, ts)

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
            const url = URL.createObjectURL(blob)
            const duration = ((performance.now() - state.startTime) / 1000).toFixed(1)
            onRecordingReady({ url, blob, duration, teamA, teamB, mode, arenaShape, winner })
            recordedChunksRef.current = []
          }
          mediaRecorderRef.current.stop()
          console.log('Recording stopped')
        }

        setTimeout(() => {
          onResult({ winner, balls, teamA, teamB, mode, arenaShape })
        }, 500)
        return
      }

      drawFrame(ctx, state, ts)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [teamA, teamB, mode, arenaShape, initState, onResult, onRecordingReady])

  const canvasStyle = {
    width: '100%',
    maxWidth: maxW,
    aspectRatio: CW + ' / ' + CH,
    display: 'block',
    borderRadius: arenaShape === 'circle' ? 24 : 16,
    background: '#050a14',
    boxShadow: '0 0 60px rgba(56,189,248,0.25)',
  }

  return <canvas ref={canvasRef} width={CW} height={CH} style={canvasStyle} />
}
