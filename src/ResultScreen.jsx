import { useEffect, useState } from 'react'
import { CHARACTERS } from './characters.js'

const TEAM_A_COLOR = '#3b82f6'
const TEAM_B_COLOR = '#ef4444'
const MONO = "'Courier New', monospace"

const styles = {
  root: {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    background: 'radial-gradient(circle at 50% 0%, #0b1224 0%, #030712 70%)',
    color: '#e2e8f0',
    fontFamily: MONO,
    padding: '32px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTag: { color: '#64748b', fontSize: 13, letterSpacing: '0.3em', marginBottom: 8 },
  teamsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 640,
    zIndex: 2,
  },
  vs: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 22,
    fontWeight: 900,
    color: '#f59e0b',
    textShadow: '0 0 16px #f59e0b',
  },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8 },
  memberEmoji: { fontSize: 22 },
  memberName: { flex: 1, textAlign: 'left', fontWeight: 700 },
  btnRow: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 28, zIndex: 2 },
}

const baseBtn = {
  padding: '14px 28px',
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: '0.08em',
  fontFamily: MONO,
  borderRadius: 12,
  cursor: 'pointer',
  border: 'none',
}

export default function ResultScreen({ result, onRematch, onSelect, replayData }) {
  const { winner, balls = [], teamA = [], teamB = [], mode = '1v1' } = result || {}
  const [confetti, setConfetti] = useState([])

  const isDraw = winner === 'draw'
  const winColor = isDraw ? '#94a3b8' : winner === 'A' ? TEAM_A_COLOR : TEAM_B_COLOR
  const title = isDraw ? 'DRAW!' : winner === 'A' ? 'BLUE TEAM WINS!' : 'RED TEAM WINS!'

  useEffect(() => {
    if (isDraw) return
    const pieces = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 1.6 + Math.random() * 1.6,
      color: Math.random() > 0.5 ? winColor : '#fbbf24',
      size: 6 + Math.random() * 8,
    }))
    setConfetti(pieces)
  }, [isDraw, winColor])

  const teamBalls = (teamKey) => balls.filter((b) => b && b.team === teamKey)

  const handleDownloadReplay = () => {
    if (!replayData || !replayData.blob) {
      alert('Replay tidak tersedia untuk match ini.')
      return
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = 'ball-battle-' + mode + '-' + timestamp + '.webm'
    const url = URL.createObjectURL(replayData.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const titleStyle = {
    fontSize: 46,
    fontWeight: 900,
    margin: '0 0 18px',
    letterSpacing: '0.08em',
    color: winColor,
    textShadow: '0 0 40px ' + winColor,
    zIndex: 2,
  }

  const renderTeam = (teamKey, roster, color) => {
    const bs = teamBalls(teamKey)
    const won = winner === teamKey
    const panelStyle = {
      flex: 1,
      minWidth: 200,
      background: 'rgba(15,23,42,0.7)',
      border: '2px solid ' + color,
      borderRadius: 14,
      padding: 14,
      boxShadow: won ? '0 0 30px ' + color : 'none',
      opacity: won || isDraw ? 1 : 0.6,
    }
    const tStyle = {
      fontSize: 16,
      fontWeight: 900,
      marginBottom: 10,
      letterSpacing: '0.1em',
      color,
      textShadow: '0 0 10px ' + color,
    }
    const crown = teamKey === 'A' ? '🔵 BLUE TEAM' : '🔴 RED TEAM'
    return (
      <div style={panelStyle}>
        <div style={tStyle}>
          {crown}
          {won ? ' 👑' : ''}
        </div>
        <div style={styles.memberList}>
          {roster.map((key, i) => {
            const ch = CHARACTERS[key]
            const ball = bs[i]
            const alive = ball && ball.hp > 0
            const rowStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(2,6,23,0.6)',
              opacity: alive ? 1 : 0.5,
            }
            const statusStyle = {
              fontSize: 13,
              fontWeight: 700,
              color: alive ? '#34d399' : '#f87171',
            }
            const status = alive
              ? '❤️ ' + Math.max(0, Math.round(ball.hp))
              : '💀 KO'
            return (
              <div key={i} style={rowStyle}>
                <span style={styles.memberEmoji}>{ch.emoji}</span>
                <span style={styles.memberName}>{ch.name}</span>
                <span style={statusStyle}>{status}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const rematchBtn = { ...baseBtn, color: '#0b1224', background: 'linear-gradient(90deg, #38bdf8, #a78bfa)', boxShadow: '0 0 24px rgba(56,189,248,0.6)' }
  const selectBtn = { ...baseBtn, color: '#e2e8f0', background: 'rgba(15,23,42,0.9)', border: '2px solid rgba(148,163,184,0.4)' }
  const replayBtn = { ...baseBtn, color: '#fff', background: 'linear-gradient(90deg, #f59e0b, #ef4444)', boxShadow: '0 0 24px rgba(245,158,11,0.5)' }

  return (
    <div style={styles.root}>
      {confetti.map((c) => {
        const pieceStyle = {
          position: 'absolute',
          top: -20,
          left: c.left + '%',
          width: c.size,
          height: c.size,
          background: c.color,
          borderRadius: 2,
          animation: 'bbfall ' + c.dur + 's linear ' + c.delay + 's infinite',
          zIndex: 1,
        }
        return <div key={c.id} style={pieceStyle} />
      })}
      <style>{'@keyframes bbfall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1 } 100% { transform: translateY(105vh) rotate(540deg); opacity: 0.2 } }'}</style>

      <div style={styles.modeTag}>{mode.toUpperCase()} CIRCULAR ARENA</div>
      <h1 style={titleStyle}>{title}</h1>

      <div style={styles.teamsRow}>
        {renderTeam('A', teamA, TEAM_A_COLOR)}
        <div style={styles.vs}>VS</div>
        {renderTeam('B', teamB, TEAM_B_COLOR)}
      </div>

      <div style={styles.btnRow}>
        <button onClick={onRematch} style={rematchBtn}>🔄 REMATCH</button>
        <button onClick={onSelect} style={selectBtn}>⚙️ NEW BATTLE</button>
        {replayData && replayData.blob && (
          <button onClick={handleDownloadReplay} style={replayBtn}>
            {'🎥 DOWNLOAD REPLAY' + (replayData.duration ? ' (' + replayData.duration + 's)' : '')}
          </button>
        )}
      </div>
    </div>
  )
}
