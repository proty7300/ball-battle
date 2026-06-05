import { useState } from 'react'
import { CHARACTERS, CHAR_KEYS } from './characters.js'

const MODES = {
  '1v1': [1, 1],
  '2v2': [2, 2],
  '3v3': [3, 3],
  '2v1': [2, 1],
  '3v2': [3, 2],
  '3v1': [3, 1],
}
const MODE_LABELS = {
  '1v1': '1v1 Classic',
  '2v2': '2v2',
  '3v3': '3v3',
  '2v1': '2v1 Underdog',
  '3v2': '3v2',
  '3v1': '3v1 Chaos',
}
const ARENA_SHAPES = [
  { id: 'rect', label: '\uD83D\uDFE6 Rectangle', sub: 'Classic 960x540' },
  { id: 'circle', label: '\u2B55 Circle', sub: 'New 800px' },
]
const TEAM_A_COLOR = '#3b82f6'
const TEAM_B_COLOR = '#ef4444'
const MONO = "'Courier New', monospace"

const styles = {
  root: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 50% 0%, #0b1224 0%, #030712 70%)',
    color: '#e2e8f0',
    fontFamily: MONO,
    padding: '24px 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: 900,
    margin: 0,
    letterSpacing: '0.06em',
    color: '#38bdf8',
    textShadow: '0 0 30px rgba(56,189,248,0.7)',
  },
  subtitle: { margin: '6px 0 18px', color: '#64748b', fontSize: 13, letterSpacing: '0.3em' },
  sectionLabel: {
    alignSelf: 'center',
    color: '#94a3b8',
    fontSize: 12,
    letterSpacing: '0.25em',
    margin: '6px 0 8px',
  },
  arenaRow: { display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' },
  modeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 22,
    maxWidth: 680,
  },
  teamsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 680,
  },
  vs: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 24,
    fontWeight: 900,
    color: '#f59e0b',
    textShadow: '0 0 16px #f59e0b',
  },
  slotList: { display: 'flex', flexDirection: 'column', gap: 8 },
  slotEmoji: { fontSize: 22 },
  pickTag: { marginLeft: 'auto', fontSize: 11, opacity: 0.85 },
  hint: { margin: '24px 0 10px', color: '#94a3b8', fontSize: 13, letterSpacing: '0.1em' },
  hintActive: { color: '#fbbf24', fontWeight: 900 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
    gap: 8,
    width: '100%',
    maxWidth: 680,
  },
  gridEmoji: { fontSize: 24 },
  fight: {
    marginTop: 28,
    padding: '16px 56px',
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: '0.15em',
    fontFamily: MONO,
    color: '#0b1224',
    background: 'linear-gradient(90deg, #38bdf8, #a78bfa)',
    border: 'none',
    borderRadius: 14,
    cursor: 'pointer',
    boxShadow: '0 0 32px rgba(56,189,248,0.6)',
  },
}

function fillTeam(arr, n) {
  const out = arr.slice(0, n)
  let i = 0
  while (out.length < n) {
    out.push(CHAR_KEYS[i % CHAR_KEYS.length])
    i++
  }
  return out
}

export default function SelectScreen({
  onStart,
  initialMode = '1v1',
  initialTeamA = ['thomas'],
  initialTeamB = ['anchor'],
  initialArenaShape = 'rect',
}) {
  const [mode, setMode] = useState(initialMode)
  const [arenaShape, setArenaShape] = useState(initialArenaShape)
  const [teamA, setTeamA] = useState(() => fillTeam(initialTeamA, MODES[initialMode][0]))
  const [teamB, setTeamB] = useState(() => fillTeam(initialTeamB, MODES[initialMode][1]))
  const [active, setActive] = useState({ team: 'A', idx: 0 })

  const [sizeA, sizeB] = MODES[mode]

  const changeMode = (m) => {
    const [na, nb] = MODES[m]
    setMode(m)
    setTeamA((t) => fillTeam(t, na))
    setTeamB((t) => fillTeam(t, nb))
    setActive({ team: 'A', idx: 0 })
  }

  const pick = (key) => {
    if (active.team === 'A') {
      setTeamA((t) => {
        const c = t.slice()
        c[active.idx] = key
        return c
      })
      const next = active.idx + 1
      if (next < sizeA) setActive({ team: 'A', idx: next })
      else setActive({ team: 'B', idx: 0 })
    } else {
      setTeamB((t) => {
        const c = t.slice()
        c[active.idx] = key
        return c
      })
      const next = active.idx + 1
      if (next < sizeB) setActive({ team: 'B', idx: next })
      else setActive({ team: 'A', idx: 0 })
    }
  }

  const renderTeamPanel = (team, size, list, color) => {
    const panelStyle = {
      flex: 1,
      minWidth: 220,
      background: 'rgba(15,23,42,0.7)',
      border: '2px solid ' + color,
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 0 24px ' + color + '55',
    }
    const titleStyle = {
      fontSize: 16,
      fontWeight: 900,
      marginBottom: 10,
      letterSpacing: '0.1em',
      color,
      textShadow: '0 0 10px ' + color,
    }
    return (
      <div style={panelStyle}>
        <div style={titleStyle}>{team === 'A' ? '\uD83D\uDD35 BLUE TEAM' : '\uD83D\uDD34 RED TEAM'}</div>
        <div style={styles.slotList}>
          {Array.from({ length: size }).map((_, idx) => {
            const key = list[idx]
            const ch = CHARACTERS[key]
            const isActive = active.team === team && active.idx === idx
            const btnStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              cursor: 'pointer',
              background: isActive ? color + '33' : 'rgba(2,6,23,0.6)',
              border: isActive ? '2px solid ' + color : '2px solid rgba(148,163,184,0.2)',
              color: '#e2e8f0',
              fontFamily: MONO,
              fontSize: 15,
              fontWeight: 700,
              textAlign: 'left',
              boxShadow: isActive ? '0 0 16px ' + color : 'none',
            }
            return (
              <button key={idx} onClick={() => setActive({ team, idx })} style={btnStyle}>
                <span style={styles.slotEmoji}>{ch.emoji}</span>
                <span>{ch.name}</span>
                {isActive && <span style={styles.pickTag}>◀ PICK</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>⚽ BALL BATTLE</h1>
      <p style={styles.subtitle}>TEAM MODES • CHOOSE YOUR ARENA</p>

      <div style={styles.sectionLabel}>ARENA SHAPE</div>
      <div style={styles.arenaRow}>
        {ARENA_SHAPES.map((a) => {
          const sel = a.id === arenaShape
          const aStyle = {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '12px 22px',
            borderRadius: 12,
            cursor: 'pointer',
            fontFamily: MONO,
            fontWeight: 900,
            fontSize: 16,
            color: sel ? '#0b1224' : '#cbd5e1',
            background: sel ? 'linear-gradient(90deg, #38bdf8, #a78bfa)' : 'rgba(15,23,42,0.8)',
            border: sel ? '2px solid #38bdf8' : '2px solid rgba(148,163,184,0.25)',
            boxShadow: sel ? '0 0 22px rgba(56,189,248,0.6)' : 'none',
          }
          const subStyle = { fontSize: 10, fontWeight: 700, opacity: 0.8, letterSpacing: '0.05em' }
          return (
            <button key={a.id} onClick={() => setArenaShape(a.id)} style={aStyle}>
              <span>{a.label}</span>
              <span style={subStyle}>{a.sub}</span>
            </button>
          )
        })}
      </div>

      <div style={styles.sectionLabel}>BATTLE MODE</div>
      <div style={styles.modeRow}>
        {Object.keys(MODES).map((m) => {
          const isSel = m === mode
          const mStyle = {
            padding: '10px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: MONO,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: '0.05em',
            color: isSel ? '#0b1224' : '#cbd5e1',
            background: isSel ? 'linear-gradient(90deg, #38bdf8, #a78bfa)' : 'rgba(15,23,42,0.8)',
            border: isSel ? '2px solid #38bdf8' : '2px solid rgba(148,163,184,0.25)',
            boxShadow: isSel ? '0 0 20px rgba(56,189,248,0.6)' : 'none',
          }
          return (
            <button key={m} onClick={() => changeMode(m)} style={mStyle}>
              {MODE_LABELS[m]}
            </button>
          )
        })}
      </div>

      <div style={styles.teamsRow}>
        {renderTeamPanel('A', sizeA, teamA, TEAM_A_COLOR)}
        <div style={styles.vs}>VS</div>
        {renderTeamPanel('B', sizeB, teamB, TEAM_B_COLOR)}
      </div>

      <div style={styles.hint}>
        TAP A CHARACTER →{' '}
        <span style={styles.hintActive}>
          {active.team === 'A' ? 'BLUE' : 'RED'} SLOT {active.idx + 1}
        </span>
      </div>

      <div style={styles.grid}>
        {CHAR_KEYS.map((key) => {
          const ch = CHARACTERS[key]
          const cStyle = {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '10px 6px',
            borderRadius: 10,
            cursor: 'pointer',
            background: 'rgba(15,23,42,0.8)',
            border: '2px solid ' + ch.color + '55',
            color: '#e2e8f0',
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
          }
          return (
            <button key={key} onClick={() => pick(key)} style={cStyle}>
              <span style={styles.gridEmoji}>{ch.emoji}</span>
              <span>{ch.name}</span>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => onStart(teamA.slice(0, sizeA), teamB.slice(0, sizeB), mode, arenaShape)}
        style={styles.fight}
      >
        🔥 FIGHT!
      </button>
    </div>
  )
}
