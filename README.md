# ⚔️ Ball Battle

Bot vs Bot auto-battle arena game. Pick two fighters, watch them fight!

## 🎮 Characters

| Fighter | Ability | Style |
|---------|---------|-------|
| 🚂 Thomas | Train Charge — ranged blast | Balanced |
| ⚓ Anchor | Chain Swing — devastating close range | Tank |
| 🔥 Blaze | Fire Burst — explosive AoE | Glass cannon |
| ⚡ Volt | Thunder Zap — teleport + stun | Assassin |
| 👻 Phantom | Phase Shift — invincible dash | Evasive |
| 🪨 Titan | Ground Slam — massive knockback | Bruiser |

## 🚀 Running locally

```bash
npm install
npm run dev
```

## 📦 Deploy to Vercel

### Option 1 — Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option 2 — GitHub + Vercel Dashboard
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Framework: **Vite** (auto-detected)
5. Click **Deploy** ✅

No environment variables needed. Pure frontend.

## 🏗️ Project structure

```
ball-battle/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx          # Entry point
    ├── App.jsx           # Screen router
    ├── characters.js     # All character stats & abilities
    ├── engine.js         # Physics, AI, ability logic
    ├── renderer.js       # Canvas drawing
    ├── SelectScreen.jsx  # Character picker UI
    ├── BattleScreen.jsx  # Game loop + canvas
    └── ResultScreen.jsx  # Winner display
```
