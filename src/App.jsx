import { useState, useCallback } from 'react'
import SelectScreen from './SelectScreen.jsx'
import BattleScreen from './BattleScreen.jsx'
import ResultScreen from './ResultScreen.jsx'
import { CHARACTERS } from './characters.js'

const TEAM_A_COLOR = '#3b82f6'
const TEAM_B_COLOR = '#ef4444'
const MONO = "'Courier New', monospace"

const styles = {
  root: { minHeight: '100vh', background: '#030712' },
  wrap: {
    minHeight: '100vh',
    background: '#030712',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: MONO,
    color: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  modeLabel: {
    fontSize: 22,
    fontWeight: 900,
    color: '#f59e0b',
    letterSpacing: '0.2em',
    textShadow: '0 0 20px #f59e0b',
    textAlign: 'center',
  },
  arenaLabel: { fontSize: 11, color: '#38bdf8', letterSpacing: '0.2em', marginTop: 2 },
  footer: { marginTop: 12, color: '#475569', fontSize: 11, letterSpacing: '0.25em' },
}

export default function App() {
  const [screen, setScreen] = useState('select')
  const [teamA, setTeamA] = useState(['thomas'])
  const [teamB, setTeamB] = useState(['anchor'])
  const [mode, setMode] = useState('1v1')
  const [arenaShape, setArenaShape] = useState('rect')
  const [result, setResult] = useState(null)
  const [battleKey, setBattleKey] = useState(0)
  const [replayData, setReplayData] = useState(null)

  const handleStart = useCallback((a, b, m, shape) => {
    setTeamA(a)
    setTeamB(b)
    setMode(m)
    setArenaShape(shape || 'rect')
    setReplayData(null)
    setBattleKey((k) => k + 1)
    setScreen('battle')
  }, [])

  const handleResult = useCallback((res) => {
    setResult(res)
    setScreen('result')
  }, [])

  const handleRecordingReady = useCallback((data) => {
    setReplayData(data)
    console.log('Replay ready:', data.duration + 's')
  }, [])

  const handleRematch = useCallback(() => {
    setReplayData(null)
    setBattleKey((k) => k + 1)
    setScreen('battle')
  }, [])

  const handleBack = useCallback(() => {
    setScreen('select')
  }, [])

  return (
    <div style={styles.root}>
      {screen === 'select' && (
        <SelectScreen
          onStart={handleStart}
          initialMode={mode}
          initialTeamA={teamA}
          initialTeamB={teamB}
          initialArenaShape={arenaShape}
        />
      )}
      {screen === 'battle' && (
        <BattleWrapper
          key={battleKey}
          teamA={teamA}
          teamB={teamB}
          mode={mode}
          arenaShape={arenaShape}
          onResult={handleResult}
          onRecordingReady={handleRecordingReady}
        />
      )}
      {screen === 'result' && result && (
        <ResultScreen
          result={result}
          onRematch={handleRematch}
          onSelect={handleBack}
          replayData={replayData}
        />
      )}
    </div>
  )
}

function TeamRoster({ team, color, align }) {
  const wrap = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: align === 'right' ? 'flex-end' : 'flex-start',
    gap: 4,
  }
  return (
    <div style={wrap}>
      {team.map((k, i) => (
        <span
          key={i}
          style={{
            color,
            fontWeight: 700,
            fontSize: 14,
            fontFamily: MONO,
            textShadow: `0 0 10px ${color}`,
          }}
        >
          {CHARACTERS[k].emoji} {CHARACTERS[k].name}
        </span>
      ))}
    </div>
  )
}

function BattleWrapper({ teamA, teamB, mode, arenaShape, onResult, onRecordingReady }) {
  const arenaText = arenaShape === 'circle' ? '\u2B55 CIRCLE ARENA' : '\uD83D\uDFE6 RECTANGLE ARENA'
  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <TeamRoster team={teamA} color={TEAM_A_COLOR} align="left" />
        <div>
          <div style={styles.modeLabel}>{mode.toUpperCase()}</div>
          <div style={styles.arenaLabel}>{arenaText}</div>
        </div>
        <TeamRoster team={teamB} color={TEAM_B_COLOR} align="right" />
      </div>

      <BattleScreen
        teamA={teamA}
        teamB={teamB}
        mode={mode}
        arenaShape={arenaShape}
        onResult={onResult}
        onRecordingReady={onRecordingReady}
      />

      <div style={styles.footer}>TEAM BATTLE • LAST TEAM STANDING</div>
    </div>
  )
}
