import { CANVAS_W, CANVAS_H, BALL_RADIUS, ARENA_PAD, ARENA_CX, ARENA_CY, ARENA_R, ARENA_SHAPE, getNearestEnemy, frameDt, isTimeStopped, timeStopOwner } from './engine.js'

// Smooth screen-shake spring state (persists across frames)
const _shake = { x: 0, y: 0, vx: 0, vy: 0 }
// Offscreen canvas reused for the bloom / glow post-process pass
let _bloomCanvas = null
function applyBloom(ctx) {
  const cv = ctx.canvas
  const dw = Math.max(1, (cv.width / 2) | 0)
  const dh = Math.max(1, (cv.height / 2) | 0)
  if (!_bloomCanvas && typeof document !== 'undefined') _bloomCanvas = document.createElement('canvas')
  if (!_bloomCanvas) return
  if (_bloomCanvas.width !== dw || _bloomCanvas.height !== dh) { _bloomCanvas.width = dw; _bloomCanvas.height = dh }
  const bx = _bloomCanvas.getContext('2d')
  if (!bx) return
  bx.clearRect(0, 0, dw, dh)
  bx.filter = 'blur(3px) brightness(1.4)'
  bx.drawImage(cv, 0, 0, dw, dh)
  bx.filter = 'none'
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.5
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(_bloomCanvas, 0, 0, cv.width, cv.height)
  ctx.restore()
}

// ─── VFX helpers ────────────────────────────────────────────────────────────

function drawLightningBolt(ctx, x1, y1, x2, y2, segments = 6, spread = 14) {
 const pts = [{ x: x1, y: y1 }]
 for (let i = 1; i < segments; i++) {
 const t = i / segments
 pts.push({
 x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * spread,
 y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * spread,
 })
 }
 pts.push({ x: x2, y: y2 })
 ctx.beginPath()
 ctx.moveTo(pts[0].x, pts[0].y)
 for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
 ctx.stroke()
}

function drawShockwaveRing(ctx, x, y, radius, alpha, color) {
 ctx.save()
 ctx.globalAlpha = alpha
 ctx.strokeStyle = color
 ctx.lineWidth = 3
 ctx.shadowColor = color
 ctx.shadowBlur = 45
 ctx.beginPath()
 ctx.arc(x, y, radius, 0, Math.PI * 2)
 ctx.stroke()
 ctx.restore()
}

function drawFireCore(ctx, x, y, radius, tick) {
 // Layered radial gradients for a living flame core
 for (let layer = 3; layer >= 0; layer--) {
 const r = radius * (1 + layer * 0.4)
 const wobble = Math.sin(tick * 0.15 + layer) * 0.15
 const grad = ctx.createRadialGradient(x, y - radius * 0.2, 0, x, y, r)
 if (layer === 0) {
 grad.addColorStop(0, '#fff9f0')
 grad.addColorStop(0.25, '#fde68a')
 grad.addColorStop(0.6, '#f97316')
 grad.addColorStop(1, 'rgba(239,68,68,0)')
 } else {
 grad.addColorStop(0, `rgba(249,115,22,${0.15 - layer * 0.04})`)
 grad.addColorStop(1, 'rgba(239,68,68,0)')
 }
 ctx.save()
 ctx.globalAlpha = 0.6 + wobble
 ctx.beginPath()
 ctx.arc(x, y, r, 0, Math.PI * 2)
 ctx.fillStyle = grad
 ctx.fill()
 ctx.restore()
 }
}

function drawTeleportRift(ctx, x, y, radius, alpha) {
 ctx.save()
 ctx.globalAlpha = alpha
 // Spinning rings
 const ring1 = radius * 1.2
 const ring2 = radius * 0.7
 ctx.strokeStyle = '#06b6d4'
 ctx.lineWidth = 2
 ctx.shadowColor = '#06b6d4'
 ctx.shadowBlur = 40
 ctx.beginPath(); ctx.arc(x, y, ring1, 0, Math.PI * 2); ctx.stroke()
 ctx.strokeStyle = '#67e8f9'
 ctx.lineWidth = 1.5
 ctx.beginPath(); ctx.arc(x, y, ring2, 0, Math.PI * 2); ctx.stroke()
 // Cross sparks
 for (let i = 0; i < 6; i++) {
 const a = (i / 6) * Math.PI * 2
 ctx.strokeStyle = `rgba(103,232,249,${alpha * 0.8})`
 ctx.lineWidth = 1.5
 ctx.beginPath()
 ctx.moveTo(x + Math.cos(a) * ring2, y + Math.sin(a) * ring2)
 ctx.lineTo(x + Math.cos(a) * ring1, y + Math.sin(a) * ring1)
 ctx.stroke()
 }
 ctx.restore()
}

// ─── Main draw ───────────────────────────────────────────────────────────────

// ── Blaze INFERNO ARROW projectile: flaming arrow + long fiery trail ─────────
function drawInfernoArrow(ctx, p, now) {
  const ang = Math.atan2(p.vy, p.vx)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let t = 1; t <= 10; t++) {
    const tx = p.x - p.vx * t * 0.6
    const ty = p.y - p.vy * t * 0.6
    const tr = 18 * (1 - t * 0.07)
    ctx.globalAlpha = 0.5 - t * 0.045
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr * 1.6)
    g.addColorStop(0, '#fde68a')
    g.addColorStop(0.5, '#f97316')
    g.addColorStop(1, 'rgba(239,68,68,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(tx, ty, tr * 1.6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(ang)
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 40
  ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 6; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(20, 0); ctx.stroke()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath(); ctx.moveTo(38, 0); ctx.lineTo(14, -14); ctx.lineTo(20, 0); ctx.lineTo(14, 14); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(14, -9); ctx.lineTo(14, 9); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#f97316'
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-44, -10); ctx.lineTo(-28, 0); ctx.lineTo(-44, 10); ctx.closePath(); ctx.fill()
  ctx.shadowBlur = 20; ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(8, 0, 5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ── Thomas GHOST TRAIN: spectral tracks + ghostly aura + scary face + glow ───
function drawGhostTrain(ctx, train, now) {
  const tx = train.x, ty = train.y
  if (train.tracks && train.tracks.length > 1) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.shadowColor = '#60a5fa'; ctx.shadowBlur = 18
    ctx.strokeStyle = 'rgba(96,165,250,0.55)'; ctx.lineWidth = 3
    for (const off of [-7, 7]) {
      ctx.beginPath()
      ctx.moveTo(train.tracks[0].x - off, train.tracks[0].y + off)
      for (const t of train.tracks) ctx.lineTo(t.x - off, t.y + off)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(147,197,253,0.4)'; ctx.lineWidth = 2
    for (let i = 0; i < train.tracks.length; i += 3) {
      const t = train.tracks[i]; const prev = train.tracks[Math.max(0, i - 1)]
      const a = Math.atan2(t.y - prev.y, t.x - prev.x)
      ctx.beginPath()
      ctx.moveTo(t.x - 9 * Math.cos(a + Math.PI / 2), t.y - 9 * Math.sin(a + Math.PI / 2))
      ctx.lineTo(t.x + 9 * Math.cos(a + Math.PI / 2), t.y + 9 * Math.sin(a + Math.PI / 2))
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let s = 1; s <= 6; s++) {
    ctx.globalAlpha = 0.22 - s * 0.03
    ctx.fillStyle = s % 2 ? '#60a5fa' : '#a855f7'
    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 30
    ctx.beginPath(); ctx.arc(tx - s * 6, ty + Math.sin(now * 0.005 + s) * 4, 22 - s * 2, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = 0.7
  ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 50
  const bodyGrad = ctx.createLinearGradient(tx - 24, ty, tx + 24, ty)
  bodyGrad.addColorStop(0, 'rgba(96,165,250,0.85)')
  bodyGrad.addColorStop(1, 'rgba(168,85,247,0.7)')
  ctx.fillStyle = bodyGrad
  ctx.fillRect(tx - 24, ty - 14, 48, 28)
  ctx.fillRect(tx + 6, ty - 19, 18, 24)
  ctx.beginPath(); ctx.moveTo(tx - 24, ty - 9); ctx.lineTo(tx - 34, ty + 3); ctx.lineTo(tx - 24, ty + 14); ctx.fill()
  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 24
  ctx.fillStyle = '#fef08a'
  ctx.beginPath(); ctx.arc(tx - 12, ty - 3, 4.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(tx - 1, ty - 3, 4.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.beginPath(); ctx.arc(tx - 12, ty - 3, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(tx - 1, ty - 3, 2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(tx - 16, ty + 7)
  ctx.lineTo(tx - 12, ty + 3); ctx.lineTo(tx - 8, ty + 7); ctx.lineTo(tx - 4, ty + 3); ctx.lineTo(tx, ty + 7); ctx.lineTo(tx + 4, ty + 3)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#60a5fa'; ctx.shadowBlur = 20
  ctx.fillText('\uD83D\uDC7B', tx - 8, ty - 24)
  ctx.restore()
}

export function drawFrame(ctx, state, now) {
 const { projectiles, particles, trains, damageNumbers, shakeIntensity } = state
 const balls = state.balls || []
 const living = balls.filter(b => b && b.hp > 0)


 // Apply screen shake
 let shakeX = 0, shakeY = 0
 // Damped-spring screen shake: kick on impact, smooth spring-back
 const _kick = shakeIntensity.current
 if (_kick > 0) {
  _shake.vx += (Math.random() - 0.5) * _kick * 2.2
  _shake.vy += (Math.random() - 0.5) * _kick * 2.2
 }
 _shake.vx = (_shake.vx - _shake.x * 0.18) * 0.72
 _shake.vy = (_shake.vy - _shake.y * 0.18) * 0.72
 _shake.x += _shake.vx
 _shake.y += _shake.vy
 if (Math.abs(_shake.x) < 0.05 && Math.abs(_shake.vx) < 0.05) { _shake.x = 0; _shake.vx = 0 }
 if (Math.abs(_shake.y) < 0.05 && Math.abs(_shake.vy) < 0.05) { _shake.y = 0; _shake.vy = 0 }
 shakeX = _shake.x
 shakeY = _shake.y

 ctx.save()
 ctx.translate(shakeX, shakeY)

 // Background
 ctx.fillStyle = '#050a14'
 ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

 if (ARENA_SHAPE === 'circle') {
  // Circular arena floor + grid (clipped to circle)
  ctx.save()
  ctx.beginPath(); ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2); ctx.clip()
  const _floor = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 0, ARENA_CX, ARENA_CY, ARENA_R)
  _floor.addColorStop(0, '#0a1428')
  _floor.addColorStop(1, '#05080f')
  ctx.fillStyle = _floor; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.globalAlpha = 0.10
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, 0, ARENA_CX, CANVAS_H)
  ctx.fillStyle = '#ef4444'; ctx.fillRect(ARENA_CX, 0, CANVAS_W - ARENA_CX, CANVAS_H)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(20,40,100,0.35)'; ctx.lineWidth = 1
  for (let gx = 0; gx <= CANVAS_W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke() }
  for (let gy = 0; gy <= CANVAS_H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke() }
  ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.setLineDash([10, 10])
  ctx.beginPath(); ctx.moveTo(ARENA_CX, ARENA_CY - ARENA_R); ctx.lineTo(ARENA_CX, ARENA_CY + ARENA_R); ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
  // Neon circular border
  ctx.save()
  ctx.beginPath(); ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2)
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 28; ctx.stroke()
  ctx.beginPath(); ctx.arc(ARENA_CX, ARENA_CY, ARENA_R - 5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(167,139,250,0.6)'; ctx.lineWidth = 2; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 16; ctx.stroke()
  ctx.shadowBlur = 0
  ctx.restore()
 } else {
  // Rectangular arena floor + grid + border
  const _ax = ARENA_PAD, _ay = ARENA_PAD
  const _aw = CANVAS_W - ARENA_PAD * 2, _ah = CANVAS_H - ARENA_PAD * 2
  ctx.save()
  ctx.beginPath(); ctx.rect(_ax, _ay, _aw, _ah); ctx.clip()
  const _floor = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 0, ARENA_CX, ARENA_CY, Math.max(_aw, _ah) * 0.6)
  _floor.addColorStop(0, '#0a1428')
  _floor.addColorStop(1, '#05080f')
  ctx.fillStyle = _floor; ctx.fillRect(_ax, _ay, _aw, _ah)
  ctx.globalAlpha = 0.10
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(_ax, _ay, _aw / 2, _ah)
  ctx.fillStyle = '#ef4444'; ctx.fillRect(ARENA_CX, _ay, _aw / 2, _ah)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(20,40,100,0.35)'; ctx.lineWidth = 1
  for (let gx = _ax; gx <= _ax + _aw; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, _ay); ctx.lineTo(gx, _ay + _ah); ctx.stroke() }
  for (let gy = _ay; gy <= _ay + _ah; gy += 40) { ctx.beginPath(); ctx.moveTo(_ax, gy); ctx.lineTo(_ax + _aw, gy); ctx.stroke() }
  ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.setLineDash([10, 10])
  ctx.beginPath(); ctx.moveTo(ARENA_CX, _ay); ctx.lineTo(ARENA_CX, _ay + _ah); ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
  // Neon rectangular border
  ctx.save()
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 28
  ctx.strokeRect(_ax, _ay, _aw, _ah)
  ctx.strokeStyle = 'rgba(167,139,250,0.6)'; ctx.lineWidth = 2; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 16
  ctx.strokeRect(_ax + 5, _ay + 5, _aw - 10, _ah - 10)
  ctx.shadowBlur = 0
  ctx.restore()
 }

 // ── Ground illumination: dynamic light pools under each ball ──────────────
 ctx.save()
 ctx.globalCompositeOperation = 'lighter'
 for (const ball of living) {
  if (!ball || ball.hp <= 0) continue
  const gc = ball.char.glowColor || ball.char.color
  const lr = BALL_RADIUS * 3.4
  const lg = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, lr)
  lg.addColorStop(0, gc)
  lg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = ball.ultStage || ball.ultimateActive ? 0.34 : 0.2
  ctx.fillStyle = lg
  ctx.beginPath(); ctx.arc(ball.x, ball.y, lr, 0, Math.PI * 2); ctx.fill()
 }
 ctx.globalAlpha = 1
 ctx.restore()

 // ── Thomas tracks (railroad style with glow) ──────────────────────────────
 for (const ball of living) {
 if (ball.tracks && ball.tracks.length > 1) {
 ctx.lineCap = 'round'
 ctx.lineJoin = 'round'

 // Glow under tracks
 ctx.shadowColor = '#3b82f6'
 ctx.shadowBlur = 6

 // Left rail
 ctx.strokeStyle = '#60a5fa'
 ctx.lineWidth = 3
 ctx.beginPath()
 ctx.moveTo(ball.tracks[0].x - 8, ball.tracks[0].y - 8)
 for (const t of ball.tracks) ctx.lineTo(t.x - 8, t.y - 8)
 ctx.stroke()

 // Right rail
 ctx.beginPath()
 ctx.moveTo(ball.tracks[0].x + 8, ball.tracks[0].y + 8)
 for (const t of ball.tracks) ctx.lineTo(t.x + 8, t.y + 8)
 ctx.stroke()

 ctx.shadowBlur = 0

 // Railroad ties
 ctx.strokeStyle = '#374151'
 ctx.lineWidth = 3
 for (let i = 0; i < ball.tracks.length; i += 3) {
 const t = ball.tracks[i]
 const prev = ball.tracks[Math.max(0, i - 1)]
 const angle = Math.atan2(t.y - prev.y, t.x - prev.x)
 ctx.beginPath()
 ctx.moveTo(t.x - 10 * Math.cos(angle + Math.PI / 2), t.y - 10 * Math.sin(angle + Math.PI / 2))
 ctx.lineTo(t.x + 10 * Math.cos(angle + Math.PI / 2), t.y + 10 * Math.sin(angle + Math.PI / 2))
 ctx.stroke()
 }
 }
 }

 // ── Thomas train ──────────────────────────────────────────────────────────
 for (const train of trains) {
 if (!train.active || !train.x) continue

 const tx = train.x, ty = train.y

 if (train.ghost) { drawGhostTrain(ctx, train, now); continue }

 // Smoke trail (billowing puffs)
 ctx.save()
 for (let s = 0; s < 5; s++) {
 const puffR = 8 + s * 4
 const puffAlpha = 0.12 - s * 0.02
 ctx.globalAlpha = puffAlpha
 ctx.fillStyle = '#9ca3af'
 ctx.beginPath()
 ctx.arc(tx - 15 + Math.sin(now * 0.002 + s) * 5, ty - 22 - s * 8, puffR, 0, Math.PI * 2)
 ctx.fill()
 }
 ctx.restore()

 // Engine glow
 ctx.shadowColor = '#3b82f6'
 ctx.shadowBlur = 60

 // Train body
 ctx.fillStyle = '#1d4ed8'
 ctx.fillRect(tx - 22, ty - 12, 44, 24)

 // Cabin
 ctx.fillStyle = '#2563eb'
 ctx.fillRect(tx + 6, ty - 17, 16, 22)

 // Front cowcatcher
 ctx.fillStyle = '#1e40af'
 ctx.beginPath()
 ctx.moveTo(tx - 22, ty - 8)
 ctx.lineTo(tx - 30, ty + 2)
 ctx.lineTo(tx - 22, ty + 12)
 ctx.fill()

 // Windows with light
 ctx.fillStyle = '#fef3c7'
 ctx.shadowColor = '#fef3c7'
 ctx.shadowBlur = 35
 ctx.fillRect(tx + 8, ty - 14, 6, 5)
 ctx.fillRect(tx + 16, ty - 14, 6, 5)

 ctx.shadowBlur = 60
 ctx.shadowColor = '#3b82f6'

 // Smokestack
 ctx.fillStyle = '#374151'
 ctx.fillRect(tx - 17, ty - 20, 8, 10)

 // Wheels
 ctx.fillStyle = '#111827'
 ctx.strokeStyle = '#60a5fa'
 ctx.lineWidth = 1.5
 for (const wx of [tx - 13, tx, tx + 13]) {
 ctx.beginPath()
 ctx.arc(wx, ty + 12, 7, 0, Math.PI * 2)
 ctx.fill()
 ctx.stroke()
 // Wheel spoke
 ctx.strokeStyle = '#374151'
 ctx.lineWidth = 1
 const spokeAngle = (now * 0.01) % (Math.PI * 2)
 ctx.beginPath()
 ctx.moveTo(wx + Math.cos(spokeAngle) * 5, ty + 12 + Math.sin(spokeAngle) * 5)
 ctx.lineTo(wx - Math.cos(spokeAngle) * 5, ty + 12 - Math.sin(spokeAngle) * 5)
 ctx.stroke()
 ctx.strokeStyle = '#60a5fa'
 ctx.lineWidth = 1.5
 }

 // Sparks from wheels
 ctx.shadowColor = '#fbbf24'
 ctx.shadowBlur = 50
 ctx.fillStyle = '#fbbf24'
 for (let i = 0; i < 4; i++) {
 const sx = tx - 22 + Math.random() * 44
 const sy = ty + 18 + Math.random() * 5
 ctx.beginPath()
 ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
 ctx.fill()
 }

 ctx.shadowBlur = 0

 // Emoji
 ctx.font = '14px serif'
 ctx.textAlign = 'center'
 ctx.textBaseline = 'middle'
 ctx.fillText('🚂', tx, ty - 4)
 }

 // ── Projectiles ───────────────────────────────────────────────────────────
 for (const p of projectiles) {
 if (p.type === 'fireball') {
 // Living flame with trail
 ctx.save()
 // Long heat trail
 for (let t = 1; t <= 5; t++) {
 const tx2 = p.x - p.vx * t * 0.7
 const ty2 = p.y - p.vy * t * 0.7
 const tr = p.radius * (1 - t * 0.15)
 const alpha = 0.35 - t * 0.06
 ctx.globalAlpha = alpha
 ctx.shadowColor = '#f97316'
 ctx.shadowBlur = 35
 const g = ctx.createRadialGradient(tx2, ty2, 0, tx2, ty2, tr * 1.5)
 g.addColorStop(0, '#f97316')
 g.addColorStop(1, 'rgba(239,68,68,0)')
 ctx.fillStyle = g
 ctx.beginPath(); ctx.arc(tx2, ty2, tr * 1.5, 0, Math.PI * 2); ctx.fill()
 }
 ctx.restore()
 drawFireCore(ctx, p.x, p.y, p.radius, now)
 } else if (p.type === 'inferno_arrow') {
 drawInfernoArrow(ctx, p, now)
 } else if (p.type === 'kunai') {
 // NINJA kunai: gray/silver blade w/ blue tint + gray-crystal trail (Stasis). Frozen mid-air during time stop.
 const frozen = isTimeStopped()
 const ang = (p.angle != null ? p.angle : Math.atan2(p.vy, p.vx))
 ctx.save()
 // smooth ice-crystal gradient trail (white -> ice blue fade)
 const tlen = frozen ? 34 : 52
 const txp = p.x - Math.cos(ang) * tlen, typ = p.y - Math.sin(ang) * tlen
 const tg = ctx.createLinearGradient(p.x, p.y, txp, typ)
 tg.addColorStop(0, 'rgba(255,255,255,0.95)')
 tg.addColorStop(0.35, 'rgba(180,248,248,0.6)')
 tg.addColorStop(1, 'rgba(165,243,252,0)')
 ctx.globalCompositeOperation = 'lighter'
 ctx.lineCap = 'round'
 ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 28
 ctx.strokeStyle = tg; ctx.lineWidth = 9
 ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(txp, typ); ctx.stroke()
 // bright inner core line
 ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.5
 ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(ang) * tlen * 0.5, p.y - Math.sin(ang) * tlen * 0.5); ctx.stroke()
 ctx.shadowBlur = 0; ctx.globalAlpha = 1
 ctx.globalCompositeOperation = 'source-over'
 ctx.translate(p.x, p.y)
 ctx.rotate(ang)
 ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 28
 // blade (diamond pointing forward)
 ctx.beginPath()
 ctx.moveTo(15, 0); ctx.lineTo(4, -5); ctx.lineTo(1, 0); ctx.lineTo(4, 5)
 ctx.closePath()
 ctx.fillStyle = '#cbd5e1'; ctx.fill()
 ctx.lineWidth = 1.5; ctx.strokeStyle = '#B4F8F8'; ctx.stroke()
 ctx.shadowBlur = 0
 // handle
 ctx.fillStyle = '#6B7280'
 ctx.fillRect(-9, -1.6, 11, 3.2)
 // ring pommel
 ctx.beginPath(); ctx.arc(-11, 0, 3.4, 0, Math.PI * 2)
 ctx.lineWidth = 2; ctx.strokeStyle = '#9CA3AF'; ctx.stroke()
 // suspended-in-time sparkle ring
 if (frozen) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.strokeStyle = '#A5F3FC'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1 }
 ctx.restore()
 continue
 } else {
 const pr = Math.max(p.radius || 5, 7)
 if (p.type === 'toxic') {
  for (let d = 3; d >= 1; d--) { ctx.globalAlpha = 0.25 - d * 0.05; ctx.fillStyle = '#65a30d'; ctx.beginPath(); ctx.arc(p.x - p.vx * d * 0.6, p.y - p.vy * d * 0.6, pr, 0, Math.PI * 2); ctx.fill() }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#a3e635'; ctx.shadowColor = '#84cc16'; ctx.shadowBlur = 26
  ctx.beginPath(); ctx.arc(p.x, p.y, pr + 2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#ecfccb'; ctx.lineWidth = 2; ctx.stroke()
  ctx.shadowBlur = 0
  continue
 }
 if (p.type === 'hook') {
  ctx.save()
  ctx.strokeStyle = 'rgba(203,213,225,0.6)'
  ctx.lineWidth = 2.5
  ctx.shadowColor = '#cbd5e1'
  ctx.shadowBlur = 10
  for (let c = 1; c <= 3; c++) {
   ctx.beginPath()
   ctx.ellipse(p.x - p.vx * c * 1.1, p.y - p.vy * c * 1.1, 5, 3, Math.atan2(p.vy, p.vx), 0, Math.PI * 2)
   ctx.stroke()
  }
  ctx.restore()
 }
 ctx.fillStyle = '#c4b5fd'
 ctx.shadowColor = '#a78bfa'
 ctx.shadowBlur = 30
 ctx.beginPath()
 ctx.arc(p.x, p.y, pr + 2, 0, Math.PI * 2)
 ctx.fill()
 ctx.strokeStyle = '#ede9fe'
 ctx.lineWidth = 2
 ctx.stroke()
 }
 }
 ctx.shadowBlur = 0

 // ── Particles ─────────────────────────────────────────────────────────────
 for (const p of particles) {
 ctx.save()
 const pa = Math.max(0, Math.min(1, p.life))
 // ease-out cubic fade (stays bright, drops fast at the end)
 ctx.globalAlpha = 1 - Math.pow(1 - pa, 3)
 ctx.globalCompositeOperation = 'lighter'
 ctx.shadowColor = p.color
 ctx.shadowBlur = p.glow != null ? p.glow : 24

 if (p.shape === 'ring') {
 ctx.strokeStyle = p.color
 ctx.lineWidth = p.lineWidth || 3
 ctx.beginPath()
 ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
 ctx.stroke()
 } else if (p.shape === 'spark') {
 // Elongated motion-blurred spark
 const angle = p.angle != null ? p.angle : Math.atan2(p.vy, p.vx)
 ctx.save()
 ctx.translate(p.x, p.y)
 ctx.rotate(angle)
 const slen = p.size * (3 + Math.hypot(p.vx, p.vy) * 0.25)
 const sg = ctx.createLinearGradient(-slen, 0, slen * 0.4, 0)
 sg.addColorStop(0, 'rgba(255,255,255,0)')
 sg.addColorStop(0.7, p.color)
 sg.addColorStop(1, '#ffffff')
 ctx.fillStyle = sg
 ctx.fillRect(-slen, -p.size * 0.5, slen * 1.4, p.size)
 ctx.restore()
 } else {
 // Glowing ember with soft radial falloff
 const r = Math.max(0.5, p.size)
 const eg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2)
 eg.addColorStop(0, '#ffffff')
 eg.addColorStop(0.35, p.color)
 eg.addColorStop(1, 'rgba(0,0,0,0)')
 ctx.fillStyle = eg
 ctx.beginPath()
 ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2)
 ctx.fill()
 }
 ctx.restore()
 }
 ctx.globalAlpha = 1
 ctx.shadowBlur = 0

 // ── Ability aura effects drawn UNDER the ball ─────────────────────────────
 for (const ball of living) {
 drawAbilityAura(ctx, ball, now)
 }

 // ── Balls ─────────────────────────────────────────────────────────────────
 for (const ball of living) {
 drawBall(ctx, ball, now)
 }

 // Ultimate VFX overlays (clones, titan armor, wizard eye, dragon beam, king swords, phoenix sun)
 for (const _b of living) drawUltimateOverlays(ctx, _b, getNearestEnemy(_b, living) || _b, now)

 // ── HP bars ───────────────────────────────────────────────────────────────
 const _ta = balls.filter(b => b.team === 'A')
 const _tb = balls.filter(b => b.team === 'B')
 _ta.forEach((b, i) => { drawHpBar(ctx, b, 'left', 14 + i * 46); drawUltimateBar(ctx, b, 'left', 29 + i * 46) })
 _tb.forEach((b, i) => { drawHpBar(ctx, b, 'right', 14 + i * 46); drawUltimateBar(ctx, b, 'right', 29 + i * 46) })

 // ── Damage numbers ────────────────────────────────────────────────────────
 for (let i = damageNumbers.length - 1; i >= 0; i--) {
  const dn = damageNumbers[i]
  dn.life -= frameDt()
  dn.y -= frameDt() / 16.667 // Float up
  if (dn.life <= 0) {
   damageNumbers.splice(i, 1)
   continue
  }
  ctx.save()
  ctx.globalAlpha = Math.max(0, dn.life / 1000)
  ctx.fillStyle = dn.isCrit ? '#fbbf24' : '#fff'
  ctx.font = dn.isCrit ? 'bold 36px monospace' : 'bold 26px monospace'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = dn.isCrit ? `💥${dn.damage}!` : `-${dn.damage}`
  ctx.strokeText(text, dn.x, dn.y)
  ctx.fillText(text, dn.x, dn.y)
  ctx.restore()
 }

 ctx.restore() // Restore from screen shake

 // ── Ability cooldown ──────────────────────────────────────────────────────
 if (_ta.length === 1 && _tb.length === 1) {
  drawCooldown(ctx, _ta[0], 'left', CANVAS_H - 30)
  drawCooldown(ctx, _tb[0], 'right', CANVAS_H - 30)
 }

 // Bloom / glow post-process pass for extra pop
 applyBloom(ctx)
}

// ── Per-character ability aura effects ───────────────────────────────────────

function drawAbilityAura(ctx, ball, now) {
 const { charKey, x, y } = ball
 const isDashing = ball.isDashing && ball.dashUntil > now
  // Team identification ring
  if (ball.team) {
   ctx.save()
   const _tcol = ball.team === 'A' ? '#3b82f6' : '#ef4444'
   ctx.strokeStyle = _tcol; ctx.lineWidth = 3; ctx.shadowColor = _tcol; ctx.shadowBlur = 14; ctx.globalAlpha = 0.9
   ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 5, 0, Math.PI * 2); ctx.stroke()
   ctx.restore()
  }
 const tick = now * 0.001
 if (charKey === 'glacier' || charKey === 'venom' || charKey === 'seraph') { drawNewAbilityAura(ctx, ball, now); return }

 if (charKey === 'volt') {
 if (isDashing) {
 // Electric field around ball during dash
 ctx.save()
 ctx.strokeStyle = '#a78bfa'
 ctx.lineWidth = 2
 ctx.shadowColor = '#a78bfa'
 ctx.shadowBlur = 50

 // Jagged outer ring
 for (let seg = 0; seg < 12; seg++) {
 const a1 = (seg / 12) * Math.PI * 2
 const a2 = ((seg + 1) / 12) * Math.PI * 2
 const r1 = BALL_RADIUS + 8 + Math.random() * 10
 const r2 = BALL_RADIUS + 8 + Math.random() * 10
 ctx.beginPath()
 ctx.moveTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1)
 ctx.lineTo(x + Math.cos(a2) * r2, y + Math.sin(a2) * r2)
 ctx.stroke()
 }

 // Arc bolts outward
 ctx.lineWidth = 1.5
 ctx.strokeStyle = '#c4b5fd'
 for (let i = 0; i < 4; i++) {
 const angle = (i / 4) * Math.PI * 2 + tick * 3
 drawLightningBolt(
 ctx,
 x + Math.cos(angle) * BALL_RADIUS,
 y + Math.sin(angle) * BALL_RADIUS,
 x + Math.cos(angle) * (BALL_RADIUS + 22 + Math.random() * 8),
 y + Math.sin(angle) * (BALL_RADIUS + 22 + Math.random() * 8),
 4, 6
 )
 }
 ctx.restore()
 } else {
 // Idle: subtle sparks orbiting
 ctx.save()
 ctx.strokeStyle = 'rgba(167,139,250,0.5)'
 ctx.lineWidth = 1.2
 ctx.shadowColor = '#a78bfa'
 ctx.shadowBlur = 50
 for (let i = 0; i < 3; i++) {
 const a = (i / 3) * Math.PI * 2 + tick * 2
 const orbitR = BALL_RADIUS + 10
 drawLightningBolt(
 ctx,
 x + Math.cos(a) * orbitR * 0.6,
 y + Math.sin(a) * orbitR * 0.6,
 x + Math.cos(a + 0.4) * orbitR,
 y + Math.sin(a + 0.4) * orbitR,
 3, 4
 )
 }
 ctx.restore()
 }

 } else if (charKey === 'blaze') {
 // Flame halo always present
 ctx.save()
 ctx.shadowColor = '#ef4444'
 ctx.shadowBlur = 45
 for (let f = 0; f < 5; f++) {
 const fa = (f / 5) * Math.PI * 2 + tick * 1.8
 const fr = BALL_RADIUS + 4 + Math.sin(tick * 3 + f) * 3
 const grad = ctx.createRadialGradient(
 x + Math.cos(fa) * fr, y + Math.sin(fa) * fr, 0,
 x + Math.cos(fa) * fr, y + Math.sin(fa) * fr, 6
 )
 grad.addColorStop(0, 'rgba(253,186,116,0.7)')
 grad.addColorStop(1, 'rgba(239,68,68,0)')
 ctx.fillStyle = grad
 ctx.beginPath()
 ctx.arc(x + Math.cos(fa) * fr, y + Math.sin(fa) * fr, 6, 0, Math.PI * 2)
 ctx.fill()
 }
 // Inner heat shimmer
 const shimmer = ctx.createRadialGradient(x, y, BALL_RADIUS, x, y, BALL_RADIUS + 12)
 shimmer.addColorStop(0, 'rgba(249,115,22,0.25)')
 shimmer.addColorStop(1, 'rgba(249,115,22,0)')
 ctx.fillStyle = shimmer
 ctx.beginPath()
 ctx.arc(x, y, BALL_RADIUS + 12, 0, Math.PI * 2)
 ctx.fill()
 ctx.restore()

 } else if (charKey === 'phantom') {
 // Ghostly wisps orbiting
 ctx.save()
 for (let w = 0; w < 4; w++) {
 const wa = (w / 4) * Math.PI * 2 + tick * 1.4
 const wr = BALL_RADIUS + 8 + Math.sin(tick * 2 + w) * 4
 const wAlpha = 0.4 + 0.3 * Math.sin(tick * 3 + w)
 ctx.globalAlpha = wAlpha
 ctx.fillStyle = '#06b6d4'
 ctx.shadowColor = '#06b6d4'
 ctx.shadowBlur = 35
 ctx.beginPath()
 ctx.arc(x + Math.cos(wa) * wr, y + Math.sin(wa) * wr, 4 + Math.sin(tick * 4 + w) * 2, 0, Math.PI * 2)
 ctx.fill()
 }
 // Translucent ring
 ctx.globalAlpha = 0.25 + 0.1 * Math.sin(tick * 2)
 ctx.strokeStyle = '#67e8f9'
 ctx.lineWidth = 1.5
 ctx.shadowColor = '#06b6d4'
 ctx.shadowBlur = 12
 ctx.beginPath()
 ctx.arc(x, y, BALL_RADIUS + 14, 0, Math.PI * 2)
 ctx.stroke()
 ctx.restore()

 } else if (charKey === 'titan') {
 // Stone/rock aura with crumble particles
 ctx.save()
 ctx.strokeStyle = 'rgba(249,115,22,0.45)'
 ctx.lineWidth = 2
 ctx.shadowColor = '#f97316'
 ctx.shadowBlur = 14
 // Cracked ring
 for (let seg = 0; seg < 8; seg++) {
 const a1 = (seg / 8) * Math.PI * 2
 const a2 = ((seg + 0.8) / 8) * Math.PI * 2
 ctx.beginPath()
 ctx.arc(x, y, BALL_RADIUS + 10, a1, a2)
 ctx.stroke()
 }
 ctx.restore()

 } else if (charKey === 'anchor') {
 // Chain links orbiting
 ctx.save()
 ctx.strokeStyle = 'rgba(156,163,175,0.55)'
 ctx.lineWidth = 2.5
 ctx.shadowColor = '#9ca3af'
 ctx.shadowBlur = 35
 for (let c = 0; c < 4; c++) {
 const ca = (c / 4) * Math.PI * 2 + tick
 const cr = BALL_RADIUS + 9
 const cx2 = x + Math.cos(ca) * cr
 const cy2 = y + Math.sin(ca) * cr
 ctx.beginPath()
 ctx.ellipse(cx2, cy2, 5, 3, ca, 0, Math.PI * 2)
 ctx.stroke()
 }
 ctx.restore()

 } else if (charKey === 'thomas') {
 // Steam wisps
 ctx.save()
 for (let s = 0; s < 3; s++) {
 const sAlpha = (0.3 - s * 0.08) * (0.5 + 0.5 * Math.sin(tick * 2 + s))
 ctx.globalAlpha = sAlpha
 ctx.fillStyle = '#d1d5db'
 ctx.shadowColor = '#d1d5db'
 ctx.shadowBlur = 5
 const sr = 6 + s * 3
 ctx.beginPath()
 ctx.arc(x - 4 + Math.sin(tick + s) * 3, y - BALL_RADIUS - 8 - s * 7, sr, 0, Math.PI * 2)
 ctx.fill()
 }
 ctx.restore()
 }
}

// ── HP bar ────────────────────────────────────────────────────────────────────

function drawHpBar(ctx, ball, side, y) {
 const barW = 120
 const barH = 12
 const x = side === 'left' ? ARENA_PAD + 10 : CANVAS_W - ARENA_PAD - barW - 10

 ctx.fillStyle = '#111827'
 ctx.fillRect(x, y, barW, barH)

 const hpPct = Math.max(0, ball.hp / ball.maxHp)
 const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444'
 ctx.fillStyle = hpColor
 ctx.shadowColor = hpColor
 ctx.shadowBlur = 35
 ctx.fillRect(x + 2, y + 2, (barW - 4) * hpPct, barH - 4)
 ctx.shadowBlur = 0

 ctx.fillStyle = '#fff'
 ctx.font = 'bold 10px monospace'
 ctx.textAlign = side
 ctx.textBaseline = 'middle'
 const label = side === 'left'
 ? `${ball.char.emoji} ${Math.ceil(ball.hp)}/${ball.maxHp}`
 : `${Math.ceil(ball.hp)}/${ball.maxHp} ${ball.char.emoji}`
 ctx.fillText(label, side === 'left' ? x + barW / 2 : x + barW / 2, y + barH / 2)
}

// ── Ultimate bar ─────────────────────────────────────────────────────────────

function drawUltimateBar(ctx, ball, side, y) {
 const barW = 120
 const barH = 8
 const x = side === 'left' ? ARENA_PAD + 10 : CANVAS_W - ARENA_PAD - barW - 10

 // Background
 ctx.fillStyle = '#111827'
 ctx.fillRect(x, y, barW, barH)

 // Ultimate charge (0-5 attacks)
 const ultPct = Math.min(ball.attackCount / ball.char.ultimateCost, 1)
 
 // Color based on charge
 let ultColor = '#3b82f6' // Blue charging
 if (ball.ultimateActive) {
  ultColor = '#fbbf24' // Gold active
 } else if (ball.attackCount >= ball.char.ultimateCost) {
  ultColor = '#f59e0b' // Orange ready
 } else if (ball.attackCount >= Math.floor(ball.char.ultimateCost * 0.6)) {
  ultColor = '#a855f7' // Purple almost ready
 }

 ctx.fillStyle = ultColor
 ctx.shadowColor = ultColor
 ctx.shadowBlur = ball.ultimateActive ? 30 : 10
 ctx.fillRect(x + 2, y + 2, (barW - 4) * ultPct, barH - 4)
 ctx.shadowBlur = 0

 // Text
 ctx.fillStyle = '#fff'
 ctx.font = 'bold 8px monospace'
 ctx.textAlign = 'center'
 ctx.textBaseline = 'middle'
 let label = ball.ultimateActive ? '⚡ ULT ACTIVE! ⚡' : 'ULT: ' + ball.attackCount + '/' + ball.char.ultimateCost
 ctx.fillText(label, x + barW / 2, y + barH / 2)
}

// ── Cooldown display ──────────────────────��───────────────────────────────────

function drawCooldown(ctx, ball, side, y) {
 const now = performance.now()
 const cd = ball.char.abilityCooldown
 const elapsed = now - ball.lastAbility
 const pct = Math.min(elapsed / cd, 1)

 const x = side === 'left' ? ARENA_PAD + 60 : CANVAS_W - ARENA_PAD - 60
 const ready = pct >= 1

 if (ready) {
 ctx.shadowColor = ball.char.glowColor
 ctx.shadowBlur = 50
 }
 ctx.fillStyle = ready ? (ball.char.abilityColor || '#22c55e') : '#374151'
 ctx.font = 'bold 9px monospace'
 ctx.textAlign = 'center'
 ctx.fillText(ready ? '◆ READY' : `${(cd * (1 - pct) / 1000).toFixed(1)}s`, x, y)
 ctx.shadowBlur = 0
}

// ── Ball ──────────────────────────────────────────────────────────────────────

function drawBall(ctx, ball, now) {
if (!ball || ball.hp <= 0) return
  // PRO VFX: Draw trail FIRST (behind ball) — additive glow
 if (ball.trail && ball.trail.length > 0) {
 ctx.save()
 ctx.globalCompositeOperation = 'lighter'
 for (const t of ball.trail) {
  const tf = t.life / 500
  const tr = t.size * tf
  ctx.globalAlpha = Math.max(0, Math.min(1, t.alpha * tf))
  ctx.shadowColor = t.color || ball.char.color
  ctx.shadowBlur = 16
  ctx.fillStyle = t.color || ball.char.color
  ctx.beginPath()
  ctx.arc(t.x, t.y, tr, 0, Math.PI * 2)
  ctx.fill()
 }
 ctx.restore()
 }
 // EMERGENCY: If no char data, draw simple red ball
 if (!ball || !ball.char || !ball.x || !ball.y) {
  console.log('drawBall: MISSING DATA', ball)
  ctx.beginPath()
  ctx.arc(ball?.x || 300, ball?.y || 250, BALL_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = '#ff0000'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.font = 'bold 24px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText('ERROR', ball?.x || 300, ball?.y || 250)
  return
 }
 const pulse = 0.5 + 0.5 * Math.sin(now * 0.006 + ball.pulsePhase)
 const isDashing = ball.isDashing && ball.dashUntil > now

 // NINJA TIME DILATION — frozen balls wear a rotating gray crystal aura
 if (isTimeStopped() && ball !== timeStopOwner()) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.shadowColor = '#B4F8F8'; ctx.shadowBlur = 28
  // rotating crystal-shard ring (16 shards)
  ctx.strokeStyle = '#B4F8F8'; ctx.lineWidth = 2
  ctx.globalAlpha = 0.6
  for (let s = 0; s < 16; s++) {
   const a = now * 0.0006 + s * (Math.PI / 8)
   const rr = BALL_RADIUS + 6 + (s % 2 ? 4 : 0)
   const cx = ball.x + Math.cos(a) * rr, cy = ball.y + Math.sin(a) * rr
   ctx.beginPath()
   for (let v = 0; v < 4; v++) { const va = a + v * (Math.PI / 2); const r2 = v % 2 ? 3 : 6; const px = cx + Math.cos(va) * r2, py = cy + Math.sin(va) * r2; if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }
   ctx.closePath(); ctx.stroke()
  }
  // suspended ice-sparkle dots (100+ crystal feel)
  for (let s = 0; s < 28; s++) {
   const a = now * 0.0004 * (s % 2 ? 1 : -1) + s * 0.7
   const rr = BALL_RADIUS + 2 + (s * 1.3) % 20
   ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now * 0.004 + s)
   ctx.fillStyle = s % 3 === 0 ? '#ffffff' : (s % 3 === 1 ? '#B4F8F8' : '#A5F3FC')
   ctx.beginPath(); ctx.arc(ball.x + Math.cos(a) * rr, ball.y + Math.sin(a) * rr, 1.6 + (s % 3), 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 0.16; ctx.fillStyle = '#9CA3AF'
  ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
 }

 ctx.save()
 ctx.globalAlpha = ball.invisible ? 0.12 : (ball.ethereal ? 0.4 : 1)

 // Shadow
 ctx.beginPath()
 ctx.ellipse(ball.x, ball.y + BALL_RADIUS - 3, BALL_RADIUS * 0.75, BALL_RADIUS * 0.25, 0, 0, Math.PI * 2)
 ctx.fillStyle = 'rgba(0,0,0,0.35)'
 ctx.fill()

 // Glow
 ctx.shadowColor = isDashing ? '#a78bfa' : ball.char.glowColor
 ctx.shadowBlur = isDashing ? 30 : 18 + pulse * 8
  // Ultimate golden glow
  if (ball.ultimateActive) {
   ctx.shadowColor = '#fbbf24'
   ctx.shadowBlur = 35 + Math.sin(now * 0.01) * 15
  }
  // BLAZE CHARGING ULTIMATE - Extra glow + animation
  if (ball.charKey === 'blaze' && ball.isChargingUlt) {
   ctx.shadowColor = '#fbbf24'
   ctx.shadowBlur = 50 + Math.sin(now * 0.02) * 20
   // Draw bow/arrow charge rings
   const chargePct = (ball.ultChargeUntil - now) / 3000
   for (let i = 0; i < 3; i++) {
    const ringSize = BALL_RADIUS + 10 + i * 8 + (1 - chargePct) * 15
    const alpha = 0.3 + chargePct * 0.5
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ringSize, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`
    ctx.lineWidth = 3
    ctx.stroke()
   }
  }

 // PRO VFX: squash & stretch along velocity
 const spd = Math.hypot(ball.vx || 0, ball.vy || 0)
 const stretch = 1 + Math.min(0.35, spd * 0.025)
 const squash = 1 / stretch
 const moveAngle = Math.atan2(ball.vy || 0, ball.vx || 0)
 ctx.translate(ball.x, ball.y)
 ctx.rotate(moveAngle)
 ctx.scale(stretch, squash)
 ctx.rotate(-moveAngle)

 // Ball gradient
 const grad = ctx.createRadialGradient(-7, -7, 2, 0, 0, BALL_RADIUS)
 grad.addColorStop(0, ball.char.color)
 grad.addColorStop(1, ball.char.darkColor)
 ctx.beginPath()
 ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2)
 ctx.fillStyle = grad
 ctx.fill()

 // Rim
 ctx.strokeStyle = ball.char.color
 ctx.lineWidth = 2
 ctx.stroke()
 ctx.shadowBlur = 0

 // Shine
 const shineGrad = ctx.createRadialGradient(-7, -7, 1, -5, -5, BALL_RADIUS * 0.6)
 shineGrad.addColorStop(0, 'rgba(255,255,255,0.35)')
 shineGrad.addColorStop(1, 'rgba(255,255,255,0)')
 ctx.beginPath()
 ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2)
 ctx.fillStyle = shineGrad
 ctx.fill()

 // Emoji
 ctx.font = '17px serif'
 ctx.textAlign = 'center'
 ctx.textBaseline = 'middle'
 ctx.fillText(ball.char.emoji, 0, 1)
 ctx.restore()
 
}

// ── Reworked-ultimate VFX overlays (drawn on top of balls) ──────────────────────────
function drawUltimateOverlays(ctx, ball, enemy, now) {
  if (!ball || !ball.char) return
  drawNewUltimateOverlays(ctx, ball, enemy, now)
  // PHANTOM ARMY — draw identical clones
  if (ball.ultStage === 'clones' && ball.clones && ball.clones.length) {
    for (const c of ball.clones) {
      if (!c.alive) continue
      ctx.save()
      ctx.globalAlpha = 0.92
      ctx.shadowColor = ball.char.glowColor
      ctx.shadowBlur = 16
      const g = ctx.createRadialGradient(c.x - 7, c.y - 7, 2, c.x, c.y, BALL_RADIUS)
      g.addColorStop(0, ball.char.color)
      g.addColorStop(1, ball.char.darkColor)
      ctx.beginPath(); ctx.arc(c.x, c.y, BALL_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = ball.char.color; ctx.lineWidth = 2; ctx.stroke()
      ctx.shadowBlur = 0
      ctx.font = '17px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(ball.char.emoji, c.x, c.y + 1)
      ctx.restore()
    }
  }
  // TITAN IRON EARTH — stacking stone armor + DR counter
  if (ball.charKey === 'titan' && ((ball.drPercent || 0) > 0 || ball.ultStage === 'mode')) {
    const stacks = ball.drStacks || 0
    const pct = Math.round((ball.drPercent || 0) * 100)
    const active = ball.ultStage === 'mode'
    const grow = Math.min(stacks, 18) / 18
    ctx.save()
    ctx.lineWidth = 3 + grow * 6
    ctx.strokeStyle = active ? `rgba(124,45,18,${0.5 + grow * 0.4})` : 'rgba(75,85,99,0.75)'
    ctx.shadowColor = active ? '#ef4444' : '#6b7280'
    ctx.shadowBlur = active ? 10 + grow * 25 : 6
    for (let seg = 0; seg < 10; seg++) {
      const a1 = (seg / 10) * Math.PI * 2
      const a2 = ((seg + 0.75) / 10) * Math.PI * 2
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 6 + grow * 8, a1, a2); ctx.stroke()
    }
    ctx.restore()
    ctx.save()
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'
    const label = active ? `DR: ${pct}%` : `DR: ${pct}% (Hardened)`
    ctx.fillStyle = active ? '#f87171' : '#9ca3af'
    const ty = ball.y - BALL_RADIUS - 16
    ctx.strokeText(label, ball.x, ty)
    ctx.fillText(label, ball.x, ty)
    ctx.restore()
  }

  const ARENA = { left: ARENA_PAD, right: CANVAS_W - ARENA_PAD, top: ARENA_PAD, bottom: CANVAS_H - ARENA_PAD }

  // WIZARD — Celestial Judgment: cosmic eye, marking, beam, falling meteors
  if (ball.charKey === 'wizard' && (ball.ultStage === 'charge' || ball.ultStage === 'beam' || ball.ultStage === 'meteor' || ball.ultStage === 'mode')) {
    const eyeX = CANVAS_W / 2, eyeY = ARENA.top + 18
    let openK = 1
    if (ball.ultStage === 'charge') openK = Math.min(1, 1 - (ball.ultChargeUntil - now) / 3000)
    else if (ball.ultStage === 'mode') openK = 0.5
    ctx.save()
    ctx.globalAlpha = ball.ultStage === 'mode' ? 0.14 : 0.26
    ctx.fillStyle = '#2e1065'
    ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top)
    ctx.globalAlpha = 1
    ctx.beginPath(); ctx.ellipse(eyeX, eyeY, 46, 22 * openK + 2, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#1e1b4b'; ctx.fill()
    ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.arc(eyeX, eyeY, 11 * openK + 1, 0, Math.PI * 2)
    ctx.fillStyle = '#a855f7'; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 18; ctx.fill()
    ctx.shadowBlur = 0
    if (ball.ultStage !== 'meteor') {
      ctx.strokeStyle = 'rgba(239,68,68,0.9)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, BALL_RADIUS + 8, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, BALL_RADIUS + 14, 0.2, 1.4); ctx.stroke()
    }
    if (ball.ultStage === 'beam') {
      const g = ctx.createLinearGradient(eyeX, eyeY, enemy.x, enemy.y)
      g.addColorStop(0, 'rgba(196,181,253,0.9)'); g.addColorStop(1, 'rgba(168,85,247,0.25)')
      ctx.strokeStyle = g; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(eyeX, eyeY); ctx.lineTo(enemy.x, enemy.y); ctx.stroke()
    }
    if (ball.ultStage === 'meteor' && ball.meteors) {
      for (const m of ball.meteors) {
        if (m.hit) continue
        const k = Math.max(0, Math.min(1, (m.landAt - now) / 600))
        const sy = ARENA.top + (m.y - ARENA.top) * (1 - k)
        ctx.strokeStyle = 'rgba(251,146,60,0.9)'; ctx.lineWidth = 4
        ctx.beginPath(); ctx.moveTo(m.x, sy - 26); ctx.lineTo(m.x, sy); ctx.stroke()
        ctx.beginPath(); ctx.arc(m.x, sy, 6, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill()
        ctx.strokeStyle = 'rgba(239,68,68,0.6)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(m.x, m.y, BALL_RADIUS + 22, 0, Math.PI * 2); ctx.stroke()
      }
    }
    ctx.restore()
  }

  // ROBOT — Artillery Grid: hologram grid + electric puddles
  if (ball.charKey === 'robot' && (ball.ultStage === 'charge' || ball.ultStage === 'barrage' || ball.ultStage === 'mode')) {
    const cols = ball.gridCols || 3
    ctx.save()
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'; ctx.lineWidth = 1
    const gw = (ARENA.right - ARENA.left) / cols, gh = (ARENA.bottom - ARENA.top) / cols
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo(ARENA.left + i * gw, ARENA.top); ctx.lineTo(ARENA.left + i * gw, ARENA.bottom); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ARENA.left, ARENA.top + i * gh); ctx.lineTo(ARENA.right, ARENA.top + i * gh); ctx.stroke()
    }
    if (ball.ultStage === 'charge') {
      ctx.fillStyle = 'rgba(148,163,184,0.85)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      let n = 0
      for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) { ctx.fillText((1 + n * 0.5).toFixed(1), ARENA.left + (c + 0.5) * gw, ARENA.top + (r + 0.5) * gh); n++ }
    }
    for (const p of (ball.puddles || [])) {
      ctx.fillStyle = 'rgba(59,130,246,0.22)'
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.85, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(96,165,250,0.6)'; ctx.lineWidth = 1; ctx.stroke()
    }
    ctx.restore()
  }

  // DRAGON — Dragon's Wrath: locked fire laser + burn trail
  if (ball.charKey === 'dragon' && ball.ultStage === 'laser') {
    const ang = ball.laserAngle || 0
    const ex = ball.x + Math.cos(ang) * 800, ey = ball.y + Math.sin(ang) * 800
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(249,115,22,0.45)'; ctx.lineWidth = 60
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.strokeStyle = 'rgba(253,230,138,0.9)'; ctx.lineWidth = 26
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.shadowColor = '#f97316'; ctx.shadowBlur = 20
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.restore()
  }
  if (ball.charKey === 'dragon' && ball.burnNodes && ball.burnNodes.length) {
    ctx.save()
    for (const bn of ball.burnNodes) {
      ctx.fillStyle = 'rgba(249,115,22,0.3)'
      ctx.beginPath(); ctx.arc(bn.x, bn.y, 16, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  // NINJA — Time Dilation: charge ring + "TIME STOP" indicator above the ninja
  if (ball.charKey === 'ninja' && (ball.ultStage === 'charge' || ball.ultStage === 'timestop' || ball.ultStage === 'shatter')) {
    ctx.save()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    if (ball.ultStage === 'charge') {
      const pct = Math.max(0, Math.min(1, 1 - ((ball.ultChargeUntil || now) - now) / 2000))
      ctx.strokeStyle = '#A5F3FC'; ctx.shadowColor = '#A5F3FC'; ctx.shadowBlur = 14; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 12, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke()
      ctx.shadowBlur = 0; ctx.fillStyle = '#9CA3AF'; ctx.font = 'bold 11px monospace'
      ctx.fillText('CHARGING', ball.x, ball.y - BALL_RADIUS - 18)
    } else if (ball.ultStage === 'timestop') {
      const remain = Math.max(0, ((ball.ninjaStopUntil || now) - now) / 1000)
      ctx.fillStyle = '#A5F3FC'; ctx.shadowColor = '#A5F3FC'; ctx.shadowBlur = 16; ctx.font = 'bold 15px monospace'
      ctx.fillText('\u23F8 TIME STOP', ball.x, ball.y - BALL_RADIUS - 24)
      ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#cbd5e1'
      ctx.fillText(remain.toFixed(1) + 's', ball.x, ball.y - BALL_RADIUS - 9)
    }
    ctx.restore()
  }

  // BOMBER — Carpet Bombing: targeting sweep + lingering fire zones
  if (ball.charKey === 'bomber' && ['charge', 'bombing', 'carpet', 'landing'].includes(ball.ultStage)) {
    ctx.save()
    if (ball.ultStage === 'charge') {
      const sx = ARENA.left + ((now / 8) % (ARENA.right - ARENA.left))
      ctx.strokeStyle = 'rgba(239,68,68,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6])
      ctx.beginPath(); ctx.moveTo(sx, ARENA.top); ctx.lineTo(sx, ARENA.bottom); ctx.stroke()
      ctx.setLineDash([])
    }
    for (const f of (ball.bombFire || [])) {
      ctx.fillStyle = 'rgba(249,115,22,0.22)'
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.8, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(251,191,36,0.5)'; ctx.lineWidth = 1; ctx.stroke()
    }
    ctx.restore()
  }

  // KING — Royal Decree: rotating golden aura + flying swords with trails
  if (ball.charKey === 'king' && ball.ultStage === 'mode') {
    ctx.save()
    const t = now / 400
    ctx.strokeStyle = 'rgba(251,191,36,0.8)'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 14
    for (let r = 0; r < 2; r++) {
      ctx.lineWidth = 3 - r
      for (let seg = 0; seg < 8; seg++) {
        const a1 = (seg / 8) * Math.PI * 2 + t * (r ? -1 : 1)
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 8 + r * 6, a1, a1 + 0.5); ctx.stroke()
      }
    }
    ctx.shadowBlur = 0
    for (const s of (ball.kingSwords || [])) {
      const a = Math.atan2(s.vy, s.vx)
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a)
      ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10
      ctx.fillRect(-9, -2, 18, 4)
      ctx.beginPath(); ctx.moveTo(9, -4); ctx.lineTo(15, 0); ctx.lineTo(9, 4); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  // PHOENIX — Rising Sun: sun in the sky, lava spots, fire aura ring
  if (ball.charKey === 'phoenix' && ['charge', 'sunrain', 'mode'].includes(ball.ultStage)) {
    ctx.save()
    if (ball.ultStage === 'charge' || ball.ultStage === 'sunrain') {
      const sunX = CANVAS_W / 2, sunY = ARENA.top + 14
      const grow = ball.ultStage === 'sunrain' ? 1 : Math.min(1, 1 - (ball.ultChargeUntil - now) / 3000)
      const g = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 30 * grow + 6)
      g.addColorStop(0, '#fff7ed'); g.addColorStop(0.5, '#fbbf24'); g.addColorStop(1, 'rgba(244,63,94,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, 30 * grow + 6, 0, Math.PI * 2); ctx.fill()
    }
    for (const l of (ball.sunLava || [])) {
      ctx.fillStyle = 'rgba(244,63,94,0.22)'
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r * 0.8, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(251,146,60,0.5)'; ctx.lineWidth = 1; ctx.stroke()
    }
    if (ball.ultStage === 'mode') {
      ctx.strokeStyle = 'rgba(244,63,94,0.4)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 100, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
}


// ── NEW CHARACTER ability auras (Glacier / Venom / Seraph) ───────────────────
function drawNewAbilityAura(ctx, ball, now) {
  const { charKey, x, y } = ball
  const tick = now * 0.001
  ctx.save()
  if (charKey === 'glacier') {
    ctx.strokeStyle = 'rgba(125,211,252,0.6)'; ctx.lineWidth = 1.5; ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 22
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + tick
      const rr = BALL_RADIUS + 8 + Math.sin(tick * 2 + i) * 3
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
      ctx.beginPath()
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * Math.PI * 2; if (k === 0) ctx.moveTo(px + Math.cos(aa) * 4, py + Math.sin(aa) * 4); else ctx.lineTo(px + Math.cos(aa) * 4, py + Math.sin(aa) * 4) }
      ctx.closePath(); ctx.stroke()
    }
  } else if (charKey === 'venom') {
    ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 20
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + tick * 1.3
      const rr = BALL_RADIUS + 6 + Math.sin(tick * 3 + i) * 4
      const cx = x + Math.cos(a) * rr, cy = y + Math.sin(a) * rr
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7)
      g.addColorStop(0, 'rgba(190,242,100,0.7)'); g.addColorStop(1, 'rgba(101,163,13,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
    }
  } else if (charKey === 'seraph') {
    ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 24; ctx.strokeStyle = 'rgba(253,230,138,0.6)'; ctx.lineWidth = 1.5
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + tick * 0.8
      const r1 = BALL_RADIUS + 6, r2 = BALL_RADIUS + 13 + Math.sin(tick * 2 + i) * 2
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke()
    }
  }
  ctx.restore()
}

// ── NEW CHARACTER status + ultimate overlays ─────────────────────────────────
function drawNewUltimateOverlays(ctx, ball, enemy, now) {
  if (!ball || !ball.char) return
  const ARENA = { left: ARENA_PAD, right: CANVAS_W - ARENA_PAD, top: ARENA_PAD, bottom: CANVAS_H - ARENA_PAD }
  // Universal status indicators
  if (ball.poisonUntil && ball.poisonUntil > now) {
    ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 0.01)
    ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2; ctx.shadowColor = '#84cc16'; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 5, 0, Math.PI * 2); ctx.stroke()
    if (Math.random() < 0.4) { const a = Math.random() * Math.PI * 2; ctx.fillStyle = 'rgba(163,230,53,0.7)'; ctx.beginPath(); ctx.arc(ball.x + Math.cos(a) * (BALL_RADIUS + 4), ball.y + Math.sin(a) * (BALL_RADIUS + 4), 3, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }
  if ((ball.isFrozen && ball.freezeUntil > now) || (ball.moveSlowUntil && ball.moveSlowUntil > now && (ball.moveSlowFactor || 1) < 0.7)) {
    ctx.save(); ctx.strokeStyle = 'rgba(125,211,252,0.7)'; ctx.lineWidth = 2; ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 10
    for (let seg = 0; seg < 8; seg++) { const a1 = (seg / 8) * Math.PI * 2; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 4, a1, a1 + 0.5); ctx.stroke() }
    ctx.restore()
  }
  if (ball.regenUntil && ball.regenUntil > now) {
    ctx.save(); ctx.fillStyle = 'rgba(253,230,138,0.9)'; ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'
    if (Math.random() < 0.5) ctx.fillText('+', ball.x + (Math.random() * 24 - 12), ball.y - BALL_RADIUS - 6 - Math.random() * 8)
    ctx.restore()
  }
  if (ball.shieldUntil && ball.shieldUntil > now) {
    ctx.save(); ctx.globalAlpha = 0.5
    const g = ctx.createRadialGradient(ball.x, ball.y, BALL_RADIUS, ball.x, ball.y, BALL_RADIUS + 12)
    g.addColorStop(0, 'rgba(253,230,138,0)'); g.addColorStop(1, 'rgba(253,230,138,0.5)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 12, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(254,243,199,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 12, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  // GLACIER overlay
  if (ball.charKey === 'glacier' && ['charge', 'blizzard', 'mode'].includes(ball.ultStage)) {
    ctx.save()
    if (ball.ultStage === 'blizzard' || ball.ultStage === 'mode') {
      ctx.globalAlpha = ball.ultStage === 'mode' ? 0.1 : 0.18
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top)
      ctx.globalAlpha = 1
    }
    for (const s of (ball.shards || [])) {
      ctx.strokeStyle = 'rgba(186,230,253,0.9)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 16); ctx.lineTo(s.x, s.y); ctx.stroke()
      ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill()
    }
    if (ball.ultStage === 'charge') {
      const k = Math.min(1, 1 - (ball.ultChargeUntil - now) / 1500)
      ctx.strokeStyle = 'rgba(125,211,252,0.8)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 6 + k * 14, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
  // VENOM overlay
  if (ball.charKey === 'venom' && ['charge', 'outbreak', 'mode'].includes(ball.ultStage)) {
    ctx.save()
    if (ball.ultStage === 'outbreak') {
      const g = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.cloudR || 30)
      g.addColorStop(0, 'rgba(163,230,53,0.35)'); g.addColorStop(1, 'rgba(101,163,13,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.cloudR || 30, 0, Math.PI * 2); ctx.fill()
    }
    if (ball.ultStage === 'mode') {
      ctx.strokeStyle = 'rgba(132,204,22,0.5)'; ctx.lineWidth = 2; ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 130, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
  // SERAPH overlay
  if (ball.charKey === 'seraph' && ['charge', 'blessing', 'mode'].includes(ball.ultStage)) {
    ctx.save()
    if (ball.ultStage === 'mode' || ball.ultStage === 'blessing') {
      const rr = ball.ultStage === 'blessing' ? 90 : 70
      const g = ctx.createRadialGradient(ball.x, ball.y, BALL_RADIUS, ball.x, ball.y, rr)
      g.addColorStop(0, 'rgba(253,230,138,0)'); g.addColorStop(1, 'rgba(253,230,138,0.18)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, rr, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(254,243,199,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ball.x, ball.y, rr, 0, Math.PI * 2); ctx.stroke()
      const t = now / 600
      ctx.strokeStyle = 'rgba(253,230,138,0.5)'; ctx.lineWidth = 1.5
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + t; ctx.beginPath(); ctx.moveTo(ball.x + Math.cos(a) * (BALL_RADIUS + 6), ball.y + Math.sin(a) * (BALL_RADIUS + 6)); ctx.lineTo(ball.x + Math.cos(a) * rr, ball.y + Math.sin(a) * rr); ctx.stroke() }
    }
    if (ball.ultStage === 'charge') {
      const k = Math.min(1, 1 - (ball.ultChargeUntil - now) / 1500)
      ctx.strokeStyle = 'rgba(253,230,138,0.8)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS + 6 + k * 16, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
}
