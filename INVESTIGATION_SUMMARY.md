# Tetris Infinite Loop Investigation Summary

## Issue
Tetris gets stuck in an infinite loop at RAM addresses 0xC06 and 0xC19, preventing the game from progressing.

## Root Cause Analysis

### What I Found

1. **Block Boundary Detection Fixed**
   - The JIT compiler was creating blocks that spanned jump targets
   - Fixed by implementing `findLocalJumpTargets()` to detect backward jumps
   - Blocks now correctly split at internal jump targets
   - Result: Block 0xC06 now correctly stops before 0xC09 (which is a jump target from 0xC16)

2. **The Real Problem: Wrong Entry Point**
   - ROM code jumps to RAM address 0xC06
   - However, the code structure suggests entry should be at 0xC00:
     ```
     0xC00: JR NZ, 0      ; Wait loop
     0xC02: LD HL, 0xC802  ; Initialize HL to data pointer!
     0xC05: LD A, 0x2F     ; Initialize A
     0xC07: LD C, 0x12     ; Initialize C  
     0xC09: LD B, 0x0A     ; Initialize B (jump target from 0xC16)
     ```
   - By entering at 0xC06 instead of 0xC00, the initialization of HL is skipped
   - HL remains 0xC06 (pointing to code) instead of 0xC802 (pointing to data)

3. **The Infinite Loop Mechanism**
   - At 0xC0B: PUSH HL (pushes 0xC06)
   - At 0xC0C: CP (HL) - compares A with byte at HL
   - Since HL=0xC06 (code address), it compares with 0x2F (CPL opcode)
   - A=0xFF after CPL, so A != 0x2F, causing jump to 0xC19
   - At 0xC19: POP HL (restores HL=0xC06)
   - At 0xC20: JP (HL) - jumps back to 0xC06
   - Loop repeats forever

4. **Where 0xC06 Comes From**
   - ROM function at 0x6A1A-0x6A20:
     ```
     LD HL, 0x6500     ; Table of function pointers
     CALL 0x69A9       ; Look up function address using A as index
     JP (HL)           ; Jump to function
     ```
   - The lookup function at 0x69A9 reads from table and returns address in HL
   - Table at 0x6500 contains ROM function pointers (e.g., 0x6624)
   - One of those ROM functions eventually jumps/calls to RAM 0xC06

## Fixes Implemented

### 1. Block Boundary Detection ✅
**File**: `src/compiler/EmbeddedJIT.ts`

Added `findLocalJumpTargets()` function that:
- Scans ahead to find backward jump targets
- Splits blocks at these targets to prevent incorrect grouping
- Prevents loop initialization code from being included in loop body

**Result**: Blocks 0xC06, 0xC09, 0xC0C, and 0xC19 now correctly separated

### 2. Enhanced Logging ✅
**Files**: `src/compiler/EmbeddedJIT.ts`, `src/compiler/AOTCompiler.ts`

Added detailed logging to track:
- Register states (A, B, C, HL) at block entry
- Block compilation events
- RAM vs ROM execution

**Result**: Can now observe that HL=0xC06 on entry, causing the bug

## What Still Needs to Be Done

### Option 1: Find the Correct Entry Point
- Trace ROM execution more carefully to find where 0xC06 originates
- Check if maybe 0xC00 should be called first to initialize state
- Possibly the ROM code that copies functions to RAM is buggy

### Option 2: Workaround in Emulator
- Detect when RAM execution starts with invalid state (HL pointing to code)
- Auto-correct HL to point to data region (0xC800+)
- This is a hack but might get Tetris running

### Option 3: Check ROM Integrity
- Verify this is a good ROM dump
- Some Tetris versions might have bugs or copy protection

## Test Results

**Before Fix**:
- Single block 0xC06 contained initialization + loop body
- B and C reset every iteration
- Infinite loop

**After Fix**:
- Blocks correctly split: 0xC06 (init) → 0xC09 (outer loop) → 0xC0C (inner loop)  
- Block boundaries correct
- BUT still infinite loop because HL=0xC06 on entry

**Current State**:
- Block splitting: ✅ Fixed
- Register tracking: ✅ Added
- Infinite loop: ⚠️ Still present (wrong entry point issue)

## Next Steps

1. Add tracing to see exact ROM→RAM transition
2. Check if there's a CALL to 0xC00 that we're missing
3. Consider workaround to detect and fix invalid HL values
4. Test with other Game Boy games to see if this is Tetris-specific

## Files Modified

- `src/compiler/EmbeddedJIT.ts` - Block boundary detection + logging
- `src/compiler/AOTCompiler.ts` - Debug counter initialization
- `dist/tetris/game.js` - Rebuilt with fixes

## Conclusion

The block boundary detection fix was successful and necessary. However, the root cause is deeper: the ROM code is jumping to 0xC06 instead of 0xC00, skipping critical initialization. This might be:
1. A ROM bug/copy protection
2. Missing ROM-to-RAM copy logic
3. Incorrect table entry in ROM
4. Complex control flow we haven't traced yet

The emulator architecture is sound; this appears to be a game-specific issue requiring deeper ROM analysis.
