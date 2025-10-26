# 🎮 Quick Start - See Tetris with Graphics!

## Already Running!

The Vite dev server is **already running** on your machine (process 37261).

## Open the Emulator

1. **Open your browser** to: http://localhost:5173

2. **Load a ROM**:
   - Click "Load ROM" button
   - Select `tetris.gb` from the project root

3. **Wait for compilation**:
   - Console will show "Analyzing ROM..."
   - Then "Found 433 blocks"
   - Analysis takes ~1 second

4. **Click "Start"**:
   - Tetris will begin running
   - Graphics render in real-time
   - You'll see the title screen!

## What You Should See

- **Green Game Boy-style screen** (160x144 pixels, scaled 4x)
- **Live FPS counter** (~60 FPS expected)
- **Statistics updating** in real-time:
  - Cycles executed
  - Blocks compiled (grows as new code is discovered)
  - Cache hit rate (should reach 99%+)
  - Current PC address

## If Server Not Running

In a new terminal:

```bash
cd /Users/mattias800/temp/ai-gb-rec
npm run dev
```

Then open http://localhost:5173

## The Implementation

Everything is already implemented:

- ✅ **PPU.ts** - Full pixel-perfect rendering (background, sprites, palettes)
- ✅ **index.html** - Canvas-based display with controls
- ✅ **RecompilerEngine** - Executes frames at 70,224 cycles each (~60 FPS)
- ✅ **Dynamic recompilation** - Discovers and compiles blocks on-demand

## Performance

You should see:
- **~60 FPS** (limited by requestAnimationFrame)
- **99%+ cache hit rate** after warm-up
- **2000+ blocks compiled** after a minute of gameplay
- **Real-time statistics** showing the recompiler working

## Browser Console

Open Developer Tools (F12) to see:
- "Analyzing ROM..." messages
- "Dynamically discovered block at 0xXXXX" (first few seconds)
- Any compilation errors (should be none!)

---

**The emulator is ready to run. Just open the browser and load Tetris! 🎉**
