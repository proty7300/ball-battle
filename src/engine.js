export let CANVAS_W = 960
export let CANVAS_H = 540
export const BALL_RADIUS = 24
export const ARENA_PAD = 36
export let ARENA_CX = CANVAS_W / 2
export let ARENA_CY = CANVAS_H / 2
export let ARENA_R = 250
export let ARENA_SHAPE = 'rect'
// Switch arena shape; rectangle (960x540) is the classic default, circle is 800px diameter.
export function setArena(shape) {
  if (shape === 'circle') {
    ARENA_SHAPE = 'circle'
    CANVAS_W = 900
    CANVAS_H = 900
    ARENA_CX = 450
    ARENA_CY = 450
    ARENA_R = 400
  } else {
    ARENA_SHAPE = 'rect'
    CANVAS_W = 960
    CANVAS_H = 540
    ARENA_CX = 480
    ARENA_CY = 270
    ARENA_R = 250
  }
}

export function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)) }
export function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) }
export function normalize(v) {
 const m = Math.sqrt(v.x ** 2 + v.y ** 2) || 1
 return { x: v.x / m, y: v.y / m }
}

// Physics constants - NO GRAVITY, constant bouncing
const BOUNCE_DAMPING = 1.0
const MIN_SPEED = 2
const MAX_SPEED = 8

// Frame clock: delta-time stepping + engine-driven slow motion
export const FRAME_MS = 1000 / 60
let _frameScale = 1
let _frameDt = FRAME_MS
let _slowUntil = 0
let _slowFactor = 1
function _nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now() }
export function beginFrame(dtMs, slowFactor = 1) {
  let d = dtMs
  if (!isFinite(d) || d <= 0) d = FRAME_MS
  if (d > 50) d = 50
  _frameDt = d * slowFactor
  _frameScale = (d / FRAME_MS) * slowFactor
}
export function frameScale() { return _frameScale }
export function frameDt() { return _frameDt }
export function triggerSlowMo(durationMs = 420, factor = 0.3) {
  _slowUntil = _nowMs() + durationMs
  _slowFactor = factor
}
export function slowMoFactor() {
  return _nowMs() < _slowUntil ? _slowFactor : 1
}

// NINJA "Time Dilation": global time-stop. While active, every ball and
// projectile is frozen EXCEPT the ninja that cast it (timeStopOwner).
let _timeStopUntil = 0
let _timeStopOwner = null
export function triggerTimeStop(owner, durationMs = 2000) { _timeStopUntil = _nowMs() + durationMs; _timeStopOwner = owner }
export function endTimeStop() { _timeStopUntil = 0; _timeStopOwner = null }
export function isTimeStopped() { return _nowMs() < _timeStopUntil }
export function timeStopOwner() { return _timeStopOwner }

// FINAL DESIGN: only these 7 characters trigger ult charge/mode slow-mo.
export const SLOWMO_CHARS = ['blaze', 'volt', 'titan', 'dragon', 'king', 'seraph', 'wizard']

export function createBall(charKey, side, CHARACTERS, team = side === 'left' ? 'A' : 'B', slot = 0, slotCount = 1) {
 const char = CHARACTERS[charKey]
 const angle = Math.random() * Math.PI * 2
 const speed = 4 + Math.random() * 2
 
 return {
 x: ARENA_SHAPE === 'circle'
  ? (side === 'left' ? ARENA_CX - ARENA_R * 0.45 : ARENA_CX + ARENA_R * 0.45)
  : (side === 'left' ? CANVAS_W * 0.25 : CANVAS_W * 0.75),
 y: ARENA_SHAPE === 'circle'
  ? ARENA_CY + (slotCount > 1 ? (slot / (slotCount - 1) - 0.5) : 0) * ARENA_R * 0.9
  : CANVAS_H / 2 + (slotCount > 1 ? (slot / (slotCount - 1) - 0.5) : 0) * (CANVAS_H - BALL_RADIUS * 4) * 0.7,
 vx: Math.cos(angle) * speed,
 vy: Math.sin(angle) * speed,
 charKey, char, side, team, slot, slotCount,
 pulsePhase: Math.random() * Math.PI * 2,
 hp: char.hp,
 maxHp: char.hp,
 totalDmgDealt: 0,
 lastAbility: -9999,
 // Ability-specific state
 tracks: [], // For Thomas
 trackTimer: 0,
 isDashing: false, // For Volt
 dashUntil: 0,
  // PRO VFX: Trail
  trail: [],
  trailTimer: 0,
  // Ultimate system
  attackCount: 0,
  hitCount: 0,
  ultimateActive: false,
  ultimateTimer: 0,
  // Blaze ultimate state
  isChargingUlt: false,
  ultChargeUntil: 0,
  isUltImmune: false,
  slowMoActive: false,
  slowMoUntil: 0,
 }
}

// Create projectile (for Blaze fireball, etc)
export function createProjectile(x, y, vx, vy, owner, type, damage) {
 return {
 x, y, vx, vy,
 owner,
 type,
 life: 3000, // 3 seconds
 damage: damage != null ? damage : (type === 'fireball' ? 15 : 10),
 radius: type === 'fireball' ? 8 : 6,
 }
}

// Create particle effect
export function createParticles(x, y, color, count = 8) {
 count = Math.max(1, Math.round(count * 2.0)) // PRO VFX: richer bursts
 return Array.from({ length: count }, (_, i) => {
 const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
 const speed = 2 + Math.random() * 3
 return {
 x, y,
 vx: Math.cos(angle) * speed,
 vy: Math.sin(angle) * speed,
 life: 0.5 + Math.random() * 0.5,
 color,
 size: 2 + Math.random() * 3,
 gravity: 0.05,
 drag: 0.97,
 }
 })
}

// Create train (for Thomas)
export function createTrain(tracks, char, owner) {
 return {
 tracks: [...tracks],
 progress: 0,
 damage: char.abilityDamage,
 active: true,
 owner,
 x: tracks[0]?.x || 0,
 y: tracks[0]?.y || 0,
 }
}

// Simple physics update - NO GRAVITY, bounce forever!
export function updatePhysics(ball, now, timeScale = 1) {
  updateStatusEffects(ball, now)
 // Stun check (King ability)
 if (ball.isStunned && ball.stunUntil > now) return
 
 // ULTIMATE: Frozen during charge / cast (Blaze, Volt, Thomas, Anchor, Titan)
 if ((ball.charKey === 'blaze' && ball.isChargingUlt) || ball.ultFrozen) return

 // NINJA TIME DILATION: everyone except the caster is frozen solid in place
 if (isTimeStopped() && ball !== timeStopOwner()) return
 
 // Volt dash speed boost
 let speedMult = (ball.isDashing && ball.dashUntil > now ? 2.0 : 1.0) * (ball.ultimateActive ? 1.5 : 1.0)
 // NINJA: immune & mobile (1.5x) while their own Time Dilation field is active
 if (ball.charKey === 'ninja' && ball.ultStage === 'timestop') speedMult *= 1.5
 if (ball.moveSlowUntil && ball.moveSlowUntil > now && ball.moveSlowFactor) speedMult *= ball.moveSlowFactor // static-field / debuff slow
 if (ball.isFrozen) {
  if (ball.freezeUntil > now) return
  else ball.isFrozen = false
 }
 
 // Update position
 ball.x += ball.vx * speedMult * timeScale * frameScale()
 ball.y += ball.vy * speedMult * timeScale * frameScale()
 
 // Thomas: lay tracks while moving
 if (ball.charKey === 'thomas') {
  // Ultimate timer countdown
  if (ball.ultimateActive) {
   ball.ultimateTimer -= frameDt()
   if (ball.ultimateTimer <= 0) {
    ball.ultimateActive = false
    ball.attackCount = 0
    ball.hitCount = 0
   }
  }
  
 ball.trackTimer += frameDt()
 if (ball.trackTimer > 100) {
 ball.trackTimer = 0
 ball.tracks.push({ x: ball.x, y: ball.y, life: 10000 })
 }
 // PRO VFX: Generate trail particles
 ball.trailTimer += frameDt()
 if (ball.trailTimer > 22) {
  ball.trailTimer = 0
  ball.trail.push({ x: ball.x, y: ball.y, life: 500, size: BALL_RADIUS * 0.7, color: ball.char.color, alpha: 0.8 })
 }
 // Update trail - fade out
 ball.trail = ball.trail.filter(t => {
  t.life -= frameDt()
  t.alpha = t.life / 500
  return t.life > 0
 })
 if (ball.charKey === 'thomas') {
 }
 // Remove old tracks
 ball.tracks = ball.tracks.filter(t => {
 t.life -= frameDt()
 return t.life > 0
 })
 }
 
 // Bounce off arena walls (shape-aware)
 if (ARENA_SHAPE === 'circle') {
  const _dx = ball.x - ARENA_CX
  const _dy = ball.y - ARENA_CY
  const _dc = Math.sqrt(_dx * _dx + _dy * _dy)
  const _maxC = ARENA_R - BALL_RADIUS
  if (_dc > _maxC && _dc > 0) {
   const _nx = _dx / _dc, _ny = _dy / _dc
   ball.x = ARENA_CX + _nx * _maxC
   ball.y = ARENA_CY + _ny * _maxC
   const _vd = ball.vx * _nx + ball.vy * _ny
   if (_vd > 0) {
    ball.vx = (ball.vx - 2 * _vd * _nx) * BOUNCE_DAMPING
    ball.vy = (ball.vy - 2 * _vd * _ny) * BOUNCE_DAMPING
   }
  }
 } else {
  const _l = ARENA_PAD + BALL_RADIUS
  const _r = CANVAS_W - ARENA_PAD - BALL_RADIUS
  const _t = ARENA_PAD + BALL_RADIUS
  const _b = CANVAS_H - ARENA_PAD - BALL_RADIUS
  if (ball.x < _l) { ball.x = _l; ball.vx = Math.abs(ball.vx) * BOUNCE_DAMPING }
  else if (ball.x > _r) { ball.x = _r; ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMPING }
  if (ball.y < _t) { ball.y = _t; ball.vy = Math.abs(ball.vy) * BOUNCE_DAMPING }
  else if (ball.y > _b) { ball.y = _b; ball.vy = -Math.abs(ball.vy) * BOUNCE_DAMPING }
 }
 
 // Maintain minimum speed AND cap maximum speed
 const speed = Math.sqrt(ball.vx ** 2 + ball.vy ** 2)
 if (speed < MIN_SPEED && speed > 0) {
  ball.vx = (ball.vx / speed) * MIN_SPEED
  ball.vy = (ball.vy / speed) * MIN_SPEED
 }
 // Cap max speed to prevent runaway balls
 if (speed > MAX_SPEED) {
  ball.vx = (ball.vx / speed) * MAX_SPEED
  ball.vy = (ball.vy / speed) * MAX_SPEED
 }
}

// Use character ability with VFX
export function useAbility(ball, enemy, projectiles, trains, particles, damageNumbers, now) {
 // Block normal abilities while a reworked ultimate is charging/casting (Volt & Titan 'mode' still allow abilities)
 if (ball.ultFrozen) return
 if (ball.ultStage && ball.ultStage !== 'mode') return
 const cd = now - ball.lastAbility
 const effCd = (ball.ultStage === 'mode' && ball.charKey === 'volt') ? 1500 : ball.char.abilityCooldown
 if (cd < effCd) return
 
 ball.lastAbility = now
 
 // Ultimate charge on ability use
 ball.attackCount++
 // Reworked custom ultimates (Volt/Thomas/Anchor/Phantom/Titan): begin charge/cast
 if (ball.attackCount >= ball.char.ultimateCost && !ball.ultimateActive && !ball.ultStage && !ball.isChargingUlt && NEW_ULT_CHARS.includes(ball.charKey)) {
  startUltimate(ball, enemy, particles, now)
  return // charge/cast begins; skip the normal ability this use

 if (ball.char.ability === 'frostbite') {
  const dx = enemy.x - ball.x, dy = enemy.y - ball.y
  const d = Math.sqrt(dx * dx + dy * dy)
  const inMode = ball.ultStage === 'mode'
  if (d < 340) {
   const dmg = ball.char.abilityDamage + (inMode ? 4 : 0)
   enemy.hp -= dmg
   ball.totalDmgDealt += dmg
   damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: inMode, life: 1000 })
   enemy.moveSlowUntil = now + (inMode ? 2200 : 1800)
   enemy.moveSlowFactor = inMode ? 0.3 : 0.5
   if (inMode) { enemy.isFrozen = true; enemy.freezeUntil = now + 700 }
   for (let k = 0; k < 26; k++) {
    const a = (k / 13) * Math.PI * 2
    particles.push({ x: enemy.x + Math.cos(a) * 18, y: enemy.y + Math.sin(a) * 18, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 0.6, color: k % 2 ? '#bae6fd' : '#7dd3fc', size: 7 + Math.random() * 6, shape: 'spark' })
   }
   particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.5, color: '#e0f2fe', size: 44, shape: 'ring' })
  }
  return
 }
 if (ball.char.ability === 'poison') {
  const ang = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
  const speed = 8
  projectiles.push({ x: ball.x, y: ball.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, owner: ball.side, damage: ball.char.abilityDamage, type: 'toxic', life: 2500, radius: 9, plague: ball.ultStage === 'mode' })
  for (let k = 0; k < 8; k++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball.x + Math.cos(a) * 12, y: ball.y + Math.sin(a) * 12, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.4, color: '#a3e635', size: 6, shape: 'circle' })
  }
  return
 }
 if (ball.char.ability === 'mend') {
  const inMode = ball.ultStage === 'mode'
  ball.regenUntil = now + 3000
  ball.regenNextTick = now
  ball.regenAmount = inMode ? 8 : 5
  ball.shieldUntil = now + 3000
  ball.shieldDR = inMode ? 0.55 : 0.35
  ball._dmgPrevHp = ball.hp
  const dx = enemy.x - ball.x, dy = enemy.y - ball.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d < 150) {
   const dmg = ball.char.abilityDamage + (inMode ? 5 : 0)
   enemy.hp -= dmg
   ball.totalDmgDealt += dmg
   damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: false, life: 900 })
  }
  for (let k = 0; k < 20; k++) {
   const a = (k / 20) * Math.PI * 2
   particles.push({ x: ball.x + Math.cos(a) * 16, y: ball.y + Math.sin(a) * 16, vx: Math.cos(a) * 1.5, vy: -1 - Math.random() * 1.5, life: 0.7, color: k % 2 ? '#fef3c7' : '#fde68a', size: 6 + Math.random() * 5, shape: 'spark' })
  }
  particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.5, color: '#fffbeb', size: 40, shape: 'ring' })
  return
 }
 }
 // Generic ultimates (skip Blaze - custom Inferno Arrow - and the reworked ones above)
 if (ball.attackCount >= ball.char.ultimateCost && !ball.ultimateActive && ball.charKey !== 'blaze' && !NEW_ULT_CHARS.includes(ball.charKey)) {
  ball.ultimateActive = true
  ball.ultimateTimer = 8000
 }
 
 if (ball.char.ability === 'fireball') {
  // BLAZE ULTIMATE: trigger 3s charge after 5 fireballs
  if (ball.charKey === 'blaze' && ball.attackCount >= ball.char.ultimateCost && !ball.isChargingUlt && !ball.ultimateActive && !ball.blazeUltMode) {
   ball.isChargingUlt = true
   ball.isUltImmune = true
   ball.ultChargeUntil = now + 2500
   ball.blazeArrowsShot = 0
   ball.sfxRequest = 'ability'
   ball.attackCount = 0
   return
  }
  // While charging or in fire-arrow mode, skip normal fireballs (handled per-frame in updateBlazeUltimate)
  if (ball.charKey === 'blaze' && (ball.isChargingUlt || ball.blazeUltMode)) return

  // Normal fireball: shoot toward enemy
  const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
  const speed = 8
  projectiles.push(createProjectile(
   ball.x + Math.cos(angle) * 30,
   ball.y + Math.sin(angle) * 30,
   Math.cos(angle) * speed,
   Math.sin(angle) * speed,
   ball.side,
   'fireball',
   ball.char.abilityDamage
  ))
  // Fire burst VFX
  for (let i = 0; i < 14; i++) {
   const a = (i / 14) * Math.PI * 2
   const spd = 2 + Math.random() * 4
   particles.push({
    x: ball.x, y: ball.y,
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    life: 0.6 + Math.random() * 0.4,
    color: i % 2 === 0 ? '#fde68a' : '#ef4444',
    size: 2 + Math.random() * 3,
    shape: 'spark',
   })
  }
  particles.push({
   x: ball.x, y: ball.y,
   vx: 0, vy: 0,
   life: 0.5,
   color: '#f97316',
   size: BALL_RADIUS + 6,
   shape: 'ring',
  })

 } else if (ball.char.ability === 'dash') {
 // Volt: speed dash + electric VFX
 ball.isDashing = true
  ball.isDashDamaging = true
 ball.dashUntil = now + 600
 const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
 ball.vx = Math.cos(angle) * 6
 ball.vy = Math.sin(angle) * 6
 // Lightning sparks
 for (let i = 0; i < 18; i++) {
 const a = Math.random() * Math.PI * 2
 const spd = 1 + Math.random() * 3
 particles.push({
 x: ball.x + (Math.random() - 0.5) * 40,
 y: ball.y + (Math.random() - 0.5) * 40,
 vx: Math.cos(a) * spd,
 vy: Math.sin(a) * spd,
 life: 0.35 + Math.random() * 0.2,
 color: i % 3 === 0 ? '#e9d5ff' : '#a78bfa',
 size: 4 + Math.random() * 3,
 shape: 'spark',
 })
 }
 // Electric ring burst
 particles.push({
 x: ball.x, y: ball.y,
 vx: 0, vy: 0,
 life: 0.4,
 color: '#a78bfa',
 size: BALL_RADIUS + 15,
 shape: 'ring',
 })

 } else if (ball.char.ability === 'teleport') {
  // Phantom: teleport + 10 damage (easy to land)
  const oldX = ball.x, oldY = ball.y
  const angle = Math.atan2(ball.y - enemy.y, ball.x - enemy.x)
  ball.x = enemy.x + Math.cos(angle) * 100
  ball.y = enemy.y + Math.sin(angle) * 100
  ball.vx *= 1.5
  ball.vy *= 1.5
  // Deal damage
  enemy.hp -= ball.char.abilityDamage
  ball.totalDmgDealt += ball.char.abilityDamage
  // Damage text
  damageNumbers.push({ x: enemy.x, y: enemy.y, damage: ball.char.abilityDamage, isCrit: false, life: 1000 })
  // Damage VFX
  for (let i = 0; i < 20; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: enemy.x + Math.cos(a) * 15, y: enemy.y + Math.sin(a) * 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, color: '#06b6d4', size: 6 })
  }

 // Disappear rings at old pos
 for (let r = 0; r < 3; r++) {
 particles.push({
 x: oldX, y: oldY,
 vx: 0, vy: 0,
 life: 0.5 - r * 0.1,
 color: '#06b6d4',
 size: BALL_RADIUS + r * 12,
 shape: 'ring',
 })
 }
 // Wisps at old position
 for (let i = 0; i < 24; i++) {
 const a = (i / 12) * Math.PI * 2
 const spd = 1 + Math.random() * 2
 particles.push({
 x: oldX + (Math.random() - 0.5) * 20,
 y: oldY + (Math.random() - 0.5) * 20,
 vx: Math.cos(a) * spd,
 vy: Math.sin(a) * spd,
 life: 0.5 + Math.random() * 0.3,
 color: '#67e8f9',
 size: 3 + Math.random() * 4,
 })
 }
 // Appear rings at new pos
 for (let r = 0; r < 3; r++) {
 particles.push({
 x: ball.x, y: ball.y,
 vx: 0, vy: 0,
 life: 0.5 - r * 0.1,
 color: '#06b6d4',
 size: BALL_RADIUS + r * 12,
 shape: 'ring',
 })
 }
 for (let i = 0; i < 24; i++) {
 const a = (i / 12) * Math.PI * 2
 const spd = 1 + Math.random() * 2
 particles.push({
 x: ball.x + (Math.random() - 0.5) * 20,
 y: ball.y + (Math.random() - 0.5) * 20,
 vx: Math.cos(a) * spd,
 vy: Math.sin(a) * spd,
 life: 0.5 + Math.random() * 0.3,
 color: '#06b6d4',
 size: 3 + Math.random() * 4,
 })
 }

 } else if (ball.char.ability === 'hook') {
 // Anchor: chain hook VFX
 const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
 const d = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
 if (d < 200) {
 enemy.x += Math.cos(angle) * 80
 enemy.y += Math.sin(angle) * 80
 enemy.hp -= ball.char.abilityDamage
 ball.totalDmgDealt += ball.char.abilityDamage
 // Chain line as particles
 const steps = Math.floor(d / 12)
 for (let i = 0; i < steps; i++) {
 const t = i / steps
 particles.push({
 x: ball.x + Math.cos(angle) * d * t,
 y: ball.y + Math.sin(angle) * d * t,
 vx: 0, vy: 0,
 life: 0.35,
 color: '#9ca3af',
 size: 4,
 shape: 'ring',
 })
 }
 // Impact burst
 for (let i = 0; i < 25; i++) {
 const a = Math.random() * Math.PI * 2
 particles.push({
 x: enemy.x, y: enemy.y,
 vx: Math.cos(a) * (2 + Math.random() * 3),
 vy: Math.sin(a) * (2 + Math.random() * 3),
 life: 0.5,
 color: '#d1d5db',
 size: 3 + Math.random() * 3,
 shape: 'spark',
 })
 }
 }

 } else if (ball.char.ability === 'slam') {
 // Titan: shockwave VFX
 const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
 enemy.vx += Math.cos(angle) * 10
 enemy.vy += Math.sin(angle) * 10
 enemy.hp -= ball.char.abilityDamage
 ball.totalDmgDealt += ball.char.abilityDamage

 // Expanding shockwave rings
 for (let r = 0; r < 4; r++) {
 particles.push({
 x: ball.x, y: ball.y,
 vx: 0, vy: 0,
 life: 0.6 - r * 0.1,
 color: r % 2 === 0 ? '#f97316' : '#fbbf24',
 size: BALL_RADIUS + r * 18,
 shape: 'ring',
 })
 }
 // Rock debris particles
 for (let i = 0; i < 30; i++) {
 const a = (i / 16) * Math.PI * 2
 const spd = 3 + Math.random() * 5
 particles.push({
 x: ball.x + Math.cos(a) * 20,
 y: ball.y + Math.sin(a) * 20,
 vx: Math.cos(a) * spd,
 vy: Math.sin(a) * spd,
 life: 0.6 + Math.random() * 0.4,
 color: i % 3 === 0 ? '#fbbf24' : '#f97316',
 size: 4 + Math.random() * 5,
 })
 }

 } else if (ball.char.ability === 'train') {
 // Thomas: spawn train with steam VFX
 if (ball.tracks.length >= 15) {
 trains.push(createTrain(ball.tracks.slice(-30), ball.char, ball.side))
 ball.tracks = []
 // Big steam burst
 for (let i = 0; i < 30; i++) {
 const a = Math.random() * Math.PI * 2
 const spd = 0.5 + Math.random() * 2
 particles.push({
 x: ball.x + (Math.random() - 0.5) * 30,
 y: ball.y + (Math.random() - 0.5) * 30,
 vx: Math.cos(a) * spd,
 vy: -1.5 - Math.random() * spd,
 life: 0.8 + Math.random() * 0.5,
 color: `rgba(${180 + Math.floor(Math.random()*40)},${180 + Math.floor(Math.random()*40)},${180 + Math.floor(Math.random()*40)},1)`,
 size: 7 + Math.random() * 8,
 })
 }
 // Whistle rings
 for (let r = 0; r < 3; r++) {
 particles.push({
 x: ball.x, y: ball.y,
 vx: 0, vy: 0,
 life: 0.4 - r * 0.08,
 color: '#d1d5db',
 size: BALL_RADIUS + r * 14,
 shape: 'ring',
 })
 }
 }

 } else if (ball.char.ability === 'freeze') {
  enemy.isFrozen = true
  enemy.hp -= ball.char.abilityDamage
  ball.totalDmgDealt += ball.char.abilityDamage
  const wizMode = (ball.charKey === 'wizard' && ball.ultStage === 'mode')
  enemy.freezeUntil = now + (wizMode ? 5000 : 2000) // CELESTIAL JUDGMENT mode: 3s -> 5s freeze
  if (wizMode) { // curse mark explodes for 15 bonus damage
   enemy.hp -= 15
   ball.totalDmgDealt += 15
   damageNumbers.push({ x: enemy.x, y: enemy.y - 14, damage: 15, isCrit: true, life: 900 })
   for (let c = 0; c < 8; c++) { const ca = (c / 8) * Math.PI * 2; particles.push({ x: enemy.x + Math.cos(ca) * 18, y: enemy.y + Math.sin(ca) * 18, vx: Math.cos(ca) * 2, vy: Math.sin(ca) * 2, life: 0.5, color: '#a855f7', size: 5, shape: 'spark' }) }
  }
  // Damage text
  damageNumbers.push({ x: enemy.x, y: enemy.y, damage: ball.char.abilityDamage, isCrit: false, life: 1000 })
  for (let i = 0; i < 24; i++) {
   const a = (i / 12) * Math.PI * 2
   particles.push({ x: enemy.x + Math.cos(a) * 20, y: enemy.y + Math.sin(a) * 20, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5, life: 0.6, color: '#a5f3fc', size: 14 + Math.random() * 6, shape: 'spark' })
  }

 } else if (ball.char.ability === 'laser') {
  // NERF: Short range only (250px)
  const dist = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
  if (dist < 250) {
   enemy.hp -= ball.char.abilityDamage
   // Damage text
   damageNumbers.push({ x: enemy.x, y: enemy.y, damage: ball.char.abilityDamage, isCrit: true, life: 1000 })
   const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
   for (let i = 0; i < 20; i++) {
    particles.push({ x: ball.x + Math.cos(angle) * (BALL_RADIUS + i * 15), y: ball.y + Math.sin(angle) * (BALL_RADIUS + i * 15), vx: 0, vy: 0, life: 0.3, color: '#ef4444', size: 14, shape: 'spark' })
   }
  }

 } else if (ball.char.ability === 'lifesteal') {
  const dist = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
  if (dist < 300) {
   ball.isDashing = true
  ball.isDashDamaging = true
   ball.dashUntil = now + 300
   const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
   ball.vx = Math.cos(angle) * 12
   ball.vy = Math.sin(angle) * 12
   ball.lifeStealActive = true
  }
 }
 // NEW ABILITIES
 else if (ball.char.ability === 'firebreath') {
  // Dragon: Fire cone - 20 dmg, 280px range, PRO VFX
  const dist = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
  if (dist < 280) {
   enemy.hp -= ball.char.abilityDamage
   damageNumbers.push({ x: enemy.x, y: enemy.y, damage: ball.char.abilityDamage, isCrit: false, life: 1000 })
   const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
   // PRO VFX: Big fire cone
   for (let i = 0; i < 50; i++) {
    const spread = (Math.random() - 0.5) * 1.2
    const fireAngle = angle + spread
    const fireDist = 40 + Math.random() * 150
    particles.push({ x: ball.x + Math.cos(fireAngle) * fireDist, y: ball.y + Math.sin(fireAngle) * fireDist, vx: Math.cos(fireAngle) * 4, vy: Math.sin(fireAngle) * 4, life: 0.7, color: i < 15 ? '#fde68a' : '#f97316', size: 16 + Math.random() * 12, shape: 'spark' })
   }
   // Fire ring
   particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.4, color: '#ef4444', size: 50, shape: 'ring' })
  }
 }
 else if (ball.char.ability === 'kunai') {
  // Ninja (Stasis): throw a tight fan of gray-steel kunai — slows enemies on hit
  const baseAngle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
  for (let i = 0; i < 3; i++) {
   const angle = baseAngle + (i - 1) * 0.16
   const speed = 12
   projectiles.push({ x: ball.x, y: ball.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, owner: ball.side, damage: ball.char.abilityDamage, type: 'kunai', life: 2200, angle })
  }
  // crystalline muzzle glint (gray/silver + blue tint)
  for (let j = 0; j < 16; j++) { const a = baseAngle + rnd(-0.45, 0.45); const sp = 2 + Math.random() * 4; particles.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.25, color: j % 3 === 0 ? '#ffffff' : (j % 3 === 1 ? '#B4F8F8' : '#A5F3FC'), size: 3 + Math.random() * 4, shape: 'spark', glow: 24 }) }
 }
 else if (ball.char.ability === 'bomb') {
  // Bomber: Drop bomb (30 dmg, 150px radius)
  const bomb = { x: ball.x, y: ball.y, vx: 0, vy: 0, owner: ball.side, damage: ball.char.abilityDamage, type: 'bomb', life: 1500, radius: 150 }
  projectiles.push(bomb)
 } else if (ball.char.ability === 'fireaura') {
  const dist = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
  if (dist < 280) {
   ball.isDashing = true
   ball.isDashDamaging = true
   ball.dashUntil = now + 400
   const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
   ball.vx = Math.cos(angle) * 11
   ball.vy = Math.sin(angle) * 11
   for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2
    particles.push({ x: ball.x + Math.cos(a) * 20, y: ball.y + Math.sin(a) * 20, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, color: '#f43f5e', size: 12 })
   }
  }
 }
else if (ball.char.ability === 'crown') {
  // King: Crown stun + 20 dmg (250px range) - always show VFX
  const dist = Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2)
  // Always show crown VFX
  for (let i = 0; i < 30; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: enemy.x + Math.cos(a) * 25, y: enemy.y + Math.sin(a) * 25, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.6, color: '#fbbf24', size: 16, shape: 'spark' })
  }
  particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.5, color: '#fde68a', size: 60, shape: 'ring' })
  // Deal damage if in range
  if (dist < 250) {
   enemy.hp -= ball.char.abilityDamage
   enemy.isStunned = true
   enemy.stunUntil = now + 1500
   damageNumbers.push({ x: enemy.x, y: enemy.y, damage: ball.char.abilityDamage, isCrit: true, life: 1000 })
  }
 }
}

// Elastic collision between two balls - deals damage!
export function resolveCollision(ball1, ball2, damageNumbers, particles) {
 const d = dist(ball1, ball2)
 const minDist = BALL_RADIUS * 2
 
 if (d < minDist && d > 0) {
 const normal = normalize({ x: ball2.x - ball1.x, y: ball2.y - ball1.y })
 
 // Separate balls
 const overlap = (minDist - d) / 2
 ball1.x -= normal.x * overlap
 ball1.y -= normal.y * overlap
 ball2.x += normal.x * overlap
 ball2.y += normal.y * overlap
 
 // Exchange velocities
 const relVel = { x: ball1.vx - ball2.vx, y: ball1.vy - ball2.vy }
 const velAlongNormal = relVel.x * normal.x + relVel.y * normal.y
 
 if (velAlongNormal > 0) return
 
 const impulse = 2 * velAlongNormal / 2
 
 ball1.vx -= impulse * normal.x
 ball1.vy -= impulse * normal.y
 ball2.vx += impulse * normal.x
 ball2.vy += impulse * normal.y
 
 // PRO VFX: Shockwave ring on collision
 const shockwave = { x: (ball1.x + ball2.x) / 2, y: (ball1.y + ball2.y) / 2, life: 1.0, size: 10, maxSize: 80, color: '#ffffff', alpha: 0.8, shape: 'ring' }
 particles.push(shockwave)
 // PRO VFX: Extra particles on impact (50-80 particles!)
 for (let i = 0; i < 60; i++) {
  const a = Math.random() * Math.PI * 2
  const speed = 3 + Math.random() * 5
  particles.push({
   x: (ball1.x + ball2.x) / 2,
   y: (ball1.y + ball2.y) / 2,
   vx: Math.cos(a) * speed,
   vy: Math.sin(a) * speed,
   life: 0.4 + Math.random() * 0.3,
   color: ball1.char.color,
   size: 8 + Math.random() * 12,
   shape: Math.random() > 0.5 ? 'spark' : 'circle'
  })
 }
 
 // NO collision damage - only abilities deal damage!
 // EXCEPT: Volt dash, Bat lifesteal, Anchor hook
  if (ball1.team === ball2.team) return
  // Blaze ultimate immunity check
  if (ball1.charKey === 'blaze' && ball1.isUltImmune) return
  if (ball2.charKey === 'blaze' && ball2.isUltImmune) return
 if (ball1.charKey === 'volt' && ball1.isDashDamaging && !ball2.isUltImmune) {
  const vdmg = ball1.ultimateActive ? ball1.char.abilityDamage * 3 : ball1.char.abilityDamage // Thunder God mode: collision damage x3
  ball2.hp -= vdmg
  ball1.totalDmgDealt += vdmg
  damageNumbers.push({ x: ball2.x, y: ball2.y, damage: vdmg, isCrit: true, life: 1000 })
  ball1.isDashDamaging = false
  for (let i = 0; i < 15; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball1.x + Math.cos(a) * 15, y: ball1.y + Math.sin(a) * 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, color: '#a78bfa', size: 6 })
  }
 }
 if (ball2.charKey === 'volt' && ball2.isDashDamaging && !ball1.isUltImmune) {
  const vdmg = ball2.ultimateActive ? ball2.char.abilityDamage * 3 : ball2.char.abilityDamage // Thunder God mode: collision damage x3
  ball1.hp -= vdmg
  ball2.totalDmgDealt += vdmg
  damageNumbers.push({ x: ball1.x, y: ball1.y, damage: vdmg, isCrit: true, life: 1000 })
  ball2.isDashDamaging = false
  for (let i = 0; i < 15; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball2.x + Math.cos(a) * 15, y: ball2.y + Math.sin(a) * 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, color: '#a78bfa', size: 6 })
  }
 }
 // Bat lifesteal dash
 if (ball1.charKey === 'bat' && ball1.isDashDamaging) {
  ball2.hp -= ball1.char.abilityDamage
  ball1.hp = Math.min(ball1.maxHp, ball1.hp + 8) // Lifesteal heal
  // Damage text
  damageNumbers.push({ x: ball2.x, y: ball2.y, damage: ball1.char.abilityDamage, isCrit: false, life: 1000 })
  ball1.isDashDamaging = false
  // Ultimate charge
  ball1.attackCount++
  if (ball1.attackCount >= ball1.char.ultimateCost && !ball1.ultimateActive) {
   ball1.ultimateActive = true
   ball1.ultimateTimer = 8000
  }
  for (let i = 0; i < 15; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball1.x + Math.cos(a) * 15, y: ball1.y + Math.sin(a) * 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, color: '#dc2626', size: 6 })
  }
 }
 // Phoenix fire aura dash
 if (ball1.charKey === 'phoenix' && ball1.isDashDamaging && !ball2.isUltImmune) {
  ball2.hp -= ball1.char.abilityDamage
  // Damage text
  damageNumbers.push({ x: ball2.x, y: ball2.y, damage: ball1.char.abilityDamage, isCrit: false, life: 1000 })
  ball1.isDashDamaging = false
  // Ultimate charge
  ball1.attackCount++
  if (ball1.attackCount >= ball1.char.ultimateCost && !ball1.ultimateActive) {
   ball1.ultimateActive = true
   ball1.ultimateTimer = 8000
  }
  for (let i = 0; i < 20; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball1.x + Math.cos(a) * 18, y: ball1.y + Math.sin(a) * 18, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.5, color: '#f43f5e', size: 10 })
  }
 }
 if (ball2.charKey === 'bat' && ball2.isDashDamaging) {
  ball1.hp -= ball2.char.abilityDamage
  ball2.hp = Math.min(ball2.maxHp, ball2.hp + 8) // Lifesteal heal
  // Damage text
  damageNumbers.push({ x: ball1.x, y: ball1.y, damage: ball2.char.abilityDamage, isCrit: false, life: 1000 })
  ball2.isDashDamaging = false
  // Ultimate charge
  ball2.attackCount++
  if (ball2.attackCount >= ball2.char.ultimateCost && !ball2.ultimateActive) {
   ball2.ultimateActive = true
   ball2.ultimateTimer = 8000
  }
  for (let i = 0; i < 15; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball2.x + Math.cos(a) * 15, y: ball2.y + Math.sin(a) * 15, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, color: '#dc2626', size: 6 })
  }
 }
 // Phoenix fire aura dash
 if (ball2.charKey === 'phoenix' && ball2.isDashDamaging && !ball1.isUltImmune) {
  ball1.hp -= ball2.char.abilityDamage
  // Damage text
  damageNumbers.push({ x: ball1.x, y: ball1.y, damage: ball2.char.abilityDamage, isCrit: false, life: 1000 })
  ball2.isDashDamaging = false
  // Ultimate charge
  ball2.attackCount++
  if (ball2.attackCount >= ball2.char.ultimateCost && !ball2.ultimateActive) {
   ball2.ultimateActive = true
   ball2.ultimateTimer = 8000
  }
  for (let i = 0; i < 20; i++) {
   const a = Math.random() * Math.PI * 2
   particles.push({ x: ball2.x + Math.cos(a) * 18, y: ball2.y + Math.sin(a) * 18, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.5, color: '#f43f5e', size: 10 })
  }
 }
 // Projectiles and abilities handle all damage
 }
}

// Update projectiles
export function updateProjectiles(projectiles, balls, particles) {
 // NINJA TIME DILATION: all projectiles suspended mid-air while time is stopped
 if (isTimeStopped()) return
 for (let i = projectiles.length - 1; i >= 0; i--) {
 const p = projectiles[i]
 p.x += p.vx * frameScale()
 p.y += p.vy * frameScale()
 p.life -= frameDt()
 
 // Check collision with balls
 for (const ball of balls) {
 if (p.owner !== ball.side && !ball.isUltImmune && dist(p, ball) < BALL_RADIUS + (p.radius || 8)) {
 ball.hp -= p.damage
 const shooter = balls.find(b => b.side === p.owner)
 if (shooter) shooter.totalDmgDealt += p.damage
     // TOXIC blob (Venom) - apply poison DoT stacks + life drain to shooter
     if (p.type === 'toxic') {
      const tnow = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const plague = p.plague
      ball.poisonStacks = Math.min((ball.poisonStacks || 0) + 1, 6)
      ball.poisonUntil = tnow + (plague ? 4000 : 3000)
      ball.poisonNextTick = Math.min(ball.poisonNextTick || 0, tnow)
      ball.poisonDmg = (plague ? 6 : 3) + ball.poisonStacks * (plague ? 2 : 1)
      if (shooter) shooter.hp = Math.min(shooter.maxHp, shooter.hp + 3)
      for (let j2 = 0; j2 < 14; j2++) {
       const a = Math.random() * Math.PI * 2
       particles.push({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, life: 0.5, color: j2 % 2 ? '#bef264' : '#65a30d', size: 6 + Math.random() * 4, shape: 'circle' })
      }
      particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, color: '#a3e635', size: 36, shape: 'ring' })
     }
 // Kunai hit — crystalline shatter + 20% slow for 1.5s
 if (p.type === 'kunai') {
 const know = (typeof performance !== 'undefined' ? performance.now() : Date.now())
 ball.moveSlowUntil = know + 1500
 ball.moveSlowFactor = 0.8
 // crystalline shatter burst (ice blue, ease-out)
 for (let j = 0; j < 40; j++) {
  const a = Math.random() * Math.PI * 2; const sp = 2 + Math.random() * 6
  particles.push({ x: p.x + Math.cos(a) * 8, y: p.y + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, color: j % 3 === 0 ? '#ffffff' : (j % 3 === 1 ? '#B4F8F8' : '#A5F3FC'), size: 4 + Math.random() * 5, shape: j % 3 === 0 ? 'spark' : 'circle', glow: 22, drag: 0.93 })
 }
 particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.45, color: '#B4F8F8', size: 28, shape: 'ring', lineWidth: 3, glow: 28 })
 particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, color: '#ffffff', size: 14, shape: 'ring', lineWidth: 2, glow: 28 })
 }
 // Shuriken hit (legacy — unused)
 if (p.type === 'shuriken') {
 for (let j = 0; j < 8; j++) {
  const a = Math.random() * Math.PI * 2
  particles.push({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.3, color: '#6b7280', size: 6 })
 }
 }
 // Bomb explosion
 if (p.type === 'bomb') {
 for (let j = 0; j < 40; j++) {
  const a = Math.random() * Math.PI * 2
  particles.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, life: 0.6, color: '#84cc16', size: 14 })
 }
 // Bomb AOE damage - ONLY ENEMY!
 for (const b of balls) {
  const d = dist(p, b)
  if (d < p.radius && b.side !== p.owner && !b.isUltImmune) {
   b.hp -= p.damage
   const bombShooter = balls.find(bl => bl.side === p.owner)
   if (bombShooter) bombShooter.totalDmgDealt += p.damage
  }
 }
 }
 // Fireball impact — big explosion
 if (p.type === 'fireball') {
 for (let j = 0; j < 3; j++) {
 particles.push({
 x: p.x, y: p.y,
 vx: 0, vy: 0,
 life: 0.5 - j * 0.1,
 color: j === 0 ? '#fde68a' : '#ef4444',
 size: 14 + j * 10,
 shape: 'ring',
 })
 }
 particles.push(...createParticles(p.x, p.y, '#ef4444', 12))
 particles.push(...createParticles(p.x, p.y, '#fbbf24', 8))
 }
 // INFERNO ARROW (Blaze Ult) - MASSIVE AOE
 if (p.type === 'inferno_arrow') {
  // HUGE explosion ring
  for (let j = 0; j < 5; j++) {
   particles.push({
    x: p.x, y: p.y,
    vx: 0, vy: 0,
    life: 0.8 - j * 0.12,
    color: j === 0 ? '#fbbf24' : j === 1 ? '#fde68a' : '#ef4444',
    size: 20 + j * 15,
    shape: 'ring',
   })
  }
  // Massive particles
  for (let j = 0; j < 80; j++) {
   const a = Math.random() * Math.PI * 2
   const spd = 4 + Math.random() * 8
   particles.push({
    x: p.x, y: p.y,
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    life: 0.6 + Math.random() * 0.4,
    color: j % 3 === 0 ? '#fbbf24' : j % 3 === 1 ? '#ef4444' : '#f97316',
    size: 10 + Math.random() * 14,
    shape: j % 2 === 0 ? 'spark' : 'circle',
   })
  }
  // AOE DAMAGE - whether hits or misses
  for (const b of balls) {
   const d = dist(p, b)
   if (d < p.radius && b.side !== p.owner && !b.isUltImmune) {
    b.hp -= p.damage
    const blazeShooter = balls.find(bl => bl.side === p.owner)
    if (blazeShooter) blazeShooter.totalDmgDealt += p.damage
    // Damage number
   }
  }
  const shaker = balls.find(bl => bl.side === p.owner)
  if (shaker) shaker.shakeRequest = Math.max(shaker.shakeRequest || 0, 18)
 }
 projectiles.splice(i, 1)
 break
 }
 }
 
 if (p.life <= 0 && projectiles[i] === p) {
 if (p.type === 'inferno_arrow') {
  for (let j = 0; j < 5; j++) particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.8 - j * 0.12, color: j === 0 ? '#fbbf24' : j === 1 ? '#fde68a' : '#ef4444', size: 20 + j * 15, shape: 'ring', lineWidth: 4 })
  for (let j = 0; j < 70; j++) { const a = Math.random() * Math.PI * 2; const spd = 4 + Math.random() * 8; particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.6 + Math.random() * 0.4, color: j % 3 === 0 ? '#fbbf24' : j % 3 === 1 ? '#ef4444' : '#f97316', size: 10 + Math.random() * 14, shape: j % 2 === 0 ? 'spark' : 'circle' }) }
  for (const b of balls) { const d = dist(p, b); if (d < p.radius && b.side !== p.owner && !b.isUltImmune) { b.hp -= p.damage; const sh = balls.find(bl => bl.side === p.owner); if (sh) sh.totalDmgDealt += p.damage } }
  const shaker = balls.find(bl => bl.side === p.owner); if (shaker) shaker.shakeRequest = Math.max(shaker.shakeRequest || 0, 16)
 }
 projectiles.splice(i, 1)
 }
 }
}

// Update trains (Thomas ability)
export function updateTrains(trains, balls, particles) {
 for (let i = trains.length - 1; i >= 0; i--) {
 const train = trains[i]
 if (!train.active || !train.tracks || train.tracks.length === 0) {
 trains.splice(i, 1)
 continue
 }
 
 train.progress += 0.012 * frameScale()  // Speed 1 (slower than Thomas ball)
 if (train.progress >= 1) {
 trains.splice(i, 1)
 continue
 }
 
 // Interpolate along tracks
 const trackIdx = Math.floor(train.progress * (train.tracks.length - 1))
 const track = train.tracks[trackIdx]
 if (!track) continue
 
 train.x = track.x
 train.y = track.y
 
 // Damage balls near train
 for (const ball of balls) {
 if (ball.side !== train.owner && !ball.isUltImmune && dist(train, ball) < BALL_RADIUS + 20) {
 ball.hp -= train.damage
 ball.totalDmgDealt += train.damage
 particles.push(...createParticles(train.x, train.y, '#3b82f6', 8))
 }
 }
 }
}

// Phoenix revive: separated from the win check into its own helper
export function applyPhoenixRevive(ball) {
 if (ball.hp <= 0 && ball.charKey === 'phoenix' && !ball.hasRevived) {
  ball.hasRevived = true
  ball.hp = 30
  ball.maxHp = 30 // Temporary max HP after revive
  return true
 }
 return false
}

// Check if there's a winner (revive handled by applyPhoenixRevive)
export function checkWinner(balls) {
 for (const b of balls) applyPhoenixRevive(b)
 const aAlive = balls.some(b => b.team === 'A' && b.hp > 0)
 const bAlive = balls.some(b => b.team === 'B' && b.hp > 0)
 if (!aAlive && !bAlive) return 'draw'
 if (!aAlive) return 'B'
 if (!bAlive) return 'A'
 return null
}


// BLAZE ULTIMATE: per-frame charge handler + Inferno Arrow firing.
// Runs every frame (NOT gated by ability cooldown) so the charge VFX and
// firing are reliable.
export function updateBlazeUltimate(ball, enemy, projectiles, particles, now) {
 if (ball.charKey !== 'blaze' || (!ball.isChargingUlt && !ball.blazeUltMode)) return

 // ───────── CHARGE PHASE (2.5s): build a fire arrow above Blaze's head ─────────
 if (ball.isChargingUlt) {
  const chargeK = 1 - Math.max(0, (ball.ultChargeUntil - now)) / 2500
  const headY = ball.y - 46
  const sphereR = 6 + chargeK * 26
  // growing fire-arrow sphere above the head
  for (let i = 0; i < 5; i++) {
   const a = Math.random() * Math.PI * 2
   const rr = sphereR * (0.35 + Math.random() * 0.65)
   particles.push({ x: ball.x + Math.cos(a) * rr, y: headY + Math.sin(a) * rr * 0.85, vx: -Math.cos(a) * 1.4, vy: -Math.sin(a) * 1.4, life: 0.3 + Math.random() * 0.25, color: i % 3 === 0 ? '#fde68a' : i % 3 === 1 ? '#f97316' : '#fbbf24', size: 4 + Math.random() * 5, shape: 'spark', glow: 28 })
  }
  // 3 expanding golden rings, one pulse per ~0.4s
  if (now >= (ball.blazeRingAt || 0)) {
   ball.blazeRingAt = now + 380
   for (let r = 0; r < 3; r++) particles.push({ x: ball.x, y: headY, vx: 0, vy: 0, life: 0.55 - r * 0.1, color: '#fbbf24', size: 14 + r * 16 + chargeK * 24, shape: 'ring', lineWidth: 3, glow: 24 })
  }
  // swirling embers converging on Blaze (brighter as charge fills)
  for (let i = 0; i < 3; i++) {
   const a = Math.random() * Math.PI * 2
   const d = 55 - chargeK * 25 + Math.random() * 20
   particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * (2 + chargeK * 3), vy: -Math.sin(a) * (2 + chargeK * 3), life: 0.4 + Math.random() * 0.3, color: i % 2 ? '#f97316' : '#ef4444', size: 4 + Math.random() * 4, shape: 'spark', glow: 22 })
  }
  if (Math.random() < 0.5) particles.push({ x: ball.x + rnd(-10, 10), y: ball.y + 6, vx: rnd(-0.5, 0.5), vy: -1.5 - Math.random() * 1.5, life: 0.5, color: '#fbbf24', size: 3 + Math.random() * 4, shape: 'circle', glow: 20 })

  // charge complete -> enter 8s INFERNO MODE (multi-arrow, NOT a single shot)
  if (now >= ball.ultChargeUntil) {
   ball.isChargingUlt = false
   ball.blazeUltMode = true
   ball.blazeModeUntil = now + 8000
   ball.blazeFrame = 0 // frame-based fire timer (reliable across frame deltas)
   ball.blazeArrowsShot = 0
   ball.isUltImmune = false
   ball.ultimateActive = true
   ball.ultimateTimer = 8000
  }
  return
 }

 // ───────── ULTIMATE MODE: fire a guaranteed barrage of 5 inferno arrows ─────────
 // Frame-based timer (NOT performance.now deltas) so firing is 100% reliable.
 if (ball.blazeUltMode) {
  ball.blazeFrame = (ball.blazeFrame || 0) + 1
  // fiery aura around Blaze
  if (Math.random() < 0.5) particles.push({ x: ball.x + rnd(-16, 16), y: ball.y + rnd(-16, 16), vx: rnd(-0.6, 0.6), vy: -1 - Math.random(), life: 0.4, color: Math.random() < 0.5 ? '#f97316' : '#fbbf24', size: 4 + Math.random() * 4, shape: 'spark', glow: 20 })
  // Fire one arrow every 40 frames (~0.66s @60fps), capped at 5 arrows total.
  const FIRE_EVERY = 40
  const MAX_ARROWS = 5
  if (ball.blazeFrame % FIRE_EVERY === 1 && (ball.blazeArrowsShot || 0) < MAX_ARROWS) {
   ball.blazeArrowsShot = (ball.blazeArrowsShot || 0) + 1
   ball.sfxRequest = 'fireball'
   const angle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
   const speed = 15
   projectiles.push({ x: ball.x + Math.cos(angle) * 30, y: ball.y + Math.sin(angle) * 30, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, owner: ball.side, type: 'inferno_arrow', damage: 35, radius: 150, life: 3000, isUltimate: true })
   // muzzle blast per arrow
   for (let j = 0; j < 22; j++) { const sa = angle + rnd(-0.5, 0.5); const ss = 4 + Math.random() * 6; particles.push({ x: ball.x + Math.cos(angle) * 26, y: ball.y + Math.sin(angle) * 26, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss, life: 0.35 + Math.random() * 0.3, color: j % 2 ? '#fbbf24' : '#f97316', size: 5 + Math.random() * 7, shape: j % 3 === 0 ? 'spark' : 'circle', glow: 26 }) }
   for (let r = 0; r < 3; r++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.4 - r * 0.08, color: r % 2 ? '#fde68a' : '#ef4444', size: 16 + r * 12, shape: 'ring', lineWidth: 3 })
   ball.shakeRequest = Math.max(ball.shakeRequest || 0, 8)
  }
  // End mode only AFTER all 5 arrows have launched (+ short tail), with an 8s safety cap.
  const allFired = (ball.blazeArrowsShot || 0) >= MAX_ARROWS && ball.blazeFrame > MAX_ARROWS * FIRE_EVERY + 30
  if (allFired || ball.blazeFrame > 540) {
   ball.blazeUltMode = false
   ball.ultimateActive = false
   ball.ultimateTimer = 0
   ball.blazeArrowsShot = 0
   ball.blazeFrame = 0
   ball.attackCount = 0
  }
  return
 }
}


// ════════════════════════════════════════════════════════════════════════════
//  REWORKED ULTIMATES — Volt / Thomas / Anchor / Phantom / Titan
//  Per-frame state machines. startUltimate() begins the cast (from useAbility);
//  updateUltimates() is called every frame from BattleScreen after useAbility.
// ════════════════════════════════════════════════════════════════════════════

export const NEW_ULT_CHARS = ['volt', 'thomas', 'anchor', 'phantom', 'titan', 'wizard', 'robot', 'bat', 'dragon', 'ninja', 'bomber', 'king', 'phoenix', 'glacier', 'venom', 'seraph']

function arenaBounds() {
 if (ARENA_SHAPE === 'circle') {
  const r = (ARENA_R - BALL_RADIUS) * 0.7
  return {
   left: ARENA_CX - r,
   right: ARENA_CX + r,
   top: ARENA_CY - r,
   bottom: ARENA_CY + r,
  }
 }
 return {
  left: ARENA_PAD + BALL_RADIUS,
  right: CANVAS_W - ARENA_PAD - BALL_RADIUS,
  top: ARENA_PAD + BALL_RADIUS,
  bottom: CANVAS_H - ARENA_PAD - BALL_RADIUS,
 }
}

export function getNearestEnemy(ball, balls) {
 let best = null, bd = Infinity
 for (const b of balls) {
  if (b === ball || b.team === ball.team || b.hp <= 0) continue
  const d = dist(ball, b)
  if (d < bd) { bd = d; best = b }
 }
 if (!best) {
  for (const b of balls) { if (b !== ball && b.team !== ball.team) { best = b; break } }
 }
 return best
}

function rnd(a, b) { return a + Math.random() * (b - a) }

// Begin the charge/cast for a reworked ultimate.
export function startUltimate(ball, enemy, particles, now) {
  ball.attackCount = 0
  switch (ball.charKey) {
    case 'glacier':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false // FINAL: Glacier = instant freeze, no slow-mo
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 1500
      break
    case 'venom':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 1500
      break
    case 'seraph':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = true // FINAL: Seraph sanctuary = holy slow-mo moment
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 1500
      break
    case 'volt':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = true
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 1500
      break
    case 'thomas':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false // FINAL: Ghost Train = fast rush, no slow-mo
      ball.isUltImmune = true
      ball.ethereal = true
      ball.ultChargeUntil = now + 2000
      break
    case 'anchor':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false // NO slow-mo for Anchor
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 1500
      ball.anchorRings = 6
      // Chain shoots out instantly and roots the enemy for charge + bind
      enemy.isStunned = true
      enemy.stunUntil = now + 1500 + 3000
      break
    case 'phantom': {
      ball.ultStage = 'clones'
      ball.ultimateActive = true
      ball.ultEndAt = now + 10000
      const b = arenaBounds()
      ball.clones = []
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random()
        ball.clones.push({
          x: clamp(ball.x + Math.cos(a) * 45, b.left, b.right),
          y: clamp(ball.y + Math.sin(a) * 45, b.top, b.bottom),
          vx: Math.cos(a) * 4,
          vy: Math.sin(a) * 4,
          alive: true,
        })
      }
      particles.push(...createParticles(ball.x, ball.y, '#06b6d4', 30))
      break
    }
    case 'titan':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = true
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 3000
      ball._ultPrevHp = ball.hp
      break
    case 'wizard':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = true
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 3000
      break
    case 'robot':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 3000
      break
    case 'bat':
      ball.ultStage = 'charge'
      ball.ultFrozen = false // no frozen — spins while moving
      ball.ultSlowMo = false
      ball.isUltImmune = false
      ball.ultChargeUntil = now + 1500
      break
    case 'dragon':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = true // FINAL: Firebreath charge = intense slow-mo
      ball.isUltImmune = true
      ball.ultChargeUntil = now + 5000
      break
    case 'ninja':
      ball.ultStage = 'charge' // TIME DILATION: charge -> time stop -> shatter
      ball.ultFrozen = true // ninja holds still while charging the field
      ball.ultSlowMo = false // local distortion only (not global slow-mo)
      ball.isUltImmune = true
      ball.invisible = false
      ball.ultChargeUntil = now + 2000 // 2s charge
      ball.ninjaRingAt = 0
      ball.ninjaNextKunai = 0
      ball.sfxRequest = 'ability' // low rising rumble
      break
    case 'bomber':
      ball.ultStage = 'charge'
      ball.ultFrozen = false // flies up — no frozen
      ball.ultSlowMo = false
      ball.isUltImmune = true // airborne & untouchable while bombing
      ball.airborne = true
      ball.ultChargeUntil = now + 2000
      break
    case 'king':
      ball.ultStage = 'mode' // ROYAL DECREE: instant 8s mode, no charge
      ball.ultimateActive = true
      ball.ultFrozen = false
      ball.ultSlowMo = false
      ball.isUltImmune = true
      triggerSlowMo(850, 0.32) // FINAL: brief royal-decree time-stop moment
      ball.ultEndAt = now + 8000
      ball.nextSwordAt = now
      ball.kingSwords = []
      break
    case 'phoenix':
      ball.ultStage = 'charge'
      ball.ultFrozen = true
      ball.ultSlowMo = false // FINAL: Rebirth = instant, no slow-mo
      ball.isUltImmune = true
      ball.invisible = true // body bursts into fire particles
      ball.phoenixNovaUsed = false
      ball.ultChargeUntil = now + 3000
      break
  }
}

export function updateUltimates(ball, enemy, projectiles, trains, particles, damageNumbers, now) {
  if (!ball.ultStage) {
    // Titan HARDENED passive: permanent DR persists after ultimate ends
    if (ball.charKey === 'titan' && (ball.drPercent || 0) > 0) titanApplyDR(ball, false)
    return
  }
  switch (ball.charKey) {
    case 'volt': updateVoltUltimate(ball, enemy, projectiles, particles, damageNumbers, now); break
    case 'thomas': updateThomasUltimate(ball, enemy, trains, particles, now); break
    case 'anchor': updateAnchorUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'phantom': updatePhantomUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'titan': updateTitanUltimate(ball, enemy, projectiles, particles, damageNumbers, now); break
    case 'wizard': updateWizardUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'robot': updateRobotUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'bat': updateBatUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'dragon': updateDragonUltimate(ball, enemy, projectiles, particles, damageNumbers, now); break
    case 'ninja': updateNinjaUltimate(ball, enemy, projectiles, particles, damageNumbers, now); break
    case 'bomber': updateBomberUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'king': updateKingUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'phoenix': updatePhoenixUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'glacier': updateGlacierUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'venom': updateVenomUltimate(ball, enemy, particles, damageNumbers, now); break
    case 'seraph': updateSeraphUltimate(ball, enemy, particles, damageNumbers, now); break
  }
}

function sparkBurst(particles, x, y, color, count) {
  const n = Math.ceil(count * 2.4) // PRO VFX: denser bursts (50-100 on big hits)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const spd = 1 + Math.random() * 5.5
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.3 + Math.random() * 0.45, color, size: 2.5 + Math.random() * 4.5, shape: Math.random() > 0.5 ? 'spark' : 'circle', gravity: 0.04, drag: 0.95, decay: 0.02 })
  }
}

// ── VOLT — "Thunder God" ─────────────────────────────────────────────────────
function updateVoltUltimate(ball, enemy, projectiles, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    sparkBurst(particles, ball.x + rnd(-12, 12), ball.y + rnd(-12, 12), '#a78bfa', 4) // body vibration
    if (Math.random() < 0.4) { // arc lightning to walls
      const wx = Math.random() < 0.5 ? b.left : b.right
      sparkBurst(particles, wx, rnd(b.top, b.bottom), '#c4b5fd', 2)
    }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'dashing'
      ball.ultFrozen = false
      ball.ultSlowMo = false
      ball.isUltImmune = false
      ball.dashSeq = 0
      ball.dashCount = 8
      ball.nextDashAt = now
      ball.ultEndAt = now + 1500
      // Arena static field — enemy 40% slower for the whole ultimate
      enemy.moveSlowFactor = 0.6
      enemy.moveSlowUntil = now + 1500 + 8000
    }
    return
  }
  if (ball.ultStage === 'dashing') {
    if (ball.dashSeq < ball.dashCount && now >= ball.nextDashAt) {
      ball.dashSeq++
      const isFinal = ball.dashSeq >= ball.dashCount
      for (let k = 0; k < 6; k++) particles.push({ x: ball.x + rnd(-10, 10), y: ball.y + rnd(-10, 10), vx: 0, vy: 0, life: 0.4, color: '#a78bfa', size: BALL_RADIUS * 0.6, shape: 'circle' })
      const tx = isFinal ? enemy.x : rnd(b.left, b.right)
      const ty = isFinal ? enemy.y : rnd(b.top, b.bottom)
      const steps = 8
      for (let s = 1; s <= steps; s++) sparkBurst(particles, ball.x + (tx - ball.x) * (s / steps), ball.y + (ty - ball.y) * (s / steps), '#c4b5fd', 2)
      ball.x = clamp(tx, b.left, b.right)
      ball.y = clamp(ty, b.top, b.bottom)
      if (dist(ball, enemy) < BALL_RADIUS * 2 + 12) {
        if (isFinal) {
          enemy.hp -= 60; ball.totalDmgDealt += 60
          damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 60, isCrit: true, life: 1200 })
          const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
          enemy.x = clamp(enemy.x + Math.cos(ka) * 200, b.left, b.right)
          enemy.y = clamp(enemy.y + Math.sin(ka) * 200, b.top, b.bottom)
          enemy.vx = Math.cos(ka) * 8; enemy.vy = Math.sin(ka) * 8
          particles.push(...createParticles(enemy.x, enemy.y, '#a78bfa', 30))
        } else {
          enemy.hp -= 25; ball.totalDmgDealt += 25
          damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 25, isCrit: true, life: 1000 })
        }
      }
      ball.nextDashAt = now + 1500 / ball.dashCount
    }
    if (ball.dashSeq >= ball.dashCount && now >= ball.ultEndAt) {
      ball.ultStage = 'mode'
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.trailNodes = []
    }
    return
  }
  if (ball.ultStage === 'mode') {
    ball.trailNodes = ball.trailNodes || []
    ball.trailNodes.push({ x: ball.x, y: ball.y, until: now + 1500 })
    if (ball.trailNodes.length > 80) ball.trailNodes.shift()
    ball.trailNodes = ball.trailNodes.filter(n => n.until > now)
    for (const n of ball.trailNodes) {
      if (Math.random() < 0.25) sparkBurst(particles, n.x, n.y, '#a78bfa', 1)
      if (dist(n, enemy) < BALL_RADIUS + 8 && (!enemy.voltTrailCdUntil || enemy.voltTrailCdUntil < now)) {
        enemy.hp -= 10; ball.totalDmgDealt += 10
        enemy.isStunned = true; enemy.stunUntil = now + 500
        enemy.voltTrailCdUntil = now + 600
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 10, isCrit: false, life: 800 })
      }
    }
    if (now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.trailNodes = []
      enemy.moveSlowUntil = now // clear static field
      ball.attackCount = 0
    }
    return
  }
}

// ── THOMAS — Ghost Train Ultimate ────────────────────────────────────────────
function makeGhostTrain() {
  const b = arenaBounds()
  const edge = Math.floor(Math.random() * 4)
  let sx, sy
  if (edge === 0) { sx = rnd(b.left, b.right); sy = b.top }
  else if (edge === 1) { sx = rnd(b.left, b.right); sy = b.bottom }
  else if (edge === 2) { sx = b.left; sy = rnd(b.top, b.bottom) }
  else { sx = b.right; sy = rnd(b.top, b.bottom) }
  const tx = clamp(CANVAS_W - sx + rnd(-80, 80), b.left, b.right)
  const ty = clamp(CANVAS_H - sy + rnd(-80, 80), b.top, b.bottom)
  const tracks = []
  const n = 40
  for (let i = 0; i <= n; i++) tracks.push({ x: sx + (tx - sx) * (i / n), y: sy + (ty - sy) * (i / n), life: 4000 })
  return { tracks, progress: 0, damage: 30, active: true, x: sx, y: sy, ghost: true }
}
function updateThomasUltimate(ball, enemy, trains, particles, now) {
  if (ball.ultStage === 'charge') {
    for (let i = 0; i < 3; i++) { // purple glow + ghost + whistle particles from all directions
      const a = Math.random() * Math.PI * 2
      const d = 30 + Math.random() * 45
      particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * 1.5, vy: -Math.sin(a) * 1.5, life: 0.5 + Math.random() * 0.4, color: i % 2 === 0 ? '#a855f7' : '#d8b4fe', size: 4 + Math.random() * 5, shape: 'circle' })
    }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'storm'
      ball.ultFrozen = false
      ball.ultSlowMo = false
      ball.isUltImmune = false
      ball.stormUntil = now + 2000
      ball.ghostsSpawned = 0
      ball.ghostTotal = 10
      ball.nextGhostAt = now
    }
    return
  }
  if (ball.ultStage === 'storm') {
    if (ball.ghostsSpawned < ball.ghostTotal && now >= ball.nextGhostAt) {
      ball.ghostsSpawned++
      const gt = makeGhostTrain()
      gt.owner = ball.side
      trains.push(gt)
      particles.push(...createParticles(gt.x, gt.y, '#a855f7', 14)) // whistle/spawn burst
      ball.nextGhostAt = now + 2000 / ball.ghostTotal
    }
    if (Math.random() < 0.5) particles.push({ x: ball.x + rnd(-15, 15), y: ball.y + rnd(-15, 15), vx: 0, vy: 0, life: 0.4, color: '#a855f7', size: 6, shape: 'circle' })
    if (now >= ball.stormUntil && ball.ghostsSpawned >= ball.ghostTotal) {
      ball.ultStage = null
      ball.ethereal = false
      ball.attackCount = 0
    }
    return
  }
}

// ── ANCHOR — "Dead Anchor" ───────────────────────────────────────────────────
function drawChainParticles(particles, a, b, rings) {
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    if (Math.random() < 0.5) continue
    particles.push({ x: a.x + (b.x - a.x) * (i / steps), y: a.y + (b.y - a.y) * (i / steps), vx: 0, vy: 0, life: 0.12, color: '#9ca3af', size: 4, shape: 'circle' })
  }
  for (let r = 0; r < rings; r++) {
    const ang = (r / rings) * Math.PI * 2
    particles.push({ x: b.x + Math.cos(ang) * (BALL_RADIUS + 6), y: b.y + Math.sin(ang) * (BALL_RADIUS + 6), vx: 0, vy: 0, life: 0.12, color: '#d1d5db', size: 4, shape: 'circle' })
  }
}
function updateAnchorUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage === 'charge' || ball.ultStage === 'bind') {
    enemy.isStunned = true // keep enemy rooted
    if (enemy.stunUntil < now + 150) enemy.stunUntil = now + 250
    drawChainParticles(particles, ball, enemy, ball.anchorRings || 6)
  }
  if (ball.ultStage === 'charge') {
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'bind'
      ball.ultFrozen = false
      ball.isUltImmune = false
      ball.bindUntil = now + 3000
      ball.ramCount = 0
      ball.nextRamAt = 0
    }
    return
  }
  if (ball.ultStage === 'bind') {
    const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x) // ram toward rooted enemy
    ball.vx = Math.cos(a) * 6
    ball.vy = Math.sin(a) * 6
    if (dist(ball, enemy) < BALL_RADIUS * 2 + 4 && now >= (ball.nextRamAt || 0)) {
      ball.ramCount++
      const dmg = [10, 20, 40, 80][Math.min(ball.ramCount - 1, 3)]
      enemy.hp -= dmg; ball.totalDmgDealt += dmg
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: dmg >= 40, life: 1000 })
      particles.push(...createParticles(enemy.x, enemy.y, '#9ca3af', 12))
      ball.vx = -Math.cos(a) * 5; ball.vy = -Math.sin(a) * 5
      ball.nextRamAt = now + 400
    }
    if (now >= ball.bindUntil) { // RELEASE
      const b = arenaBounds()
      const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      enemy.x = clamp(enemy.x + Math.cos(ka) * 200, b.left, b.right)
      enemy.y = clamp(enemy.y + Math.sin(ka) * 200, b.top, b.bottom)
      enemy.isStunned = true; enemy.stunUntil = now + 1500
      enemy.vx = Math.cos(ka) * 3; enemy.vy = Math.sin(ka) * 3
      particles.push(...createParticles(enemy.x, enemy.y, '#9ca3af', 30))
      for (let i = 0; i < 10; i++) particles.push({ x: enemy.x, y: enemy.y, vx: rnd(-6, 6), vy: rnd(-6, 6), life: 0.6, color: '#6b7280', size: 6 + Math.random() * 6, shape: 'spark' })
      ball.ultStage = null
      ball.attackCount = 0
    }
    return
  }
}

// ── PHANTOM — "Phantom Army" (Clone Overwhelm) ───────────────────────────────
function updatePhantomUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage !== 'clones') return
  const b = arenaBounds()
  ball.clones = ball.clones || []
  for (const c of ball.clones) {
    if (!c.alive) continue
    const a = Math.atan2(enemy.y - c.y, enemy.x - c.x)
    c.vx += Math.cos(a) * 0.15
    c.vy += Math.sin(a) * 0.15
    const sp = Math.hypot(c.vx, c.vy)
    if (sp > 5) { c.vx = c.vx / sp * 5; c.vy = c.vy / sp * 5 }
    c.x += c.vx * frameScale(); c.y += c.vy * frameScale()
    if (c.x < b.left || c.x > b.right) c.vx *= -1
    if (c.y < b.top || c.y > b.bottom) c.vy *= -1
    c.x = clamp(c.x, b.left, b.right)
    c.y = clamp(c.y, b.top, b.bottom)
    if (Math.random() < 0.2) particles.push({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.3, color: '#06b6d4', size: 4, shape: 'circle' })
    if (dist(c, enemy) < BALL_RADIUS * 2) { // fake clone hits enemy
      enemy.hp -= 5; ball.totalDmgDealt += 5
      damageNumbers.push({ x: c.x, y: c.y, damage: 5, isCrit: false, life: 800 })
      c.alive = false
      particles.push(...createParticles(c.x, c.y, '#06b6d4', 12))
    }
  }
  ball.clones = ball.clones.filter(c => c.alive)
  if (dist(ball, enemy) < BALL_RADIUS * 2) { // real Phantom hits enemy -> reveal/shatter
    enemy.hp -= 30; ball.totalDmgDealt += 30
    damageNumbers.push({ x: ball.x, y: ball.y, damage: 30, isCrit: true, life: 1200 })
    for (const c of ball.clones) particles.push(...createParticles(c.x, c.y, '#06b6d4', 10))
    ball.clones = []; ball.ultStage = null; ball.ultimateActive = false; ball.attackCount = 0
    return
  }
  if (now >= ball.ultEndAt) {
    for (const c of ball.clones) particles.push(...createParticles(c.x, c.y, '#06b6d4', 8))
    ball.clones = []; ball.ultStage = null; ball.ultimateActive = false; ball.attackCount = 0
  }
}

// ── TITAN — "Iron Earth" (Adaptive Fortress) ────────���─────────��──────────────
function titanApplyDR(ball, gainStacks) {
  if (ball._ultPrevHp === undefined) { ball._ultPrevHp = ball.hp; return }
  if (ball.hp < ball._ultPrevHp) {
    const raw = ball._ultPrevHp - ball.hp
    const drBefore = ball.drPercent || 0
    ball.hp = ball._ultPrevHp - raw * (1 - drBefore) // reduce incoming damage
    if (gainStacks) {
      ball.drStacks = Math.min((ball.drStacks || 0) + 1, 18)
      ball.drPercent = Math.min(0.90, ball.drStacks * 0.05)
    }
  }
  ball._ultPrevHp = ball.hp
}
function updateTitanUltimate(ball, enemy, projectiles, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    for (let i = 0; i < 2; i++) { // orbiting rocks + ground cracks
      const a = Math.random() * Math.PI * 2
      const d = BALL_RADIUS + 10 + Math.random() * 30
      particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2, life: 0.4, color: i % 2 ? '#f97316' : '#7c2d12', size: 5 + Math.random() * 4, shape: 'circle' })
    }
    if (Math.random() < 0.3) particles.push({ x: ball.x + rnd(-30, 30), y: ball.y + BALL_RADIUS, vx: 0, vy: 0, life: 0.5, color: '#ef4444', size: 6, shape: 'spark' })
    ball._ultPrevHp = ball.hp // immune during charge; keep baseline
    if (now >= ball.ultChargeUntil) { // SLAM
      enemy.hp -= 55; ball.totalDmgDealt += 55
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 55, isCrit: true, life: 1200 })
      const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      enemy.x = clamp(enemy.x + Math.cos(ka) * 180, b.left, b.right)
      enemy.y = clamp(enemy.y + Math.sin(ka) * 180, b.top, b.bottom)
      enemy.vx = Math.cos(ka) * 7; enemy.vy = Math.sin(ka) * 7
      for (let j = 0; j < 4; j++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.8 - j * 0.12, color: j % 2 ? '#f97316' : '#fbbf24', size: 30 + j * 25, shape: 'ring' })
      particles.push(...createParticles(ball.x, ball.y, '#f97316', 30))
      ball.shakeRequest = 18 // screen shake x3
      ball.lavaNodes = [] // lava trail along shockwave path
      for (let s = 1; s <= 6; s++) ball.lavaNodes.push({ x: ball.x + (enemy.x - ball.x) * (s / 6), y: ball.y + (enemy.y - ball.y) * (s / 6), until: now + 3000 })
      ball.ultStage = 'mode'
      ball.ultFrozen = false
      ball.ultSlowMo = false
      ball.isUltImmune = false
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.drStacks = 0
      ball.drPercent = 0
      ball.hardened = false
      ball._ultPrevHp = ball.hp
    }
    return
  }
  if (ball.ultStage === 'mode') {
    const prevStacks = ball.drStacks || 0
    titanApplyDR(ball, true)
    if ((ball.drStacks || 0) > prevStacks) particles.push(...createParticles(ball.x, ball.y, '#7c2d12', 10)) // rocks fly off when hit
    ball.lavaNodes = (ball.lavaNodes || []).filter(n => n.until > now)
    for (const n of ball.lavaNodes) {
      if (Math.random() < 0.2) particles.push({ x: n.x + rnd(-10, 10), y: n.y + rnd(-10, 10), vx: 0, vy: -1, life: 0.4, color: '#f97316', size: 5, shape: 'circle' })
      if (dist(n, enemy) < BALL_RADIUS + 10 && (!enemy.lavaTickUntil || enemy.lavaTickUntil < now)) {
        enemy.hp -= 5; ball.totalDmgDealt += 5
        enemy.lavaTickUntil = now + 1000
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 5, isCrit: false, life: 700 })
      }
    }
    if (now >= ball.ultEndAt) { // HARDENED passive begins
      ball.ultStage = null
      ball.ultimateActive = false
      ball.hardened = true
      ball.lavaNodes = []
      ball.attackCount = 0
    }
    return
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  REWORKED ULTIMATES II — Wizard / Robot / Bat / Dragon / Ninja
// ════════════════════════════════════════���═══════════════════════════════════

// ── WIZARD — "Celestial Judgment" ────────────────────────────────────────────
function updateWizardUltimate(ball, enemy, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    if (Math.random() < 0.3) particles.push({ x: rnd(b.left, b.right), y: rnd(b.top, b.top + 70), vx: 0, vy: 0, life: 0.6, color: '#c4b5fd', size: 2 + Math.random() * 2, shape: 'circle' })
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'beam'
      ball.ultFrozen = true  // wizard stays put; the cosmic eye acts
      ball.ultSlowMo = false // enemy must be able to run
      ball.isUltImmune = true
      ball.beamUntil = now + 2000
      ball.meteorTrail = []
      ball.nextTrailAt = 0
      enemy.moveSlowFactor = 0.4 // 60% slower
      enemy.moveSlowUntil = now + 2000
    }
    return
  }
  if (ball.ultStage === 'beam') {
    enemy.moveSlowFactor = 0.4
    enemy.moveSlowUntil = now + 200
    if (now >= (ball.nextTrailAt || 0)) {
      ball.meteorTrail.push({ x: enemy.x, y: enemy.y })
      ball.nextTrailAt = now + 250 // sample the escape path
    }
    if (Math.random() < 0.5) sparkBurst(particles, enemy.x + rnd(-8, 8), enemy.y + rnd(-8, 8), '#a855f7', 2)
    if (now >= ball.beamUntil) {
      const pts = ball.meteorTrail.length ? ball.meteorTrail : [{ x: enemy.x, y: enemy.y }]
      ball.meteors = []
      for (let i = 0; i < 7; i++) {
        const p = pts[Math.floor((i / 7) * pts.length)] || pts[pts.length - 1]
        ball.meteors.push({ x: p.x, y: p.y, landAt: now + 300 + i * 170, hit: false })
      }
      ball.ultStage = 'meteor'
    }
    return
  }
  if (ball.ultStage === 'meteor') {
    ball.meteors = ball.meteors || []
    for (const m of ball.meteors) {
      if (m.hit) continue
      if (now >= m.landAt) {
        m.hit = true
        for (let j = 0; j < 3; j++) particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.6 - j * 0.12, color: j % 2 ? '#f97316' : '#fbbf24', size: 20 + j * 16, shape: 'ring' })
        particles.push(...createParticles(m.x, m.y, '#a855f7', 12))
        if (dist(m, enemy) < BALL_RADIUS + 26) {
          enemy.hp -= 18; ball.totalDmgDealt += 18
          damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 18, isCrit: false, life: 900 })
        }
      }
    }
    if (ball.meteors.length && ball.meteors.every(m => m.hit)) {
      const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x) // eye closes -> arcane shockwave
      enemy.x = clamp(enemy.x + Math.cos(ka) * 200, b.left, b.right)
      enemy.y = clamp(enemy.y + Math.sin(ka) * 200, b.top, b.bottom)
      enemy.vx = Math.cos(ka) * 6; enemy.vy = Math.sin(ka) * 6
      enemy.hp -= 20; ball.totalDmgDealt += 20
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 20, isCrit: false, life: 1000 })
      for (let j = 0; j < 4; j++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.7 - j * 0.12, color: '#a855f7', size: 28 + j * 22, shape: 'ring' })
      ball.meteors = []
      ball.ultStage = 'mode'
      ball.ultFrozen = false
      ball.isUltImmune = false
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.nextEyeBeamAt = now + 3000
    }
    return
  }
  if (ball.ultStage === 'mode') {
    if (now >= (ball.nextEyeBeamAt || 0)) {
      ball.nextEyeBeamAt = now + 3000 // auto tracking beam every 3s
      const steps = 8
      for (let s = 1; s <= steps; s++) sparkBurst(particles, enemy.x, b.top + (enemy.y - b.top) * (s / steps), '#c4b5fd', 1)
      enemy.moveSlowFactor = 0.6
      enemy.moveSlowUntil = now + 800
      enemy.hp -= 5; ball.totalDmgDealt += 5
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 5, isCrit: false, life: 700 })
    }
    if (now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.attackCount = 0
    }
    return
  }
}

// ── ROBOT — "Artillery Grid" ─────────────────────────────────────────────────
function buildGrid(cols) {
  const b = arenaBounds()
  const cells = []
  const half = (b.right - b.left) / cols / 2
  for (let r = 0; r < cols; r++) for (let c = 0; c < cols; c++) {
    cells.push({ x: b.left + (c + 0.5) * (b.right - b.left) / cols, y: b.top + (r + 0.5) * (b.bottom - b.top) / cols, half })
  }
  return cells
}
function updateRobotUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage === 'charge') {
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'barrage'
      ball.ultFrozen = false
      ball.isUltImmune = false
      ball.gridCols = 3
      ball.gridCells = buildGrid(3)
      ball.beamSeq = 0
      ball.beamTotal = 9
      ball.nextBeamAt = now
      ball.beamInterval = 300
      ball.consecutiveHits = 0
      ball.puddles = ball.puddles || []
    }
    return
  }
  if (ball.ultStage === 'barrage' || ball.ultStage === 'mode') {
    if (now >= (ball.nextBeamAt || 0)) {
      const cells = ball.gridCells
      let cell = cells[ball.beamSeq % cells.length]
      let lockOn = false
      if (ball.consecutiveHits >= 3) { cell = { x: enemy.x, y: enemy.y, half: 99999 }; lockOn = true } // lock-on tracking beam
      const top = ARENA_PAD
      for (let s = 1; s <= 10; s++) particles.push({ x: cell.x + rnd(-3, 3), y: top + (cell.y - top) * (s / 10), vx: 0, vy: 0, life: 0.25, color: lockOn ? '#ef4444' : '#f87171', size: lockOn ? 8 : 5, shape: 'spark' })
      particles.push({ x: cell.x, y: cell.y, vx: 0, vy: 0, life: 0.4, color: '#ef4444', size: 22, shape: 'ring' })
      const within = Math.abs(enemy.x - cell.x) < cell.half && Math.abs(enemy.y - cell.y) < cell.half
      if (lockOn || within) {
        const dmg = lockOn ? 40 : 20
        enemy.hp -= dmg; ball.totalDmgDealt += dmg
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: lockOn, life: 900 })
        ball.consecutiveHits = lockOn ? 0 : ball.consecutiveHits + 1
        particles.push(...createParticles(enemy.x, enemy.y, '#ef4444', 12))
      } else {
        ball.consecutiveHits = 0
      }
      if (!lockOn) ball.puddles.push({ x: cell.x, y: cell.y, r: cell.half, until: ball.ultStage === 'mode' ? now + 99999 : now + 4000 })
      ball.beamSeq++
      ball.nextBeamAt = now + ball.beamInterval
      if (ball.ultStage === 'barrage' && ball.beamSeq >= ball.beamTotal) { // enter shrinking 2x2 mode
        ball.ultStage = 'mode'
        ball.ultimateActive = true
        ball.ultimateTimer = 6000
        ball.ultEndAt = now + 6000
        ball.gridCols = 2
        ball.gridCells = buildGrid(2)
        ball.beamSeq = 0
        ball.beamInterval = 150
      }
    }
    ball.puddles = (ball.puddles || []).filter(p => p.until > now)
    for (const p of ball.puddles) {
      if (Math.random() < 0.12) particles.push({ x: p.x + rnd(-p.r, p.r), y: p.y + rnd(-p.r, p.r), vx: 0, vy: 0, life: 0.3, color: '#60a5fa', size: 4, shape: 'spark' })
      if (Math.abs(enemy.x - p.x) < p.r && Math.abs(enemy.y - p.y) < p.r && (!enemy.puddleTickUntil || enemy.puddleTickUntil < now)) {
        enemy.hp -= 8; ball.totalDmgDealt += 8
        enemy.puddleTickUntil = now + 1000
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 8, isCrit: false, life: 600 })
      }
    }
    if (ball.ultStage === 'mode' && now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.puddles = []
      ball.attackCount = 0
    }
    return
  }
}

// ── BAT — "Crimson Feast" ────────────────────────────────────────────────────
function updateBatUltimate(ball, enemy, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    const sp = now * 0.02
    for (let i = 0; i < 2; i++) { const a = sp + i * Math.PI; particles.push({ x: ball.x + Math.cos(a) * (BALL_RADIUS + 10), y: ball.y + Math.sin(a) * (BALL_RADIUS + 10), vx: 0, vy: 0, life: 0.3, color: '#dc2626', size: 6, shape: 'circle' }) }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'lunge'
      const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      ball.vx = Math.cos(a) * (ball.char.speed * 3)
      ball.vy = Math.sin(a) * (ball.char.speed * 3)
      ball.lungeUntil = now + 1500
    }
    return
  }
  if (ball.ultStage === 'lunge') {
    const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x) // home toward enemy at 3x speed
    ball.vx = Math.cos(a) * (ball.char.speed * 3)
    ball.vy = Math.sin(a) * (ball.char.speed * 3)
    sparkBurst(particles, ball.x, ball.y, '#dc2626', 1)
    if (dist(ball, enemy) < BALL_RADIUS * 2 + 6 || now >= ball.lungeUntil) {
      ball.ultStage = 'latch'
      ball.ultFrozen = true // pinned to enemy, moved manually
      ball.latchUntil = now + 2000
      ball.nextBiteAt = now
    }
    return
  }
  if (ball.ultStage === 'latch') {
    enemy.isStunned = true; enemy.stunUntil = now + 120 // enemy can't move freely
    ball.x = clamp(enemy.x + BALL_RADIUS * 1.2, b.left, b.right)
    ball.y = clamp(enemy.y, b.top, b.bottom)
    ball.vx = 0; ball.vy = 0
    if (Math.random() < 0.6) sparkBurst(particles, enemy.x + rnd(-10, 10), enemy.y + rnd(-10, 10), '#dc2626', 2)
    if (now >= (ball.nextBiteAt || 0)) { // 25 dmg/s + heal 25/s
      enemy.hp -= 25; ball.totalDmgDealt += 25
      ball.hp = Math.min(ball.char.hp, ball.hp + 25)
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 25, isCrit: false, life: 800 })
      ball.nextBiteAt = now + 1000
    }
    if (now >= ball.latchUntil) { // release: recoil + 30 AOE
      ball.ultFrozen = false
      const ka = Math.atan2(ball.y - enemy.y, ball.x - enemy.x)
      ball.vx = Math.cos(ka) * 7; ball.vy = Math.sin(ka) * 7
      enemy.hp -= 30; ball.totalDmgDealt += 30
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 30, isCrit: true, life: 1000 })
      for (let j = 0; j < 4; j++) particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.6 - j * 0.12, color: '#dc2626', size: 24 + j * 18, shape: 'ring' })
      particles.push(...createParticles(enemy.x, enemy.y, '#991b1b', 24))
      ball.ultStage = null
      ball.attackCount = 0
    }
    return
  }
}

// ── DRAGON — "Dragon's Wrath" ────────────────────────────────────────────────
function dragonBurnTick(ball, enemy, particles, damageNumbers, now) {
  ball.burnNodes = (ball.burnNodes || []).filter(n => n.until > now)
  for (const n of ball.burnNodes) {
    if (Math.random() < 0.08) particles.push({ x: n.x + rnd(-8, 8), y: n.y + rnd(-8, 8), vx: 0, vy: -1, life: 0.4, color: Math.random() < 0.5 ? '#f97316' : '#ef4444', size: 5, shape: 'circle' })
    if (dist(n, enemy) < BALL_RADIUS + 14 && (!enemy.burnTickUntil || enemy.burnTickUntil < now)) {
      enemy.hp -= 10; ball.totalDmgDealt += 10
      enemy.burnTickUntil = now + 1000
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 10, isCrit: false, life: 600 })
    }
  }
}
function updateDragonUltimate(ball, enemy, projectiles, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    for (let i = 0; i < 4; i++) { // fire sucked inward to the mouth
      const a = Math.random() * Math.PI * 2
      const d = 60 + Math.random() * 80
      particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 0.4, color: Math.random() < 0.5 ? '#f59e0b' : '#fde68a', size: 4 + Math.random() * 5, shape: 'spark' })
    }
    if (Math.random() < 0.3) particles.push({ x: ball.x + rnd(-30, 30), y: ball.y + BALL_RADIUS, vx: 0, vy: 0, life: 0.5, color: '#ef4444', size: 6, shape: 'spark' })
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'laser'
      ball.laserAngle = Math.atan2(enemy.y - ball.y, enemy.x - ball.x) // locked direction
      ball.laserUntil = now + 3000
      ball.nextLaserTickAt = now
      ball.burnNodes = []
      ball.nextBurnAt = 0
    }
    return
  }
  if (ball.ultStage === 'laser') {
    const ang = ball.laserAngle
    ball.vx = 0; ball.vy = 0 // locked in place (also ultFrozen)
    for (let s = 1; s <= 22; s++) {
      const px = ball.x + Math.cos(ang) * (BALL_RADIUS + s * 26)
      const py = ball.y + Math.sin(ang) * (BALL_RADIUS + s * 26)
      if (px < b.left - 40 || px > b.right + 40 || py < b.top - 40 || py > b.bottom + 40) break
      particles.push({ x: px + rnd(-6, 6), y: py + rnd(-6, 6), vx: 0, vy: 0, life: 0.18, color: s < 4 ? '#ffffff' : (s % 2 ? '#fde68a' : '#f97316'), size: Math.max(3, 18 - s * 0.3), shape: 'spark' })
    }
    if (now >= (ball.nextBurnAt || 0)) { // burn trail along the beam, persists 4s
      ball.nextBurnAt = now + 200
      for (let s = 2; s <= 18; s += 3) {
        const px = ball.x + Math.cos(ang) * (BALL_RADIUS + s * 26)
        const py = ball.y + Math.sin(ang) * (BALL_RADIUS + s * 26)
        if (px < b.left || px > b.right || py < b.top || py > b.bottom) continue
        ball.burnNodes.push({ x: px, y: py, until: now + 4000 })
      }
    }
    const relx = enemy.x - ball.x, rely = enemy.y - ball.y // beam hit: in front + within 60px width
    const along = relx * Math.cos(ang) + rely * Math.sin(ang)
    const perp = Math.abs(-relx * Math.sin(ang) + rely * Math.cos(ang))
    if (along > 0 && perp < 30 + BALL_RADIUS && now >= (ball.nextLaserTickAt || 0)) {
      enemy.hp -= 35; ball.totalDmgDealt += 35 // 35/sec
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 35, isCrit: true, life: 700 })
      ball.nextLaserTickAt = now + 1000
    }
    dragonBurnTick(ball, enemy, particles, damageNumbers, now)
    if (now >= ball.laserUntil) {
      ball.ultStage = 'burnout'
      ball.ultFrozen = false
      ball.isUltImmune = false
      ball.burnoutUntil = now + 4000
    }
    return
  }
  if (ball.ultStage === 'burnout') {
    dragonBurnTick(ball, enemy, particles, damageNumbers, now)
    ball.burnNodes = (ball.burnNodes || []).filter(n => n.until > now)
    if (now >= ball.burnoutUntil && ball.burnNodes.length === 0) {
      ball.ultStage = null
      ball.burnNodes = []
      ball.attackCount = 0
    }
    return
  }
}

// ── NINJA — "TIME DILATION" (Stasis Time Stop) ───────────────────────────────
function updateNinjaUltimate(ball, enemy, projectiles, particles, damageNumbers, now) {
  // CHARGE (2s): ninja frozen, gray crystals form & rotate around the body
  if (ball.ultStage === 'charge') {
    const k = 1 - Math.max(0, (ball.ultChargeUntil || now) - now) / 2000
    for (let i = 0; i < 4; i++) {
      const a = now * 0.006 + i * (Math.PI / 2)
      const rr = 38 - k * 14
      particles.push({ x: ball.x + Math.cos(a) * rr, y: ball.y + Math.sin(a) * rr, vx: 0, vy: 0, life: 0.3, color: i % 2 ? '#A5F3FC' : '#9CA3AF', size: 6 + k * 7, shape: 'spark', glow: 18, angle: a })
    }
    if (Math.random() < 0.75) { const a = Math.random() * Math.PI * 2; const d = 54 - k * 22 + Math.random() * 16; particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * (1.5 + k * 2), vy: -Math.sin(a) * (1.5 + k * 2), life: 0.5, color: Math.random() < 0.5 ? '#9CA3AF' : '#A5F3FC', size: 4 + Math.random() * 4, shape: 'spark', glow: 16 }) }
    if (now >= (ball.ninjaRingAt || 0)) { ball.ninjaRingAt = now + 340; for (let r = 0; r < 2; r++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.5 - r * 0.1, color: '#A5F3FC', size: 22 + r * 16 + k * 26, shape: 'ring', lineWidth: 2, glow: 18 }) }
    if (now >= (ball.ultChargeUntil || 0)) {
      ball.ultStage = 'timestop'
      ball.ultFrozen = false
      ball.isUltImmune = true
      ball.ninjaStopUntil = now + 2000 // freeze the world for 2s
      ball.ninjaNextKunai = now
      triggerTimeStop(ball, 2000)
      ball.shakeRequest = Math.max(ball.shakeRequest || 0, 16)
      ball.sfxRequest = 'ultimate'
      for (let j = 0; j < 90; j++) { const a = Math.random() * Math.PI * 2; const ss = 2 + Math.random() * 7; particles.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * ss, vy: Math.sin(a) * ss, life: 0.6 + Math.random() * 0.4, color: j % 3 === 0 ? '#ffffff' : (j % 3 === 1 ? '#B4F8F8' : '#A5F3FC'), size: 5 + Math.random() * 8, shape: j % 3 === 0 ? 'spark' : 'circle', glow: 24, drag: 0.95 }) }
      particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.6, color: '#B4F8F8', size: 60, shape: 'ring', lineWidth: 4, glow: 28 })
    }
    return
  }
  // TIME STOP (2s): ninja mobile (1.5x in updatePhysics), spams kunai @ ~6/sec
  // that freeze mid-air, forming a "wall of death" that all fly when time resumes.
  if (ball.ultStage === 'timestop') {
    for (let i = 0; i < 2; i++) particles.push({ x: ball.x + rnd(-8, 8), y: ball.y + rnd(-8, 8), vx: -ball.vx * 0.15, vy: -ball.vy * 0.15, life: 0.3, color: i ? '#A5F3FC' : '#9CA3AF', size: 6 + Math.random() * 4, shape: 'circle', glow: 12 })
    if (now >= (ball.ninjaNextKunai || 0)) {
      ball.ninjaNextKunai = now + 167 // 6 kunai per second
      const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      const speed = 14
      projectiles.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, owner: ball.side, damage: ball.char.abilityDamage, type: 'kunai', life: 2600, angle: a })
      ball.sfxRequest = 'sword'
      for (let j = 0; j < 7; j++) { const sa = a + rnd(-0.4, 0.4); particles.push({ x: ball.x, y: ball.y, vx: Math.cos(sa) * 4, vy: Math.sin(sa) * 4, life: 0.3, color: j % 2 ? '#A5F3FC' : '#9CA3AF', size: 5, shape: 'spark', glow: 16 }) }
    }
    if (now >= (ball.ninjaStopUntil || 0)) {
      endTimeStop() // time resumes — every suspended kunai flies at once
      ball.ultStage = 'shatter'
      ball.ninjaShatterUntil = now + 360
      ball.shakeRequest = Math.max(ball.shakeRequest || 0, 14)
      ball.sfxRequest = 'explosion'
      for (const pt of [enemy, ball]) {
        if (!pt) continue
        for (let j = 0; j < 50; j++) { const a = Math.random() * Math.PI * 2; const ss = 3 + Math.random() * 8; particles.push({ x: pt.x, y: pt.y, vx: Math.cos(a) * ss, vy: Math.sin(a) * ss, life: 0.5 + Math.random() * 0.5, color: j % 3 === 0 ? '#ffffff' : (j % 3 === 1 ? '#B4F8F8' : '#A5F3FC'), size: 5 + Math.random() * 8, shape: j % 3 === 0 ? 'spark' : 'circle', glow: 24, drag: 0.94 }) }
        particles.push({ x: pt.x, y: pt.y, vx: 0, vy: 0, life: 0.55, color: '#B4F8F8', size: 44, shape: 'ring', lineWidth: 4, glow: 28 })
        particles.push({ x: pt.x, y: pt.y, vx: 0, vy: 0, life: 0.4, color: '#ffffff', size: 20, shape: 'ring', lineWidth: 2, glow: 28 })
      }
    }
    return
  }
  // SHATTER: brief settle tail after time resumes
  if (ball.ultStage === 'shatter') {
    if (now >= (ball.ninjaShatterUntil || 0)) {
      ball.ultStage = null
      ball.isUltImmune = false
      ball.attackCount = 0
    }
    return
  }
  // PHASE 1 — SHADOW DASH (3s): 5-8 quick dashes, marking enemies on contact
  if (ball.ultStage === 'dash') {
    for (let i = 0; i < 3; i++) particles.push({ x: ball.x + rnd(-9, 9), y: ball.y + rnd(-9, 9), vx: -ball.vx * 0.2, vy: -ball.vy * 0.2, life: 0.35, color: i % 2 ? 'rgba(18,18,26,0.85)' : 'rgba(239,68,68,0.8)', size: 7 + Math.random() * 6, shape: 'circle', glow: 12 })
    if (now >= (ball.nextDashAt || 0) && ball.ninjaDashCount < ball.ninjaMaxDashes) {
      const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      ball.vx = Math.cos(a) * 22; ball.vy = Math.sin(a) * 22
      ball.ninjaDashCount++
      ball.nextDashAt = now + 3000 / ball.ninjaMaxDashes
      ball.shakeRequest = Math.max(ball.shakeRequest || 0, 5)
      for (let j = 0; j < 14; j++) particles.push({ x: ball.x, y: ball.y, vx: Math.cos(a + rnd(-0.3, 0.3)) * (6 + Math.random() * 6), vy: Math.sin(a + rnd(-0.3, 0.3)) * (6 + Math.random() * 6), angle: a, life: 0.3, color: j % 2 ? '#ef4444' : '#1f2937', size: 8, shape: 'spark', glow: 18 })
    }
    if (dist(ball, enemy) < BALL_RADIUS * 2 + 6) {
      if (!ball.ninjaMarks.includes(enemy)) {
        ball.ninjaMarks.push(enemy)
        enemy.hp -= 18; ball.totalDmgDealt += 18
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 18, isCrit: false, life: 800 })
      }
      particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.4, color: '#ef4444', size: 30, shape: 'ring', lineWidth: 3, glow: 20 })
    }
    if (now >= ball.ninjaDashUntil) ball.ultStage = 'detonate'
    return
  }
  // PHASE 3 — DETONATE all marks simultaneously (massive AOE)
  if (ball.ultStage === 'detonate') {
    const marks = ball.ninjaMarks && ball.ninjaMarks.length ? ball.ninjaMarks : [enemy]
    const boom = 40 + (ball.ninjaConsumedStacks || 0) * 4
    for (const m of marks) {
      if (!m) continue
      m.hp -= boom; ball.totalDmgDealt += boom
      m.isStunned = true; m.stunUntil = now + 1500
      damageNumbers.push({ x: m.x, y: m.y, damage: boom, isCrit: true, life: 1300 })
      particles.push(...createParticles(m.x, m.y, '#ef4444', 36))
      for (let j = 0; j < 46; j++) { const sa = Math.random() * Math.PI * 2; const ss = 1 + Math.random() * 5; particles.push({ x: m.x, y: m.y, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss - 1, life: 0.6 + Math.random() * 0.6, color: j % 3 === 0 ? 'rgba(30,30,40,0.85)' : j % 3 === 1 ? 'rgba(90,90,110,0.7)' : '#6b7280', size: 10 + Math.random() * 14, shape: 'circle', drag: 0.95 }) }
      for (let j = 0; j < 20; j++) { const sa = Math.random() * Math.PI * 2; const ss = 5 + Math.random() * 7; particles.push({ x: m.x, y: m.y, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss, angle: sa, life: 0.4, color: j % 2 ? '#ef4444' : '#fca5a5', size: 8 + Math.random() * 6, shape: 'spark', glow: 26 }) }
      for (let j = 0; j < 5; j++) particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.7 - j * 0.1, color: j % 2 ? '#fca5a5' : '#ef4444', size: 24 + j * 22, shape: 'ring', lineWidth: 4 })
    }
    ball.shakeRequest = Math.max(ball.shakeRequest || 0, 22)
    ball.ultStage = 'mode'
    ball.ninjaModeStart = now
    ball.ninjaModeUntil = now + 8000
    ball.ultimateActive = true
    ball.isUltImmune = false
    ball.ninjaMarks = []
    ball.ninjaTimedMarks = []
    return
  }
  // ULTIMATE MODE (8s): speed ramps +20% -> +80% (in updatePhysics); basic attacks plant 1.5s marks
  if (ball.ultStage === 'mode') {
    for (let i = 0; i < 2; i++) particles.push({ x: ball.x + rnd(-9, 9), y: ball.y + rnd(-9, 9), vx: -ball.vx * 0.18, vy: -ball.vy * 0.18, life: 0.35, color: i % 2 ? 'rgba(18,18,26,0.8)' : 'rgba(239,68,68,0.7)', size: 7 + Math.random() * 5, shape: 'circle', glow: 12 })
    if (ball.ninjaTimedMarks && ball.ninjaTimedMarks.length) {
      for (let k = ball.ninjaTimedMarks.length - 1; k >= 0; k--) {
        const tm = ball.ninjaTimedMarks[k]
        if (now >= tm.detonateAt) {
          const t = tm.target
          if (t && t.hp > 0) {
            t.hp -= 25; ball.totalDmgDealt += 25
            damageNumbers.push({ x: t.x, y: t.y, damage: 25, isCrit: true, life: 1000 })
            particles.push(...createParticles(t.x, t.y, '#ef4444', 18))
            for (let j = 0; j < 5; j++) particles.push({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.5 - j * 0.08, color: j % 2 ? '#fca5a5' : '#ef4444', size: 16 + j * 12, shape: 'ring', lineWidth: 3 })
            ball.shakeRequest = Math.max(ball.shakeRequest || 0, 10)
          }
          ball.ninjaTimedMarks.splice(k, 1)
        } else if (Math.random() < 0.3 && tm.target) {
          particles.push({ x: tm.target.x, y: tm.target.y - 30, vx: 0, vy: 0, life: 0.3, color: '#ef4444', size: 9, shape: 'circle', glow: 18 })
        }
      }
    }
    if (now >= ball.ninjaModeUntil) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.attackCount = 0
    }
    return
  }
  if (ball.ultStage === '__legacy_hunt__') {
    ball.invisible = true
    for (let i = 0; i < 2; i++) particles.push({ x: ball.x + rnd(-8, 8), y: ball.y + rnd(-8, 8), vx: -ball.vx * 0.15 + rnd(-0.4, 0.4), vy: -ball.vy * 0.15 + rnd(-0.4, 0.4), life: 0.35 + Math.random() * 0.3, color: i ? 'rgba(40,40,55,0.65)' : 'rgba(110,110,130,0.55)', size: 6 + Math.random() * 6, shape: 'circle', glow: 6 })
    if (Math.random() < 0.4) particles.push({ x: ball.x + rnd(-12, 12), y: ball.y + rnd(-12, 12), vx: 0, vy: -0.6, life: 0.4, color: 'rgba(80,80,100,0.4)', size: 10, shape: 'circle' })
    if (dist(ball, enemy) < BALL_RADIUS * 2 + 4 && now >= (ball.nextStrikeAt || 0)) {
      ball.markHits++
      const fa = Math.atan2(enemy.vy, enemy.vx) // attack-from-behind check
      const toNinja = Math.atan2(ball.y - enemy.y, ball.x - enemy.x)
      const diff = Math.abs(((toNinja - fa + Math.PI) % (Math.PI * 2)) - Math.PI)
      const behind = diff > Math.PI / 2
      if (ball.markHits >= 4) { // Death Mark detonates on the 4th strike
        enemy.hp -= 80; ball.totalDmgDealt += 80
        enemy.isStunned = true; enemy.stunUntil = now + 2000
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 80, isCrit: true, life: 1300 })
        // DEATH MARK DETONATION — big smoke explosion + red shockwave rings
        particles.push(...createParticles(enemy.x, enemy.y, '#ef4444', 40))
        for (let j = 0; j < 50; j++) { const sa = Math.random() * Math.PI * 2; const ss = 1 + Math.random() * 5; particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss - 1, life: 0.6 + Math.random() * 0.6, color: j % 3 === 0 ? 'rgba(40,40,55,0.8)' : j % 3 === 1 ? 'rgba(90,90,110,0.7)' : '#6b7280', size: 10 + Math.random() * 14, shape: 'circle', drag: 0.95 }) }
        for (let j = 0; j < 24; j++) { const sa = Math.random() * Math.PI * 2; const ss = 5 + Math.random() * 7; particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss, angle: sa, life: 0.4 + Math.random() * 0.3, color: j % 2 ? '#ef4444' : '#fca5a5', size: 8 + Math.random() * 6, shape: 'spark', glow: 26 }) }
        for (let j = 0; j < 5; j++) particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.7 - j * 0.1, color: j % 2 ? '#fca5a5' : '#ef4444', size: 22 + j * 20, shape: 'ring', lineWidth: 4 })
        ball.shakeRequest = Math.max(ball.shakeRequest || 0, 20)
        ball.invisible = false
        ball.ultStage = null
        ball.attackCount = 0
      } else {
        let dmg = 30 // 3x base, guaranteed crit
        if (behind) dmg += 20
        enemy.hp -= dmg; ball.totalDmgDealt += dmg
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: true, life: 1000 })
        // CRIT VFX: red double-slash + smoke burst + ring
        particles.push(...createParticles(enemy.x, enemy.y, '#6b7280', 16))
        const slashA = Math.random() * Math.PI
        for (let s = -1; s <= 1; s++) particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(slashA) * (7 + s), vy: Math.sin(slashA) * (7 + s), angle: slashA, life: 0.35, color: '#ef4444', size: 9, shape: 'spark', glow: 24 })
        for (let s = -1; s <= 1; s++) particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(slashA + Math.PI) * (7 + s), vy: Math.sin(slashA + Math.PI) * (7 + s), angle: slashA, life: 0.35, color: '#fca5a5', size: 9, shape: 'spark', glow: 24 })
        particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.4, color: '#ef4444', size: 26, shape: 'ring', lineWidth: 3 })
        ball.shakeRequest = Math.max(ball.shakeRequest || 0, 8)
        const a = Math.atan2(ball.y - enemy.y, ball.x - enemy.x) // bounce away to reposition
        ball.vx = Math.cos(a) * 6; ball.vy = Math.sin(a) * 6
        ball.nextStrikeAt = now + 500
      }
    }
    if (ball.ultStage === 'hunt' && now >= ball.huntUntil) { // time up, mark fades
      ball.invisible = false
      ball.ultStage = null
      ball.attackCount = 0
    }
    return
  }
}

// ═════════════════════════════════════════════════════════════════════
//  ROUND 3 REWORKED ULTIMATES — Bomber / King / Phoenix
// ═════════════════════════════════════════════════════════════════════

// BOMBER — "CARPET BOMBING": hovers airborne (immune) and sweeps the arena with
// 4 bomb waves L→R, then a full-arena 5th wave, then a landing impact.
function updateBomberUltimate(ball, enemy, particles, damageNumbers, now) {
  const fullL = ARENA_PAD, fullR = CANVAS_W - ARENA_PAD, fullT = ARENA_PAD, fullB = CANVAS_H - ARENA_PAD

  // lingering fire left behind narrows the safe gaps — embers + light DoT
  function tickFire() {
    ball.bombFire = (ball.bombFire || []).filter(f => f.until > now)
    for (const f of ball.bombFire) {
      if (Math.random() < 0.5) particles.push({ x: f.x + rnd(-f.r, f.r), y: f.y + rnd(-f.r * 0.5, f.r * 0.5), vx: rnd(-0.5, 0.5), vy: -1 - Math.random(), life: 0.4 + Math.random() * 0.3, color: Math.random() > 0.5 ? '#f97316' : '#fbbf24', size: 4 + Math.random() * 5, shape: 'spark' })
      if (dist(f, enemy) < f.r && (enemy.bombFireTickUntil || 0) <= now) {
        enemy.hp -= 8; ball.totalDmgDealt += 8
        enemy.bombFireTickUntil = now + 1000
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 8, isCrit: false, life: 700 })
      }
    }
  }

  // single bomb explosion: AOE damage + VFX + optional lingering fire
  function detonate(x, y, dmg, radius, leaveFire) {
    for (let r = 0; r < 5; r++) particles.push({ x, y, vx: 0, vy: 0, life: 0.6 - r * 0.09, color: r % 2 ? '#fbbf24' : '#f97316', size: radius * (0.4 + r * 0.18), shape: 'ring', lineWidth: 4 - r * 0.5 })
    sparkBurst(particles, x, y, '#f97316', 34)
    for (let d = 0; d < 10; d++) { const da = Math.random() * Math.PI * 2, ds = 3 + Math.random() * 6; particles.push({ x, y, vx: Math.cos(da) * ds, vy: Math.sin(da) * ds, life: 0.5 + Math.random() * 0.4, color: '#7c2d12', size: 3 + Math.random() * 4, shape: 'circle', gravity: 0.12, drag: 0.96 }) }
    if (Math.sqrt((enemy.x - x) ** 2 + (enemy.y - y) ** 2) < radius) {
      enemy.hp -= dmg; ball.totalDmgDealt += dmg
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: dmg, isCrit: dmg >= 50, life: 1000 })
    }
    if (leaveFire) { ball.bombFire = ball.bombFire || []; ball.bombFire.push({ x, y, r: 46, until: now + 6000 }) }
  }

  if (ball.ultStage === 'charge') {
    ball.airborne = true; ball.isUltImmune = true; ball.vx = 0; ball.vy = 0
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'bombing'
      ball.bombSeq = 0
      ball.bombTotal = 16 // waves 1-4 × 4 bombs
      ball.nextBombAt = now
      ball.bombFire = []
    }
    return
  }

  if (ball.ultStage === 'bombing') {
    ball.vx = 0; ball.vy = 0; ball.isUltImmune = true
    tickFire()
    if (now >= ball.nextBombAt) {
      const idxInWave = ball.bombSeq % 4 // 0..3 sweeps left → right
      const t = idxInWave / 3
      const bx = fullL + 30 + t * (fullR - fullL - 60) + rnd(-12, 12)
      const by = fullT + 40 + Math.random() * (fullB - fullT - 80)
      detonate(bx, by, 30, 120, true)
      ball.bombSeq++
      ball.nextBombAt = now + 400
      if (ball.bombSeq >= ball.bombTotal) { ball.ultStage = 'carpet'; ball.carpetAt = now + 450 }
    }
    return
  }

  if (ball.ultStage === 'carpet') {
    ball.vx = 0; ball.vy = 0; ball.isUltImmune = true
    tickFire()
    if (now >= ball.carpetAt) {
      // wave 5: the whole arena is bombed at once — no safe gap, 50 flat
      for (let gx = fullL + 40; gx < fullR; gx += 70) for (let gy = fullT + 40; gy < fullB; gy += 70) {
        for (let r = 0; r < 2; r++) particles.push({ x: gx, y: gy, vx: 0, vy: 0, life: 0.5 - r * 0.15, color: r ? '#fbbf24' : '#f97316', size: 38 + r * 18, shape: 'ring' })
      }
      sparkBurst(particles, enemy.x, enemy.y, '#f97316', 30)
      enemy.hp -= 50; ball.totalDmgDealt += 50
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 50, isCrit: true, life: 1300 })
      ball.shakeRequest = 24 // full-arena carpet bomb
      ball.ultStage = 'landing'; ball.landAt = now + 350
    }
    return
  }

  if (ball.ultStage === 'landing') {
    tickFire()
    if (now >= ball.landAt) {
      ball.airborne = false
      detonate(ball.x, ball.y, 20, 120, false)
      ball.shakeRequest = 14 // landing impact
      ball.isUltImmune = false
      ball.ultStage = null
      ball.attackCount = 0
    }
    return
  }
}

// KING — "ROYAL DECREE": instant 8s golden mode. King is immune and moves
// freely while auto-firing tracking golden swords (3/s, 10 dmg each).
function updateKingUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage !== 'mode') return
  ball.isUltImmune = true
  ball.kingSwords = ball.kingSwords || []
  // golden aura sparks orbiting the King
  if (Math.random() < 0.8) {
    const a = Math.random() * Math.PI * 2
    particles.push({ x: ball.x + Math.cos(a) * (BALL_RADIUS + 8), y: ball.y + Math.sin(a) * (BALL_RADIUS + 8), vx: Math.cos(a + 1.4) * 1.5, vy: Math.sin(a + 1.4) * 1.5, life: 0.4, color: '#fde68a', size: 5, shape: 'spark' })
  }
  // spawn one sword every 1/3s aimed at the enemy's current position
  if (now >= (ball.nextSwordAt || 0)) {
    const a = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
    ball.kingSwords.push({ x: ball.x + Math.cos(a) * (BALL_RADIUS + 6), y: ball.y + Math.sin(a) * (BALL_RADIUS + 6), vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 1400 })
    ball.nextSwordAt = now + 333
  }
  // move swords, draw light trail, resolve hits
  ball.kingSwords = ball.kingSwords.filter(s => {
    s.x += s.vx * frameScale(); s.y += s.vy * frameScale(); s.life -= frameDt()
    particles.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.3, color: '#fbbf24', size: 5, shape: 'spark' })
    if (dist(s, enemy) < BALL_RADIUS + 8) {
      enemy.hp -= 10; ball.totalDmgDealt += 10
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 10, isCrit: false, life: 800 })
      sparkBurst(particles, s.x, s.y, '#fde68a', 8)
      return false
    }
    if (s.life <= 0 || s.x < 0 || s.x > CANVAS_W || s.y < 0 || s.y > CANVAS_H) return false
    return true
  })
  if (now >= ball.ultEndAt) {
    ball.isUltImmune = false
    ball.ultimateActive = false
    ball.ultStage = null
    ball.kingSwords = []
    ball.attackCount = 0
  }
}

// PHOENIX — "RISING SUN": vanish (frozen) → sun rains 8 fireballs → reborn
// shockwave at center (50% HP) → 8s burning aura mode with mini-rebirths + nova.
function updatePhoenixUltimate(ball, enemy, particles, damageNumbers, now) {
  const fullL = ARENA_PAD, fullR = CANVAS_W - ARENA_PAD, fullT = ARENA_PAD, fullB = CANVAS_H - ARENA_PAD
  const sunX = CANVAS_W / 2, sunY = fullT + 14
  const maxHp = ball.char.hp

  function tickLava() {
    ball.sunLava = (ball.sunLava || []).filter(l => l.until > now)
    for (const l of ball.sunLava) {
      if (Math.random() < 0.4) particles.push({ x: l.x + rnd(-l.r, l.r), y: l.y + rnd(-l.r * 0.5, l.r * 0.5), vx: rnd(-0.4, 0.4), vy: -0.8 - Math.random(), life: 0.4, color: Math.random() > 0.5 ? '#f43f5e' : '#fb923c', size: 4 + Math.random() * 4, shape: 'spark' })
      if (dist(l, enemy) < l.r && (enemy.sunLavaTickUntil || 0) <= now) {
        enemy.hp -= 10; ball.totalDmgDealt += 10
        enemy.sunLavaTickUntil = now + 1000
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 10, isCrit: false, life: 700 })
      }
    }
  }

  if (ball.ultStage === 'charge') {
    ball.invisible = true; ball.vx = 0; ball.vy = 0
    for (let i = 0; i < 3; i++) {
      const px = ball.x + rnd(-20, 20), py = ball.y + rnd(-20, 20)
      particles.push({ x: px, y: py, vx: (sunX - px) * 0.02, vy: (sunY - py) * 0.02, life: 0.6, color: Math.random() > 0.5 ? '#f43f5e' : '#fb923c', size: 5, shape: 'spark' })
    }
    particles.push({ x: sunX, y: sunY, vx: 0, vy: 0, life: 0.3, color: '#fbbf24', size: 24, shape: 'ring' })
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'sunrain'
      ball.sunDrops = 0
      ball.sunTotal = 8
      ball.nextDropAt = now
      ball.sunLava = []
    }
    return
  }

  if (ball.ultStage === 'sunrain') {
    ball.invisible = true; ball.vx = 0; ball.vy = 0
    tickLava()
    if (now >= ball.nextDropAt && ball.sunDrops < ball.sunTotal) {
      const dx = clamp((ball.sunDrops % 2 === 0) ? enemy.x + rnd(-50, 50) : fullL + Math.random() * (fullR - fullL), fullL + 30, fullR - 30)
      const dy = clamp(enemy.y + rnd(-50, 50), fullT + 30, fullB - 30)
      for (let i = 0; i < 6; i++) { const t = i / 6; particles.push({ x: sunX + (dx - sunX) * t, y: sunY + (dy - sunY) * t, vx: 0, vy: 0, life: 0.3, color: '#fb923c', size: 5, shape: 'spark' }) }
      for (let r = 0; r < 2; r++) particles.push({ x: dx, y: dy, vx: 0, vy: 0, life: 0.5 - r * 0.15, color: r ? '#fbbf24' : '#f43f5e', size: 38 + r * 18, shape: 'ring' })
      sparkBurst(particles, dx, dy, '#fb923c', 14)
      if (Math.sqrt((enemy.x - dx) ** 2 + (enemy.y - dy) ** 2) < 80) {
        enemy.hp -= 20; ball.totalDmgDealt += 20
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 20, isCrit: false, life: 900 })
      }
      ball.sunLava.push({ x: dx, y: dy, r: 40, until: now + 8000 })
      ball.sunDrops++
      ball.nextDropAt = now + 250
    }
    if (ball.sunDrops >= ball.sunTotal) {
      // REBORN at the arena center
      ball.x = CANVAS_W / 2; ball.y = CANVAS_H / 2
      ball.vx = rnd(-2, 2); ball.vy = rnd(-2, 2)
      ball.invisible = false
      ball.ultFrozen = false; ball.ultSlowMo = false; ball.isUltImmune = false
      ball.hp = Math.max(ball.hp, Math.floor(maxHp * 0.5)) // restore to 50% (trade-off)
      for (let r = 0; r < 4; r++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.7 - r * 0.12, color: r % 2 ? '#fbbf24' : '#f43f5e', size: BALL_RADIUS + r * 30, shape: 'ring' })
      sparkBurst(particles, ball.x, ball.y, '#f43f5e', 40)
      ball.shakeRequest = 22 // reborn shockwave
      if (Math.sqrt((enemy.x - ball.x) ** 2 + (enemy.y - ball.y) ** 2) < 180) {
        enemy.hp -= 60; ball.totalDmgDealt += 60
        const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
        enemy.vx += Math.cos(ka) * 14; enemy.vy += Math.sin(ka) * 14
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 60, isCrit: true, life: 1300 })
      }
      ball.ultStage = 'mode'
      ball.ultimateActive = true
      ball.ultEndAt = now + 8000
      ball.nextMiniAt = now + 3000
    }
    return
  }

  if (ball.ultStage === 'mode') {
    tickLava()
    // speed ~1.5x — gently scale velocity (physics still caps at MAX_SPEED)
    const sp = Math.sqrt(ball.vx ** 2 + ball.vy ** 2)
    if (sp > 0.5 && sp < 7.5) { ball.vx *= 1.06; ball.vy *= 1.06 }
    if (Math.random() < 0.7) { const a = Math.random() * Math.PI * 2; particles.push({ x: ball.x + Math.cos(a) * 100, y: ball.y + Math.sin(a) * 100, vx: -Math.cos(a) * 0.5, vy: -Math.sin(a) * 0.5, life: 0.4, color: '#f43f5e', size: 5, shape: 'spark' }) }
    // fire aura: 14 dmg/s within 100px
    if (dist(ball, enemy) < 100 && (enemy.phoenixAuraTickUntil || 0) <= now) {
      enemy.hp -= 14; ball.totalDmgDealt += 14
      enemy.phoenixAuraTickUntil = now + 1000
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 14, isCrit: false, life: 700 })
    }
    // mini rebirth every 3s: 30 dmg AOE
    if (now >= (ball.nextMiniAt || 0)) {
      for (let r = 0; r < 3; r++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.5 - r * 0.12, color: r % 2 ? '#fbbf24' : '#f43f5e', size: BALL_RADIUS + r * 22, shape: 'ring' })
      sparkBurst(particles, ball.x, ball.y, '#f43f5e', 20)
      if (dist(ball, enemy) < 90) {
        enemy.hp -= 30; ball.totalDmgDealt += 30
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 30, isCrit: false, life: 900 })
      }
      ball.nextMiniAt = now + 3000
    }
    // auto nova once when HP < 20%: 50 AOE + heal 40
    if (!ball.phoenixNovaUsed && ball.hp < maxHp * 0.2) {
      ball.phoenixNovaUsed = true
      for (let r = 0; r < 5; r++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.8 - r * 0.12, color: r % 2 ? '#fde68a' : '#f43f5e', size: BALL_RADIUS + r * 28, shape: 'ring' })
      sparkBurst(particles, ball.x, ball.y, '#fde68a', 36)
      if (dist(ball, enemy) < 130) {
        enemy.hp -= 50; ball.totalDmgDealt += 50
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 50, isCrit: true, life: 1200 })
      }
      ball.hp = Math.min(maxHp, ball.hp + 40)
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; particles.push({ x: ball.x + Math.cos(a) * 14, y: ball.y + Math.sin(a) * 14, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.5, color: '#4ade80', size: 6, shape: 'spark' }) }
    }
    if (now >= ball.ultEndAt) {
      ball.ultimateActive = false
      ball.ultStage = null
      ball.invisible = false
      ball.attackCount = 0
    }
    return
  }
}


// ============================================================================
//  NEW CHARACTERS: Glacier (Ice) / Venom (Poison DoT) / Seraph (Support)
// ============================================================================
function updateStatusEffects(ball, now) {
  // Shield damage reduction (Seraph): reverse part of damage taken since last frame
  if (ball.shieldUntil && ball.shieldUntil > now) {
    if (ball._dmgPrevHp != null && ball.hp < ball._dmgPrevHp) {
      const raw = ball._dmgPrevHp - ball.hp
      ball.hp = ball._dmgPrevHp - raw * (1 - (ball.shieldDR || 0.4))
    }
  } else if (ball.shieldUntil) {
    ball.shieldUntil = 0
  }
  // Poison damage over time (Venom)
  if (ball.poisonUntil && ball.poisonUntil > now) {
    if (now >= (ball.poisonNextTick || 0)) {
      ball.poisonNextTick = now + 500
      ball.hp -= (ball.poisonDmg || 3)
    }
  } else if (ball.poisonUntil) {
    ball.poisonUntil = 0
    ball.poisonStacks = 0
  }
  // Regeneration over time (Seraph)
  if (ball.regenUntil && ball.regenUntil > now) {
    if (now >= (ball.regenNextTick || 0)) {
      ball.regenNextTick = now + 500
      ball.hp = Math.min(ball.maxHp, ball.hp + (ball.regenAmount || 4))
    }
  } else if (ball.regenUntil) {
    ball.regenUntil = 0
  }
  ball._dmgPrevHp = ball.hp
}

// GLACIER - "Absolute Zero"
function updateGlacierUltimate(ball, enemy, particles, damageNumbers, now) {
  const b = arenaBounds()
  if (ball.ultStage === 'charge') {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2
      const d = BALL_RADIUS + 8 + Math.random() * 28
      particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2, life: 0.5, color: i % 2 ? '#bae6fd' : '#7dd3fc', size: 5 + Math.random() * 4, shape: 'spark' })
    }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'blizzard'
      ball.ultFrozen = true
      ball.isUltImmune = true
      ball.blizzardUntil = now + 2200
      ball.shards = []
      ball.nextShardAt = 0
      enemy.moveSlowUntil = now + 2400
      enemy.moveSlowFactor = 0.45
    }
    return
  }
  if (ball.ultStage === 'blizzard') {
    enemy.moveSlowUntil = now + 200
    enemy.moveSlowFactor = 0.45
    if (now >= (ball.nextShardAt || 0)) {
      ball.nextShardAt = now + 120
      ball.shards.push({ x: rnd(b.left, b.right), y: b.top, landAt: now + 350, vy: 6 + Math.random() * 3, hit: false })
    }
    ball.shards = (ball.shards || []).filter(s => {
      s.y += s.vy
      if (!s.hit && now >= s.landAt) {
        s.hit = true
        for (let j = 0; j < 2; j++) particles.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.5 - j * 0.1, color: j ? '#7dd3fc' : '#e0f2fe', size: 14 + j * 10, shape: 'ring' })
        if (dist(s, enemy) < BALL_RADIUS + 22) {
          enemy.hp -= 4; ball.totalDmgDealt += 4
          damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 4, isCrit: false, life: 700 })
          enemy.moveSlowUntil = now + 1500; enemy.moveSlowFactor = 0.4
        }
        return false
      }
      return s.y < b.bottom + 20
    })
    if (now >= ball.blizzardUntil) {
      enemy.isFrozen = true; enemy.freezeUntil = now + 1500
      enemy.hp -= 18; ball.totalDmgDealt += 18
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 18, isCrit: true, life: 1100 })
      for (let j = 0; j < 5; j++) particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.8 - j * 0.12, color: j % 2 ? '#7dd3fc' : '#e0f2fe', size: 22 + j * 16, shape: 'ring' })
      particles.push(...createParticles(enemy.x, enemy.y, '#bae6fd', 24))
      ball.shards = []
      ball.ultStage = 'mode'
      ball.ultFrozen = false
      ball.isUltImmune = false
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.nextFrostPulseAt = now + 1500
    }
    return
  }
  if (ball.ultStage === 'mode') {
    enemy.moveSlowUntil = now + 300
    enemy.moveSlowFactor = 0.6
    if (Math.random() < 0.4) particles.push({ x: ball.x + rnd(-14, 14), y: ball.y + rnd(-14, 14), vx: 0, vy: 0, life: 0.6, color: '#bae6fd', size: 6, shape: 'circle' })
    if (now >= (ball.nextFrostPulseAt || 0)) {
      ball.nextFrostPulseAt = now + 1500
      if (dist(ball, enemy) < 220) {
        enemy.hp -= 6; ball.totalDmgDealt += 6
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 6, isCrit: false, life: 700 })
        enemy.moveSlowUntil = now + 1200; enemy.moveSlowFactor = 0.45
      }
      for (let j = 0; j < 3; j++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.6 - j * 0.12, color: '#7dd3fc', size: 26 + j * 20, shape: 'ring' })
    }
    if (now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.attackCount = 0
    }
    return
  }
}

// VENOM - "Pandemic"
function updateVenomUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage === 'charge') {
    if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, d = BALL_RADIUS + 6 + Math.random() * 24; particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: 0, vy: -1, life: 0.5, color: '#a3e635', size: 5 + Math.random() * 4, shape: 'circle' }) }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'outbreak'
      ball.ultFrozen = false
      ball.isUltImmune = true
      ball.cloudUntil = now + 1800
      ball.cloudR = 30
      ball.poisonHitAt = 0
    }
    return
  }
  if (ball.ultStage === 'outbreak') {
    ball.cloudR = Math.min(220, (ball.cloudR || 30) + 4)
    for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * ball.cloudR; particles.push({ x: ball.x + Math.cos(a) * r, y: ball.y + Math.sin(a) * r, vx: 0, vy: -0.6, life: 0.7, color: i % 2 ? '#65a30d' : '#a3e635', size: 8 + Math.random() * 8, shape: 'circle' }) }
    if (dist(ball, enemy) < ball.cloudR + BALL_RADIUS && now >= (ball.poisonHitAt || 0)) {
      ball.poisonHitAt = now + 400
      enemy.poisonStacks = Math.min((enemy.poisonStacks || 0) + 1, 8)
      enemy.poisonUntil = now + 5000
      enemy.poisonNextTick = Math.min(enemy.poisonNextTick || 0, now)
      enemy.poisonDmg = 7 + enemy.poisonStacks * 2
    }
    if (now >= ball.cloudUntil) {
      ball.ultStage = 'mode'
      ball.isUltImmune = false
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.nextDrainAt = now + 1000
      enemy.poisonUntil = now + 9000
      enemy.poisonNextTick = Math.min(enemy.poisonNextTick || 0, now)
      enemy.poisonDmg = 12
      enemy.poisonStacks = 8
    }
    return
  }
  if (ball.ultStage === 'mode') {
    if (enemy.poisonUntil < now + 500) { enemy.poisonUntil = now + 1000 }
    enemy.poisonDmg = Math.max(enemy.poisonDmg || 0, 12)
    if (Math.random() < 0.3) particles.push({ x: ball.x + rnd(-18, 18), y: ball.y + rnd(-18, 18), vx: 0, vy: -1, life: 0.6, color: '#84cc16', size: 6, shape: 'circle' })
    if (now >= (ball.nextDrainAt || 0)) {
      ball.nextDrainAt = now + 1000
      ball.hp = Math.min(ball.maxHp, ball.hp + 6)
      if (dist(ball, enemy) < 130) {
        enemy.hp -= 6; ball.totalDmgDealt += 6
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 6, isCrit: false, life: 700 })
      }
      for (let j = 0; j < 2; j++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.6 - j * 0.1, color: '#a3e635', size: 24 + j * 18, shape: 'ring' })
    }
    if (now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.attackCount = 0
    }
    return
  }
}

// SERAPH - "Sanctuary"
function updateSeraphUltimate(ball, enemy, particles, damageNumbers, now) {
  if (ball.ultStage === 'charge') {
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2
      const d = BALL_RADIUS + 8 + Math.random() * 26
      particles.push({ x: ball.x + Math.cos(a) * d, y: ball.y + Math.sin(a) * d, vx: 0, vy: -1.2, life: 0.6, color: Math.random() < 0.5 ? '#fde68a' : '#fef3c7', size: 5 + Math.random() * 4, shape: 'spark' })
    }
    if (now >= ball.ultChargeUntil) {
      ball.ultStage = 'blessing'
      ball.ultFrozen = false
      ball.isUltImmune = true
      ball.hp = Math.min(ball.maxHp, ball.hp + 70)
      ball._dmgPrevHp = ball.hp
      ball.shieldUntil = now + 9000
      ball.shieldDR = 0.55
      ball.regenUntil = now + 8500
      ball.regenNextTick = now
      ball.regenAmount = 8
      ball.blessingUntil = now + 1200
      const ka = Math.atan2(enemy.y - ball.y, enemy.x - ball.x)
      const bb = arenaBounds()
      enemy.x = clamp(enemy.x + Math.cos(ka) * 150, bb.left, bb.right)
      enemy.y = clamp(enemy.y + Math.sin(ka) * 150, bb.top, bb.bottom)
      enemy.vx = Math.cos(ka) * 6; enemy.vy = Math.sin(ka) * 6
      enemy.hp -= 20; ball.totalDmgDealt += 20
      damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 20, isCrit: true, life: 1100 })
      for (let j = 0; j < 5; j++) particles.push({ x: ball.x, y: ball.y, vx: 0, vy: 0, life: 0.9 - j * 0.13, color: j % 2 ? '#fde68a' : '#fffbeb', size: 26 + j * 20, shape: 'ring' })
      particles.push(...createParticles(ball.x, ball.y, '#fef3c7', 26))
    }
    return
  }
  if (ball.ultStage === 'blessing') {
    if (now >= ball.blessingUntil) {
      ball.ultStage = 'mode'
      ball.isUltImmune = false
      ball.ultimateActive = true
      ball.ultimateTimer = 8000
      ball.ultEndAt = now + 8000
      ball.nextRetalAt = now + 1000
    }
    return
  }
  if (ball.ultStage === 'mode') {
    ball.regenUntil = now + 600
    ball.regenAmount = 7
    ball.shieldUntil = now + 600
    ball.shieldDR = 0.55
    if (Math.random() < 0.3) { const a = Math.random() * Math.PI * 2; particles.push({ x: ball.x + Math.cos(a) * (BALL_RADIUS + 14), y: ball.y + Math.sin(a) * (BALL_RADIUS + 14), vx: 0, vy: -1, life: 0.6, color: '#fef3c7', size: 5, shape: 'spark' }) }
    if (now >= (ball.nextRetalAt || 0)) {
      ball.nextRetalAt = now + 1000
      if (dist(ball, enemy) < 160) {
        enemy.hp -= 8; ball.totalDmgDealt += 8
        damageNumbers.push({ x: enemy.x, y: enemy.y, damage: 8, isCrit: false, life: 800 })
        for (let j = 0; j < 3; j++) particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.6 - j * 0.12, color: '#fde68a', size: 20 + j * 14, shape: 'ring' })
      }
    }
    if (now >= ball.ultEndAt) {
      ball.ultStage = null
      ball.ultimateActive = false
      ball.shieldUntil = 0
      ball.attackCount = 0
    }
    return
  }
}
