# Ahead-of-Time (AOT) Compilation

## Overview

The Game Boy recompiler can **statically compile** entire ROMs to standalone JavaScript bundles that run in any browser without the emulator framework.

Think of it like `vite build` for React apps - except the output is a **compiled Game Boy game** instead of a web app!

## Quick Start

### Build a Game

```bash
npm run build-game tetris.gb ./dist/tetris
```

This generates:
- `dist/tetris/game.js` - Compiled game (ROM + runtime)
- `dist/tetris/index.html` - Simple interface  
- `dist/tetris/README.md` - Instructions

### Run the Game

```bash
npm run serve-dist
```

Open http://localhost:8000/tetris and click **Start** to play!

## What Gets Compiled?

### Input
- **Game Boy ROM file** (`.gb`) - typically 32KB to 1MB

### Output
A single `.js` file containing:

1. **ROM Data** - Embedded as Uint8Array
2. **Compiled Blocks** - All discoverable ROM code transpiled to JavaScript functions
3. **Runtime** - Minimal CPU, MMU, PPU implementation
4. **Emulator Class** - Ready-to-use game instance

### Example Output

For Tetris (32KB ROM):
- **Input**: `tetris.gb` (32,768 bytes)
- **Output**: `game.js` (350 KB) 
- **Blocks compiled**: 433

## How It Works

### 1. Static Analysis
```
ROM → Discover Entry Points → Follow Control Flow → 
Build Basic Blocks → Analyze Dependencies
```

Finds all reachable code blocks from:
- Entry point (0x0100)
- Interrupt vectors (0x0000, 0x0008, 0x0010, ...)
- Jump/call targets

### 2. Transpilation
```
Each Block → Decode Instructions → Generate JavaScript → 
Optimize (flags, registers, constants)
```

Example block at 0x0100:
```asm
; Game Boy Assembly
0x0100: LD SP, 0xFFFE
0x0103: XOR A
0x0104: LD HL, 0x9FFF
```

Becomes JavaScript:
```javascript
blocks[0x100] = function(state, mmu) {
  let cycles = 0;
  
  // LD SP, 0xFFFE
  state.SP = 0xFFFE;
  cycles += 12;
  
  // XOR A
  state.A = xor8(state, state.A, state.A);
  cycles += 4;
  
  // LD HL, 0xFFFF
  state.H = 0x9F;
  state.L = 0xFF;
  cycles += 12;
  
  return { nextBlock: 0x107, cycles };
};
```

### 3. Bundling
```
Compiled Blocks + ROM Data + Runtime → 
Wrap in IIFE → Generate HTML Interface → Package
```

The output is a **self-contained** bundle with:
- No external dependencies
- No build step needed to run
- Fully static (can be hosted anywhere)

## Comparison

### JIT vs AOT

| Feature | JIT (Runtime) | AOT (Build-time) |
|---------|---------------|------------------|
| Compilation | On-demand during execution | All at once before deployment |
| First Run | Slower (compiling) | Fast (pre-compiled) |
| Discovery | Dynamic (finds all code) | Static (misses some code) |
| Bundle Size | Small (ROM only) | Large (ROM + compiled code) |
| Startup Time | Fast (load ROM) | Instant (ready to run) |
| Use Case | Development, flexibility | Production, deployment |

### Like Vite Build

```
┌─────────────────────────────┐
│ React App (Source)          │
│  - JSX components           │
│  - TypeScript               │
│  - Assets                   │
└──────────┬──────────────────┘
           │ vite build
           ▼
┌─────────────────────────────┐
│ Static Bundle               │
│  - Compiled JS              │
│  - Optimized                │
│  - Ready to deploy          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Game Boy ROM                │
│  - Binary code              │
│  - Graphics data            │
│  - 32KB+                    │
└──────────┬──────────────────┘
           │ npm run build-game
           ▼
┌─────────────────────────────┐
│ Static Game Bundle          │
│  - Compiled JS functions    │
│  - Embedded ROM             │
│  - Runtime included         │
│  - Ready to deploy          │
└─────────────────────────────┘
```

## Deployment

The generated bundle can be deployed **anywhere** that serves static files:

### GitHub Pages
```bash
cd dist/tetris
git init
git add .
git commit -m "AOT compiled Tetris"
git push origin gh-pages
```

### Netlify
Just drag and drop the `dist/tetris` folder into Netlify's web interface.

### Vercel
```bash
cd dist/tetris
vercel deploy
```

### Amazon S3
```bash
aws s3 sync dist/tetris s3://my-bucket/tetris --acl public-read
```

### Any HTTP Server
```bash
# Using npm script (recommended)
npm run serve-dist

# Or manually with serve
npx serve dist -l 8000

# Or Python
python3 -m http.server 8000 -d dist

# Or PHP
php -S localhost:8000 -t dist
```

## Limitations

### Static Analysis Gaps

AOT compilation uses **static analysis** which can't discover:
- Code reached through indirect jumps (`JP (HL)`)
- Dynamically constructed addresses
- Self-modifying code

**Solution**: The JIT recompiler (runtime) can discover these dynamically.

### Bundle Size

Compiled output is larger than the ROM:
- **ROM**: 32 KB
- **Compiled**: 350 KB (for Tetris)

This includes:
- All compiled blocks
- Full runtime (CPU, MMU, PPU)
- Helper functions

### Performance

AOT bundles are slightly **slower** than JIT:
- No hot-path optimizations
- No inline caching
- More generic code

But still fast enough for Game Boy (runs at 60 FPS).

## Advanced Options

### Custom Output

```bash
# Specify output directory
npm run build-game rom.gb ./my-custom-output

# Build multiple games
npm run build-game tetris.gb ./dist/tetris
npm run build-game mario.gb ./dist/mario
npm run build-game zelda.gb ./dist/zelda
```

### Integration

```javascript
// Use in your own HTML
<script src="game.js"></script>
<script>
  const emulator = new GameBoyEmulator.Emulator();
  emulator.start();
  
  // Access internals
  console.log('ROM Title:', GameBoyEmulator.romTitle);
  console.log('Blocks:', GameBoyEmulator.blocksCompiled);
  console.log('PC:', emulator.state.PC.toString(16));
</script>
```

## Build Pipeline

You can integrate this into automated builds:

```bash
#!/bin/bash
# build-all-games.sh

for rom in roms/*.gb; do
  name=$(basename "$rom" .gb)
  npm run build-game "$rom" "./dist/$name"
  echo "Built $name"
done
```

Then host all games on one site:
```
dist/
  tetris/
    index.html
    game.js
  mario/
    index.html
    game.js
  zelda/
    index.html
    game.js
```

## Summary

### Use AOT When:
- ✅ Deploying to production
- ✅ Need instant startup
- ✅ Want static hosting
- ✅ ROM is stable (not debugging)
- ✅ All code is statically reachable

### Use JIT When:
- ✅ Developing/debugging
- ✅ Need code discovery
- ✅ Want smaller bundles
- ✅ ROM has dynamic code
- ✅ Testing different ROMs

---

**The recompiler now works both ways**: Runtime (like webpack-dev-server) and Build-time (like vite build)! 🎉
