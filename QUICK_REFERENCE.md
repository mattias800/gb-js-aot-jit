# Quick Reference

## AOT Compilation Workflow

### 1. Build a Game
```bash
npm run build-game tetris.gb ./dist/tetris
```

Output:
- `dist/tetris/game.js` (350 KB) - Compiled game
- `dist/tetris/index.html` - Interface
- `dist/tetris/README.md` - Instructions

### 2. Serve Built Games
```bash
npm run serve-dist
```

Opens http://localhost:8000 serving all games in `dist/`

### 3. Test a Specific Game
Navigate to: http://localhost:8000/tetris

Click **Start** to play!

## Development Workflow

### Run with JIT (Dynamic Recompiler)
```bash
npm run dev
```

Opens http://localhost:5173
- Load ROM dynamically in browser
- Blocks compiled on-demand
- Best for testing/debugging

## Common Commands

### Build & Test
```bash
# Build Tetris
npm run build-game tetris.gb ./dist/tetris

# Serve it
npm run serve-dist

# Open http://localhost:8000/tetris
```

### Build Multiple Games
```bash
npm run build-game game1.gb ./dist/game1
npm run build-game game2.gb ./dist/game2
npm run serve-dist
# Now access at /game1 and /game2
```

### Analysis Tools
```bash
# Check ROM/RAM execution
npm run analyze-execution tetris.gb 10000000

# Debug transpiler
npm run debug-transpile tetris.gb 0x0100

# Check game progress
npm run check-progress tetris.gb 5000000
```

## File Organization

```
project/
├── tetris.gb          # ROM file (gitignored)
├── dist/              # Build output (gitignored)
│   ├── tetris/
│   │   ├── game.js
│   │   ├── index.html
│   │   └── README.md
│   └── mario/
│       ├── game.js
│       ├── index.html
│       └── README.md
└── src/               # Emulator source
```

## Deployment

### Quick Deploy to GitHub Pages
```bash
cd dist/tetris
git init
git add .
git commit -m "Deploy Tetris"
git remote add origin https://github.com/user/tetris.git
git push -u origin main
```

Enable GitHub Pages in repo settings → Pages → Deploy from `main` branch.

### Deploy to Netlify
1. Run `npm run build-game tetris.gb ./dist/tetris`
2. Drag `dist/tetris` folder to Netlify
3. Done!

## Package Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (JIT mode) |
| `npm run build-game <rom> <out>` | AOT compile ROM |
| `npm run serve-dist` | Serve built games |
| `npm test` | Run test suite |
| `npm run typecheck` | TypeScript validation |
| `npm run analyze-execution <rom> <cycles>` | Analyze performance |
| `npm run debug-transpile <rom> <addr>` | Debug transpiler |

## Tips

### Don't Commit ROMs
The `.gitignore` excludes `*.gb` files - ROMs are copyrighted!

### Serve Uses Port 8000
If port 8000 is busy:
```bash
npx serve dist -l 3000  # Use different port
```

### Build Output Size
- ROM: 32 KB
- Compiled: ~350 KB (10x larger)
- Includes runtime + all blocks + ROM data

### Static Analysis Limitations
AOT can't discover:
- Indirect jumps (`JP (HL)`)
- Self-modifying code
- Dynamic addresses

Use JIT mode (`npm run dev`) for games with dynamic code.

## Troubleshooting

### "Command not found: serve"
```bash
npm install --save-dev serve
```

### Port already in use
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port
npx serve dist -l 9000
```

### Build fails
Check that ROM path is correct:
```bash
ls -lh tetris.gb
npm run build-game tetris.gb ./dist/tetris
```

### Game doesn't run
Open browser console (F12) for errors. Common issues:
- CORS (use `serve`, not `file://`)
- Missing blocks (use JIT mode for debugging)

---

**Need help?** See full docs in `AOT_COMPILATION.md`
