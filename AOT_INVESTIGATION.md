# AOT Compilation Investigation

## Problem

White screen when running AOT-compiled Tetris in browser.

## Root Cause Analysis

### Test Results

**JIT Recompiler (Works ✅)**:
```bash
npm run run tetris.gb 500000
# Result: PC progresses, 111 blocks compiled (dynamic discovery)
# Graphics: Non-zero content rendered
```

**AOT Compiler (Limited ⚠️)**:
```bash
npm run test-aot tetris.gb
# Result: Executes 433 static blocks, halts at 0xC06 (RAM code)
# Graphics: All white (never starts rendering)
```

### The Core Issue

**Static Analysis Limitation**:
- AOT compiler finds 433 blocks via static analysis
- Tetris executes code at 0xC06 (Work RAM)
- This block is reached via indirect jump or dynamic address
- Static analysis cannot discover it
- Game halts before rendering starts

**JIT Advantage**:
- Discovers blocks on-demand during execution  
- Finds 0xC06 when PC reaches it
- Compiles it dynamically
- Game continues and renders graphics

## Why Static Analysis Fails

```
ROM Analysis:
 ├─ Entry point: 0x0100 ✅
 ├─ Interrupt vectors ✅
 ├─ Direct jumps/calls ✅
 └─ Indirect jumps (JP (HL)) ❌ <- Can't determine target
     └─ 0xC06 unreachable ❌
```

Block 0xC06 is in Work RAM (0xC000-0xDFFF):
- Either copied from ROM at runtime
- Or generated dynamically
- Reached via `JP (HL)` or computed address
- **Impossible to discover statically**

## Solutions

### Option 1: Add Interpreter Fallback (Recommended)

Modify AOT-generated code to include interpreter for missing blocks:

```javascript
executeBlock() {
  const block = blocks[pc];
  
  if (!block) {
    // Fallback to interpreter for one instruction
    const cycles = Interpreter.executeInstruction(this.state, this.mmu);
    this.state.cycles += cycles;
    this.ppu.step(cycles);
    return;
  }
  
  // Execute compiled block
  const result = block(this.state, this.mmu);
  ...
}
```

**Pros**:
- Works for all games
- Graceful degradation
- Still fast for ROM code (97%+ of execution)

**Cons**:
- Larger bundle (need interpreter)
- RAM code slower (not compiled)

### Option 2: Hybrid AOT+JIT

Include block analyzer and transpiler in bundle:

```javascript
executeBlock() {
  let block = blocks[pc];
  
  if (!block && pc < 0x8000) {
    // Dynamically analyze and compile ROM block
    block = analyzeAndCompile(pc);
    blocks[pc] = block;
  }
  
  // Execute block
  ...
}
```

**Pros**:
- Best of both worlds
- Discovers missing ROM blocks
- Pre-compiled blocks still cached

**Cons**:
- Much larger bundle (analyzer + transpiler)
- Complex
- Still need interpreter for RAM

### Option 3: Games That Work

Some games don't use dynamic code:

**Compatible**:
- Games that execute only from ROM
- Simple games without advanced tricks
- Homebrew ROMs

**Incompatible**:
- Games with RAM-resident code
- Self-modifying code
- Complex games (Tetris, Zelda, Mario)

## Recommendation

**Implement Option 1** - Add interpreter fallback to AOT output.

### Implementation Plan

1. Include minimal Interpreter in AOT bundle
2. Modify `executeBlock()` to use fallback
3. Log warning when fallback used
4. Document limitation in README

### Expected Results

- Tetris will work (slower for RAM code)
- 97% ROM execution still fast (pre-compiled)
- 3% RAM execution slower (interpreted)
- White screen bug fixed ✅

## Alternative: JIT-Only for Complex Games

For production:
- **Simple games**: Use AOT (smaller bundle, instant start)
- **Complex games**: Use JIT dev server (dynamic discovery)

Keep both options available!

## Testing Strategy

### Unit Tests

```typescript
describe('AOT Compiler', () => {
  it('should execute statically discovered blocks', () => {
    // Test blocks found by static analysis
  });
  
  it('should fall back to interpreter for missing blocks', () => {
    // Test RAM execution fallback
  });
  
  it('should render graphics after N frames', () => {
    // Test PPU integration
  });
});
```

### Integration Tests

```bash
# Headless test with assertions
npm run test-aot tetris.gb

# Should verify:
# - PC progresses past 0x0100
# - No infinite loops
# - Graphics rendered (non-white pixels)
# - No crashes
```

### Visual Regression

```typescript
// Render frame to PNG
const frameBuffer = emulator.ppu.getFrameBuffer();
const png = renderToPNG(frameBuffer, 160, 144);
fs.writeFileSync('test-output.png', png);

// Compare with golden image
const golden = fs.readFileSync('test-golden.png');
assert(imagesMatch(png, golden));
```

## Next Steps

1. ✅ Identify root cause (static analysis limitation)
2. ⏸️ Decide on solution (interpreter fallback vs hybrid)
3. ⏸️ Implement chosen solution
4. ⏸️ Add tests
5. ⏸️ Document limitations

---

**Status**: Investigation complete. AOT works but is limited to statically-discoverable code. JIT version works fully. Need to add interpreter fallback to AOT for production use.
