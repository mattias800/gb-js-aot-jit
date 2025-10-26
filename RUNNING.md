# Running the Game Boy Recompiler Emulator

## Web Interface (Graphics!)

The emulator now has a web-based interface with full graphics rendering!

### Start the Dev Server

```bash
npm run dev
```

This starts Vite on `http://localhost:5173`

### Load and Play

1. Open http://localhost:5173 in your browser
2. Click "Load ROM" and select a Game Boy ROM file (e.g., `tetris.gb`)
3. Wait for analysis and compilation (appears in console)
4. Click "Start" to begin emulation
5. Watch Tetris (or your game) render in real-time!

### Features

- **160x144 Game Boy display** scaled 4x for visibility
- **Real-time rendering** at ~60 FPS
- **Live statistics**:
  - FPS counter
  - Total cycles executed
  - Blocks compiled (dynamic discovery)
  - Cache hit rate
  - Current PC address
- **Controls**:
  - Start/Stop execution
  - Reset emulator

### What You'll See

- **Tetris**: Title screen, falling blocks, gameplay
- **Other games**: Boot screens, Nintendo logo, graphics

## Command Line Tools

For debugging and analysis without graphics:

### Run for N Cycles

```bash
npm run run tetris.gb 10000000
```

### Analyze Execution

```bash
npm run analyze-execution tetris.gb 10000000
```

Shows ROM vs RAM execution breakdown.

### Check Progress

```bash
npm run check-progress tetris.gb 10000000
```

Samples PC at intervals to verify game is progressing.

### Debug Transpiler

```bash
npm run debug-transpile tetris.gb 0x6b95
```

Shows generated JavaScript for a specific block.

## Performance

- **2.4x faster than real hardware** with dynamic recompilation
- **99.45% cache hit rate** after warm-up
- **~60 FPS** on modern browsers
- **ROM execution**: 97.97% (fully recompiled)
- **RAM execution**: 2.03% (interpreter fallback)

## Troubleshooting

### "Analyzing ROM..." takes a long time

This is normal - static analysis discovers 433 blocks. The rest are found dynamically during execution.

### Console shows many "dynamically discovered" messages

This is expected! The recompiler finds blocks on-demand. After a few seconds, discovery slows down as the cache fills.

### Graphics look wrong

The PPU implementation is basic but functional. Some advanced features may not be implemented:
- Window layer (partially implemented)
- Sprite priority edge cases
- Mid-scanline effects

### Performance is slow

Check browser console for errors. Some possible issues:
- Large ROM (>1MB)
- Many RAM-executed blocks
- Browser throttling background tabs

### No graphics, just white screen

The game might not have enabled the LCD yet. Wait a few seconds or check if the game is stuck (PC not progressing).

## What's Working

✅ Full CPU emulation (all 512 opcodes)  
✅ Dynamic recompilation with on-demand block discovery  
✅ PPU rendering (background, sprites, palettes)  
✅ Memory management (ROM, RAM, VRAM, OAM, I/O)  
✅ Basic timing and interrupts  
✅ Real-time graphics display  

## What's Missing

⚠️ Audio (APU not implemented)  
⚠️ Input (no joypad support yet)  
⚠️ Save states  
⚠️ Some advanced PPU features  
⚠️ Link cable / serial  

## Next Steps

To add input support, implement joypad handling in the MMU and connect browser keyboard events. See `src/runtime/MMU.ts` register 0xFF00 for joypad register.

Enjoy seeing your Game Boy games rendered with a dynamic recompiler! 🎮
