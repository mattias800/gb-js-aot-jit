# Game Boy Dynamic Recompiler Emulator - Implementation Plan

## Project Overview

**Goal**: Build a Game Boy emulator that dynamically recompiles ROM bytecode into standalone JavaScript, with the end goal of accurately displaying the Tetris title screen.

**Key Requirements**:
- No interpreting CPU core (no switch/case execution loop)
- ROM bytecode transpiled to JavaScript at load time
- No external libraries for bytecode handling or recompilation
- 100% custom dynamic recompiler
- After recompilation, no dependency on original ROM file
- Automated correctness verification at each stage
- Target milestone: Tetris title screen pixel-perfect rendering

**Technology Stack**:
- TypeScript for type safety and maintainability
- Vite for fast development and building
- Vitest for automated testing
- HTML Canvas for graphics rendering
- Node.js for CLI tools and testing

---

## Architecture Overview

### High-Level Flow

```
ROM File (binary)
    ↓
[ROM Loader] → Parse header, validate checksum
    ↓
[Instruction Decoder] → Decode all opcodes to structured format
    ↓
[Basic Block Analyzer] → Identify code blocks, build control flow graph
    ↓
[Code Flow Analysis] → Detect loops, subroutines, jump targets
    ↓
[Instruction Transpiler] → Convert each opcode to JavaScript expression
    ↓
[Basic Block Generator] → Generate JavaScript functions for each block
    ↓
[Code Emitter] → Output standalone JavaScript file
    ↓
[Runtime Components] → MMU, PPU, Timer, Interrupts (embedded in output)
    ↓
Standalone JavaScript (executable game)
```

### Core Components

1. **ROM Analysis Layer**
   - ROM Loader: Read binary, parse header
   - Instruction Decoder: Map opcodes to instruction metadata
   - Basic Block Analyzer: Identify executable code segments
   - Control Flow Graph: Build execution flow relationships

2. **Recompilation Layer**
   - Instruction Transpiler: Opcode → JavaScript expression
   - Basic Block Generator: Generate functions for code blocks
   - Code Emitter: Output valid, executable JavaScript
   - Optimization Pass: Inline hot paths, eliminate redundancy

3. **Runtime Layer** (embedded in generated code)
   - MMU: Memory mapping, banking (MBC1 support)
   - PPU: Tile/sprite rendering, mode transitions, interrupts
   - CPU State: Register management, flags
   - Interrupt Controller: Handle VBlank, STAT, Timer, Serial, Joypad
   - Timer: DIV, TIMA, TMA, TAC registers
   - Joypad: Input handling

4. **Verification Layer**
   - Unit tests: Per-instruction correctness
   - Integration tests: Code sequences, interrupts
   - Golden tests: Pixel-perfect frame comparison
   - Blargg tests: Industry-standard CPU validation

---

## Phase 1: Project Setup and ROM Analysis Infrastructure

### Goals
- Set up TypeScript project with testing infrastructure
- Implement ROM file loading and header parsing
- Create comprehensive instruction decoder

### Tasks

#### 1.1 Initialize Project
```bash
npm init -y
npm install --save-dev typescript vite vitest @types/node
npm install --save-dev @vitest/ui
```

**Files to create**:
- `package.json`: Scripts for dev, build, test
- `tsconfig.json`: TypeScript configuration (strict mode)
- `vite.config.ts`: Vite build configuration
- `vitest.config.ts`: Test runner configuration

#### 1.2 ROM Loader (`src/loader/ROMLoader.ts`)

**Responsibilities**:
- Read ROM file into `Uint8Array`
- Parse header at 0x0100-0x014F:
  - Entry point (0x0100-0x0103)
  - Nintendo logo (0x0104-0x0133)
  - Title (0x0134-0x0143)
  - CGB flag (0x0143)
  - Licensee code (0x0144-0x0145)
  - SGB flag (0x0146)
  - Cartridge type (0x0147) - MBC type
  - ROM size (0x0148)
  - RAM size (0x0149)
  - Destination code (0x014A)
  - Old licensee code (0x014B)
  - Mask ROM version (0x014C)
  - Header checksum (0x014D)
  - Global checksum (0x014E-0x014F)
- Validate header checksum
- Return ROM data + parsed metadata

**Interface**:
```typescript
interface ROMHeader {
  title: string
  cgbFlag: number
  cartridgeType: number
  romSize: number
  ramSize: number
  headerChecksum: number
  globalChecksum: number
}

interface ROM {
  data: Uint8Array
  header: ROMHeader
  isValid: boolean
}
```

#### 1.3 Instruction Decoder (`src/decoder/InstructionDecoder.ts`)

**Responsibilities**:
- Decode all 256 base opcodes (0x00-0xFF)
- Decode all 256 CB-prefixed opcodes (0xCB00-0xCBFF)
- Return instruction metadata:
  - Mnemonic (e.g., "LD A, B")
  - Length in bytes (1-3)
  - Cycle count (fixed or conditional)
  - Operand types (register, immediate, indirect)
  - Flags affected (Z, N, H, C)

**Data Structure**:
```typescript
interface Instruction {
  opcode: number
  mnemonic: string
  length: number
  cycles: number | [number, number] // [not taken, taken] for branches
  operands: Operand[]
  flagsAffected: {
    Z?: boolean // Zero flag
    N?: boolean // Subtract flag
    H?: boolean // Half-carry flag
    C?: boolean // Carry flag
  }
}

interface Operand {
  type: 'register' | 'immediate8' | 'immediate16' | 'indirect' | 'relative'
  value?: string // register name or addressing mode
}
```

**Example mappings**:
- `0x00`: NOP (1 byte, 4 cycles)
- `0x01`: LD BC, nn (3 bytes, 12 cycles)
- `0x20`: JR NZ, r8 (2 bytes, 12/8 cycles)
- `0xCB37`: SWAP A (2 bytes, 8 cycles)

#### 1.4 ROM Analyzer (`src/analyzer/ROMAnalyzer.ts`)

**Responsibilities**:
- Identify entry point (0x0100)
- Mark known code sections (entry point, interrupt vectors)
- Distinguish code from data (static strings, graphics)

**Interrupt Vectors** (always code):
- 0x0000: RST 00 / Start
- 0x0008: RST 08
- 0x0010: RST 10
- 0x0018: RST 18
- 0x0020: RST 20
- 0x0028: RST 28
- 0x0030: RST 30
- 0x0038: RST 38
- 0x0040: VBlank interrupt
- 0x0048: STAT interrupt
- 0x0050: Timer interrupt
- 0x0058: Serial interrupt
- 0x0060: Joypad interrupt

### Verification Strategy

**Unit Tests**:
```typescript
// tests/unit/ROMLoader.test.ts
test('loads ROM and parses header', () => {
  const rom = loadROM('test-roms/simple.gb')
  expect(rom.isValid).toBe(true)
  expect(rom.header.title).toBe('SIMPLE')
})

// tests/unit/InstructionDecoder.test.ts
test('decodes NOP correctly', () => {
  const instr = decodeInstruction(0x00)
  expect(instr.mnemonic).toBe('NOP')
  expect(instr.length).toBe(1)
  expect(instr.cycles).toBe(4)
})

test('decodes LD BC, nn correctly', () => {
  const instr = decodeInstruction(0x01)
  expect(instr.mnemonic).toBe('LD BC, nn')
  expect(instr.length).toBe(3)
  expect(instr.operands[0].type).toBe('register')
  expect(instr.operands[1].type).toBe('immediate16')
})

test('decodes all 256 base opcodes', () => {
  for (let i = 0; i < 256; i++) {
    const instr = decodeInstruction(i)
    expect(instr).toBeDefined()
    expect(instr.length).toBeGreaterThan(0)
  }
})

test('decodes all 256 CB opcodes', () => {
  for (let i = 0; i < 256; i++) {
    const instr = decodeCBInstruction(i)
    expect(instr).toBeDefined()
    expect(instr.length).toBe(2)
  }
})
```

**Integration Tests**:
- Load Tetris ROM, verify header
- Verify instruction decoder handles all opcodes in Tetris ROM

**Success Criteria**:
- ✓ All opcodes decoded with correct metadata
- ✓ ROM header parsing matches reference documentation
- ✓ All tests pass with 100% coverage
- ✓ No unknown opcodes in Tetris ROM

---

## Phase 2: Basic Block Detection and Code Flow Analysis

### Goals
- Identify all executable code blocks in ROM
- Build control flow graph (CFG)
- Detect jump targets, subroutines, and loops

### Background

A **basic block** is a sequence of instructions with:
- One entry point (only the first instruction can be a jump target)
- One exit point (only the last instruction can be a jump/branch/return)
- No internal branches

Basic blocks enable efficient recompilation because each block can be compiled to a single JavaScript function.

### Tasks

#### 2.1 Basic Block Analyzer (`src/analyzer/BasicBlockAnalyzer.ts`)

**Algorithm**:
1. Start from known entry points:
   - 0x0100 (main entry)
   - Interrupt vectors (0x0040, 0x0048, 0x0050, 0x0058, 0x0060)
2. For each entry point:
   - Decode instruction
   - If unconditional jump/call: add target to worklist
   - If conditional jump/call: add target and fallthrough to worklist
   - If return: end block
   - If sequential: continue to next instruction
3. Mark basic block boundaries when:
   - Jump target detected
   - Branch instruction encountered
   - Return instruction encountered
4. Repeat until worklist empty

**Data Structures**:
```typescript
interface BasicBlock {
  startAddress: number
  endAddress: number
  instructions: Instruction[]
  exitType: 'jump' | 'call' | 'branch' | 'return' | 'fallthrough'
  targets: number[] // jump/branch targets
}

interface CodeDatabase {
  blocks: Map<number, BasicBlock> // address → block
  jumpTargets: Set<number>
  callTargets: Set<number>
}
```

**Special Cases**:
- **Conditional branches** (JR, JP with condition): Create two edges (taken, not taken)
- **Jump tables**: Detect patterns like `LD HL, table; ADD A; JP (HL)` and analyze table
- **Indirect jumps**: `JP (HL)` - conservatively assume multiple targets
- **RST instructions**: Quick calls to fixed addresses (0x00, 0x08, ..., 0x38)

#### 2.2 Control Flow Graph (`src/analyzer/ControlFlowGraph.ts`)

**Responsibilities**:
- Build directed graph of basic blocks
- Nodes: Basic blocks
- Edges: Control flow (jump, call, fallthrough)
- Detect loops (back edges)
- Detect unreachable code

**Graph Representation**:
```typescript
interface CFGNode {
  block: BasicBlock
  predecessors: CFGNode[]
  successors: CFGNode[]
}

interface ControlFlowGraph {
  nodes: Map<number, CFGNode>
  entryPoint: CFGNode
  loops: Loop[]
}

interface Loop {
  header: CFGNode
  body: Set<CFGNode>
  backEdges: [CFGNode, CFGNode][]
}
```

**Analysis Techniques**:
- **Dominance analysis**: Identify loop headers
- **Liveness analysis**: Track which registers are live
- **Reachability**: Mark all reachable code from entry point

#### 2.3 Jump Table Analysis

**Pattern Recognition**:
Many games use jump tables for state machines:
```asm
; Jump table pattern
LD A, [state]
ADD A
LD HL, jumpTable
ADD L
LD L, A
LD A, H
ADC 0
LD H, A
LD A, [HL+]
LD H, [HL]
LD L, A
JP (HL)

jumpTable:
  DW handler0
  DW handler1
  DW handler2
```

**Strategy**:
- Detect `JP (HL)` after table load pattern
- Analyze table in ROM data
- Add all table entries as jump targets

### Verification Strategy

**Unit Tests**:
```typescript
// tests/unit/BasicBlockAnalyzer.test.ts
test('identifies linear code as single block', () => {
  const rom = createTestROM([0x00, 0x00, 0x00]) // NOP NOP NOP
  const blocks = analyzeBasicBlocks(rom)
  expect(blocks.size).toBe(1)
})

test('splits block on unconditional jump', () => {
  const rom = createTestROM([
    0x00,       // NOP
    0xC3, 0x00, 0x01 // JP 0x0100
  ])
  const blocks = analyzeBasicBlocks(rom)
  expect(blocks.size).toBeGreaterThanOrEqual(1)
})

test('splits block on conditional jump', () => {
  const rom = createTestROM([
    0x00,       // NOP
    0x20, 0x05, // JR NZ, +5
    0x00        // NOP
  ])
  const blocks = analyzeBasicBlocks(rom)
  expect(blocks.size).toBe(2) // One before branch, one after
})

test('identifies all interrupt vectors as entry points', () => {
  const rom = loadROM('test-roms/interrupts.gb')
  const cfg = buildControlFlowGraph(rom)
  expect(cfg.nodes.has(0x0040)).toBe(true) // VBlank
  expect(cfg.nodes.has(0x0048)).toBe(true) // STAT
})
```

**Integration Tests**:
- Analyze Tetris ROM, verify known functions detected
- Check no unreachable code marked as reachable
- Verify all jump targets identified

**Success Criteria**:
- ✓ All reachable code discovered
- ✓ Basic blocks correctly identified
- ✓ Control flow graph accurate
- ✓ No false positives (data misidentified as code)
- ✓ Tetris ROM analyzed successfully

---

## Phase 3: JavaScript Code Generator Core

### Goals
- Transpile each Game Boy instruction to JavaScript
- Generate executable basic block functions
- Handle CPU state (registers, flags, memory)

### Background

Traditional emulators interpret instructions in a loop:
```javascript
while (running) {
  const opcode = read(PC++)
  switch (opcode) {
    case 0x00: /* NOP */ break
    case 0x01: /* LD BC, nn */ ...
  }
}
```

Dynamic recompilation generates JavaScript ahead of time:
```javascript
function block_0100(state) {
  // Original: LD A, 0x00
  state.A = 0x00
  // Original: LD HL, 0x9800
  state.H = 0x98; state.L = 0x00
  // Original: LD [HL], A
  mmu.write8((state.H << 8) | state.L, state.A)
  return { nextBlock: 0x0105, cycles: 20 }
}
```

### Tasks

#### 3.1 Instruction Transpiler (`src/recompiler/InstructionTranspiler.ts`)

**Responsibilities**:
- Map each opcode to JavaScript expression
- Handle all register operations
- Handle all memory operations
- Handle all flag updates
- Handle all arithmetic/logic operations

**Template System**:
```typescript
interface TranspilationTemplate {
  opcode: number
  template: (operands: Operand[]) => string
  cycleCount: number | ((operands: Operand[]) => string) // Can be conditional
}

// Example templates
const templates: TranspilationTemplate[] = [
  {
    opcode: 0x00, // NOP
    template: () => '// NOP',
    cycleCount: 4
  },
  {
    opcode: 0x3E, // LD A, n
    template: (ops) => `state.A = ${ops[1].value}`,
    cycleCount: 8
  },
  {
    opcode: 0x77, // LD [HL], A
    template: () => 'mmu.write8((state.H << 8) | state.L, state.A)',
    cycleCount: 8
  },
  {
    opcode: 0xC3, // JP nn
    template: (ops) => `return { nextBlock: ${ops[0].value}, cycles }`,
    cycleCount: 16
  },
  {
    opcode: 0x20, // JR NZ, r8
    template: (ops) => `
      if (!state.zeroFlag) {
        return { nextBlock: PC + ${ops[0].value}, cycles: 12 }
      }
      cycles += 8
    `,
    cycleCount: (ops) => 'conditional'
  }
]
```

**Flag Handling**:
Flags are updated by arithmetic operations. Generate helpers:
```javascript
function add8(a, b) {
  const result = a + b
  state.zeroFlag = (result & 0xFF) === 0
  state.subtractFlag = false
  state.halfCarryFlag = ((a & 0xF) + (b & 0xF)) > 0xF
  state.carryFlag = result > 0xFF
  return result & 0xFF
}

function sub8(a, b) {
  const result = a - b
  state.zeroFlag = (result & 0xFF) === 0
  state.subtractFlag = true
  state.halfCarryFlag = (a & 0xF) < (b & 0xF)
  state.carryFlag = result < 0
  return result & 0xFF
}
```

**All Instruction Categories**:
1. **Load/Store** (LD): Register-register, immediate, indirect
2. **Arithmetic** (ADD, ADC, SUB, SBC, INC, DEC): 8-bit and 16-bit
3. **Logic** (AND, OR, XOR, CP): Bitwise operations
4. **Rotate/Shift** (RLC, RRC, RL, RR, SLA, SRA, SRL): Bit manipulation
5. **Bit operations** (BIT, SET, RES): Test/set/clear bits
6. **Jump** (JP, JR): Conditional and unconditional
7. **Call/Return** (CALL, RET, RETI, RST): Subroutine handling
8. **Stack** (PUSH, POP): Register save/restore
9. **Control** (HALT, STOP, EI, DI, NOP): CPU control
10. **Special** (DAA, CPL, CCF, SCF): Misc operations

#### 3.2 Basic Block Generator (`src/recompiler/BasicBlockGenerator.ts`)

**Responsibilities**:
- Convert basic block to JavaScript function
- Pass CPU state as parameter
- Return next block address and cycle count
- Handle control flow (branches, calls, returns)

**Function Template**:
```typescript
function generateBasicBlockFunction(block: BasicBlock): string {
  const lines: string[] = []
  
  lines.push(`function block_${block.startAddress.toString(16)}(state, mmu, ppu, timer) {`)
  lines.push(`  let cycles = 0`)
  lines.push(`  let PC = 0x${block.startAddress.toString(16)}`)
  
  for (const instr of block.instructions) {
    const code = transpileInstruction(instr)
    lines.push(`  // ${instr.mnemonic}`)
    lines.push(`  ${code}`)
    lines.push(`  cycles += ${instr.cycles}`)
    lines.push(`  PC += ${instr.length}`)
  }
  
  // Handle exit
  if (block.exitType === 'fallthrough') {
    lines.push(`  return { nextBlock: 0x${(block.endAddress + 1).toString(16)}, cycles }`)
  }
  
  lines.push(`}`)
  
  return lines.join('\n')
}
```

**Example Generated Code**:
```javascript
function block_0150(state, mmu, ppu, timer) {
  let cycles = 0
  let PC = 0x0150
  
  // LD A, 0x00
  state.A = 0x00
  cycles += 8
  PC += 2
  
  // LD HL, 0x9800
  state.H = 0x98; state.L = 0x00
  cycles += 12
  PC += 3
  
  // LD [HL+], A
  mmu.write8((state.H << 8) | state.L, state.A)
  state.L = (state.L + 1) & 0xFF
  if (state.L === 0) state.H = (state.H + 1) & 0xFF
  cycles += 8
  PC += 1
  
  // JR NZ, -5
  if (!state.zeroFlag) {
    return { nextBlock: PC - 5, cycles: cycles + 12 }
  }
  cycles += 8
  PC += 2
  
  return { nextBlock: PC, cycles }
}
```

#### 3.3 Code Emitter (`src/recompiler/CodeEmitter.ts`)

**Responsibilities**:
- Generate complete standalone JavaScript file
- Include helper functions (add8, sub8, etc.)
- Include all basic block functions
- Include main execution loop
- Include runtime components (MMU, PPU, etc.)
- Embed ROM data as Uint8Array

**File Structure**:
```javascript
// Generated by Game Boy Dynamic Recompiler
// Source ROM: tetris.gb

// Helper functions
function add8(state, a, b) { ... }
function sub8(state, a, b) { ... }
function inc8(state, val) { ... }
// ... more helpers

// CPU State
class CPUState {
  constructor() {
    this.A = 0x01; this.F = 0xB0
    this.B = 0x00; this.C = 0x13
    // ... other registers
  }
  
  get zeroFlag() { return (this.F & 0x80) !== 0 }
  set zeroFlag(v) { v ? (this.F |= 0x80) : (this.F &= ~0x80) }
  // ... other flags
}

// Runtime components
class MMU { ... }
class PPU { ... }
class Timer { ... }
class InterruptController { ... }

// Recompiled basic blocks
function block_0100(state, mmu, ppu, timer) { ... }
function block_0150(state, mmu, ppu, timer) { ... }
// ... all other blocks

// Block dispatch table
const blockFunctions = {
  0x0100: block_0100,
  0x0150: block_0150,
  // ... all blocks
}

// Main execution loop
function run(canvas) {
  const state = new CPUState()
  const mmu = new MMU(romData)
  const ppu = new PPU(canvas)
  const timer = new Timer()
  const interrupts = new InterruptController()
  
  let nextBlock = 0x0100
  let totalCycles = 0
  
  while (true) {
    const blockFn = blockFunctions[nextBlock]
    if (!blockFn) {
      console.error(`Unknown block: 0x${nextBlock.toString(16)}`)
      break
    }
    
    const result = blockFn(state, mmu, ppu, timer)
    totalCycles += result.cycles
    
    // Step hardware
    ppu.step(result.cycles)
    timer.step(result.cycles)
    
    // Check interrupts
    const interrupt = interrupts.check(state, mmu)
    if (interrupt) {
      nextBlock = interrupt.handler
    } else {
      nextBlock = result.nextBlock
    }
    
    // Break on frame complete
    if (ppu.frameComplete) {
      ppu.render()
      break
    }
  }
  
  // Continue on next frame
  requestAnimationFrame(() => run(canvas))
}

// ROM data (embedded)
const romData = new Uint8Array([0x00, 0xC3, 0x50, 0x01, ...])

// Export
export { run }
```

### Verification Strategy

**Unit Tests**:
```typescript
// tests/unit/InstructionTranspiler.test.ts
test('transpiles LD A, n correctly', () => {
  const instr = { opcode: 0x3E, operands: [{ type: 'immediate8', value: 0x42 }] }
  const code = transpileInstruction(instr)
  expect(code).toContain('state.A = 0x42')
})

test('transpiles ADD A, B with correct flags', () => {
  const instr = { opcode: 0x80 }
  const code = transpileInstruction(instr)
  expect(code).toContain('add8(state, state.A, state.B)')
})

test('transpiles conditional jump correctly', () => {
  const instr = { opcode: 0x20, operands: [{ type: 'relative', value: 5 }] }
  const code = transpileInstruction(instr)
  expect(code).toContain('if (!state.zeroFlag)')
  expect(code).toContain('return { nextBlock:')
})
```

**Integration Tests**:
```typescript
// tests/integration/CodeGeneration.test.ts
test('generates executable basic block', () => {
  const block = createTestBlock([0x3E, 0x42]) // LD A, 0x42
  const code = generateBasicBlockFunction(block)
  const fn = eval(code)
  
  const state = new CPUState()
  const result = fn(state, mockMMU, mockPPU, mockTimer)
  
  expect(state.A).toBe(0x42)
  expect(result.cycles).toBe(8)
})

test('generated code is syntactically valid', () => {
  const rom = loadROM('test-roms/simple.gb')
  const blocks = analyzeBasicBlocks(rom)
  const code = emitCode(blocks)
  
  expect(() => eval(code)).not.toThrow()
})
```

**Success Criteria**:
- ✓ All instructions transpile correctly
- ✓ Flags calculated accurately
- ✓ Generated code is valid JavaScript
- ✓ Basic blocks execute correctly
- ✓ All Tetris instructions supported

---

## Phase 4: Memory Management Unit (MMU) Implementation

### Goals
- Implement complete Game Boy memory map
- Support MBC1 memory bank controller (required for Tetris)
- Handle memory-mapped I/O registers

### Game Boy Memory Map

```
0x0000-0x3FFF : ROM Bank 0 (fixed)
0x4000-0x7FFF : ROM Bank 1-N (switchable via MBC)
0x8000-0x9FFF : VRAM (8KB)
0xA000-0xBFFF : External RAM (switchable via MBC)
0xC000-0xCFFF : WRAM Bank 0 (4KB)
0xD000-0xDFFF : WRAM Bank 1 (4KB)
0xE000-0xFDFF : Echo RAM (mirror of 0xC000-0xDDFF)
0xFE00-0xFE9F : OAM (Object Attribute Memory, 160 bytes, 40 sprites × 4 bytes)
0xFEA0-0xFEFF : Unusable
0xFF00-0xFF7F : I/O Registers
0xFF80-0xFFFE : HRAM (High RAM, 127 bytes)
0xFFFF        : Interrupt Enable register
```

### Tasks

#### 4.1 MMU Core (`src/runtime/MMU.ts`)

**Data Structure**:
```typescript
class MMU {
  private romBank0: Uint8Array // 16KB, fixed
  private romBankN: Uint8Array // 16KB, switchable
  private vram: Uint8Array     // 8KB
  private eram: Uint8Array     // 8KB (or more)
  private wram0: Uint8Array    // 4KB
  private wram1: Uint8Array    // 4KB
  private oam: Uint8Array      // 160 bytes
  private hram: Uint8Array     // 127 bytes
  private io: Uint8Array       // 128 bytes
  
  private romBanks: Uint8Array[] // All ROM banks
  private ramBanks: Uint8Array[] // All RAM banks
  private currentROMBank: number = 1
  private currentRAMBank: number = 0
  private ramEnabled: boolean = false
  
  private mbcType: number
  
  constructor(romData: Uint8Array) {
    this.mbcType = romData[0x0147]
    this.loadROM(romData)
    this.reset()
  }
  
  read8(address: number): number {
    address &= 0xFFFF
    
    if (address < 0x4000) {
      return this.romBank0[address]
    } else if (address < 0x8000) {
      return this.romBankN[address - 0x4000]
    } else if (address < 0xA000) {
      return this.vram[address - 0x8000]
    } else if (address < 0xC000) {
      if (!this.ramEnabled) return 0xFF
      return this.eram[address - 0xA000]
    } else if (address < 0xD000) {
      return this.wram0[address - 0xC000]
    } else if (address < 0xE000) {
      return this.wram1[address - 0xD000]
    } else if (address < 0xFE00) {
      // Echo RAM
      return this.wram0[(address - 0xE000) & 0x0FFF]
    } else if (address < 0xFEA0) {
      return this.oam[address - 0xFE00]
    } else if (address >= 0xFF80 && address < 0xFFFF) {
      return this.hram[address - 0xFF80]
    } else if (address >= 0xFF00 && address < 0xFF80) {
      return this.readIO(address)
    } else if (address === 0xFFFF) {
      return this.interruptEnable
    }
    
    return 0xFF // Unusable area
  }
  
  write8(address: number, value: number): void {
    address &= 0xFFFF
    value &= 0xFF
    
    if (address < 0x8000) {
      this.writeMBC(address, value)
    } else if (address < 0xA000) {
      this.vram[address - 0x8000] = value
    } else if (address < 0xC000) {
      if (this.ramEnabled) {
        this.eram[address - 0xA000] = value
      }
    } else if (address < 0xD000) {
      this.wram0[address - 0xC000] = value
    } else if (address < 0xE000) {
      this.wram1[address - 0xD000] = value
    } else if (address < 0xFE00) {
      // Echo RAM
      this.wram0[(address - 0xE000) & 0x0FFF] = value
    } else if (address < 0xFEA0) {
      this.oam[address - 0xFE00] = value
    } else if (address >= 0xFF80 && address < 0xFFFF) {
      this.hram[address - 0xFF80] = value
    } else if (address >= 0xFF00 && address < 0xFF80) {
      this.writeIO(address, value)
    } else if (address === 0xFFFF) {
      this.interruptEnable = value
    }
  }
}
```

#### 4.2 MBC1 Implementation

MBC1 is the most common memory bank controller. Tetris uses MBC1.

**Banking Registers**:
- **0x0000-0x1FFF**: RAM Enable (write 0x0A to enable, anything else to disable)
- **0x2000-0x3FFF**: ROM Bank Number (5 bits, lower bits of ROM bank)
- **0x4000-0x5FFF**: RAM Bank Number or ROM Bank Number (2 bits)
- **0x6000-0x7FFF**: Banking Mode Select (0 = ROM mode, 1 = RAM mode)

**Implementation**:
```typescript
private writeMBC(address: number, value: number): void {
  if (this.mbcType === 0x01 || this.mbcType === 0x02 || this.mbcType === 0x03) {
    // MBC1
    if (address < 0x2000) {
      // RAM Enable
      this.ramEnabled = (value & 0x0F) === 0x0A
    } else if (address < 0x4000) {
      // ROM Bank Number (lower 5 bits)
      let bank = value & 0x1F
      if (bank === 0) bank = 1 // Bank 0 maps to bank 1
      this.currentROMBank = (this.currentROMBank & 0x60) | bank
      this.updateROMBank()
    } else if (address < 0x6000) {
      // RAM Bank Number or ROM Bank Number (upper 2 bits)
      if (this.mbc1Mode === 0) {
        // ROM mode: bits 5-6 of ROM bank
        this.currentROMBank = (this.currentROMBank & 0x1F) | ((value & 0x03) << 5)
        this.updateROMBank()
      } else {
        // RAM mode: RAM bank select
        this.currentRAMBank = value & 0x03
        this.updateRAMBank()
      }
    } else if (address < 0x8000) {
      // Banking mode select
      this.mbc1Mode = value & 0x01
    }
  }
}

private updateROMBank(): void {
  const bankIndex = this.currentROMBank % this.romBanks.length
  this.romBankN = this.romBanks[bankIndex]
}

private updateRAMBank(): void {
  if (this.ramBanks.length > 0) {
    const bankIndex = this.currentRAMBank % this.ramBanks.length
    this.eram = this.ramBanks[bankIndex]
  }
}
```

#### 4.3 I/O Registers

**Key Registers**:
- **0xFF00**: Joypad (P1)
- **0xFF01**: Serial transfer data (SB)
- **0xFF02**: Serial transfer control (SC)
- **0xFF04**: Divider register (DIV)
- **0xFF05**: Timer counter (TIMA)
- **0xFF06**: Timer modulo (TMA)
- **0xFF07**: Timer control (TAC)
- **0xFF0F**: Interrupt flag (IF)
- **0xFF40**: LCD control (LCDC)
- **0xFF41**: LCD status (STAT)
- **0xFF42**: Scroll Y (SCY)
- **0xFF43**: Scroll X (SCX)
- **0xFF44**: LCD Y coordinate (LY)
- **0xFF45**: LY compare (LYC)
- **0xFF46**: DMA transfer (OAM DMA)
- **0xFF47**: BG palette (BGP)
- **0xFF48**: OBJ palette 0 (OBP0)
- **0xFF49**: OBJ palette 1 (OBP1)
- **0xFF4A**: Window Y (WY)
- **0xFF4B**: Window X (WX)
- **0xFFFF**: Interrupt enable (IE)

**Implementation**:
```typescript
private readIO(address: number): number {
  switch (address) {
    case 0xFF00: return this.joypad.read()
    case 0xFF04: return this.timer.readDIV()
    case 0xFF05: return this.timer.readTIMA()
    case 0xFF06: return this.timer.readTMA()
    case 0xFF07: return this.timer.readTAC()
    case 0xFF0F: return this.interruptController.readIF()
    case 0xFF40: return this.ppu.readLCDC()
    case 0xFF41: return this.ppu.readSTAT()
    case 0xFF44: return this.ppu.readLY()
    // ... more registers
    default: return this.io[address - 0xFF00]
  }
}

private writeIO(address: number, value: number): void {
  switch (address) {
    case 0xFF00: this.joypad.write(value); break
    case 0xFF04: this.timer.writeDIV(value); break
    case 0xFF05: this.timer.writeTIMA(value); break
    case 0xFF06: this.timer.writeTMA(value); break
    case 0xFF07: this.timer.writeTAC(value); break
    case 0xFF0F: this.interruptController.writeIF(value); break
    case 0xFF40: this.ppu.writeLCDC(value); break
    case 0xFF41: this.ppu.writeSTAT(value); break
    case 0xFF46: this.doDMATransfer(value); break
    // ... more registers
    default: this.io[address - 0xFF00] = value
  }
}

private doDMATransfer(value: number): void {
  // DMA transfers 160 bytes from XX00-XX9F to OAM (0xFE00-0xFE9F)
  const sourceAddress = value << 8
  for (let i = 0; i < 160; i++) {
    this.oam[i] = this.read8(sourceAddress + i)
  }
}
```

### Verification Strategy

**Unit Tests**:
```typescript
// tests/unit/MMU.test.ts
test('reads from ROM bank 0', () => {
  const mmu = new MMU(testROM)
  expect(mmu.read8(0x0100)).toBe(testROM[0x0100])
})

test('reads from ROM bank 1', () => {
  const mmu = new MMU(testROM)
  expect(mmu.read8(0x4000)).toBe(testROM[0x4000])
})

test('switches ROM banks correctly', () => {
  const mmu = new MMU(testROM)
  mmu.write8(0x2000, 0x02) // Switch to bank 2
  const value = mmu.read8(0x4000)
  expect(value).toBe(testROM[0x8000]) // Bank 2 starts at 0x8000 in ROM
})

test('RAM is disabled by default', () => {
  const mmu = new MMU(testROM)
  mmu.write8(0xA000, 0x42)
  expect(mmu.read8(0xA000)).toBe(0xFF) // Read returns 0xFF
})

test('RAM can be enabled', () => {
  const mmu = new MMU(testROM)
  mmu.write8(0x0000, 0x0A) // Enable RAM
  mmu.write8(0xA000, 0x42)
  expect(mmu.read8(0xA000)).toBe(0x42)
})

test('DMA transfer works correctly', () => {
  const mmu = new MMU(testROM)
  // Fill source with test data
  for (let i = 0; i < 160; i++) {
    mmu.write8(0xC000 + i, i)
  }
  // Trigger DMA
  mmu.write8(0xFF46, 0xC0)
  // Verify OAM
  for (let i = 0; i < 160; i++) {
    expect(mmu.read8(0xFE00 + i)).toBe(i)
  }
})
```

**Success Criteria**:
- ✓ All memory regions accessible
- ✓ ROM banking works correctly
- ✓ RAM banking works correctly
- ✓ I/O registers route to correct components
- ✓ DMA transfer functions correctly

---

## Phase 5: Picture Processing Unit (PPU) Implementation

### Goals
- Render background tiles to canvas
- Render sprites (OAM) to canvas
- Implement LCD modes and timing
- Generate VBlank and STAT interrupts

### Game Boy PPU Basics

**Display**: 160×144 pixels
**Tiles**: 8×8 pixels, 2 bits per pixel (4 colors)
**Tile Data**: 0x8000-0x97FF (3 modes of addressing)
**Tile Maps**: 0x9800-0x9BFF or 0x9C00-0x9FFF (32×32 tiles)
**Sprites**: 40 sprites max, 10 per line
**Colors**: 4 shades (white, light gray, dark gray, black)

**LCD Modes**:
- **Mode 0** (HBlank): 204 dots, CPU can access VRAM/OAM
- **Mode 1** (VBlank): 10 lines, CPU can access VRAM/OAM, VBlank interrupt
- **Mode 2** (OAM Search): 80 dots, CPU cannot access OAM
- **Mode 3** (Transfer): 172 dots, CPU cannot access VRAM/OAM

**Timing**: 456 dots per line, 154 lines per frame (144 visible + 10 VBlank)

### Tasks

#### 5.1 PPU Core (`src/runtime/PPU.ts`)

**Data Structure**:
```typescript
class PPU {
  private framebuffer: Uint8ClampedArray // 160×144×4 (RGBA)
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  
  // LCD registers
  private lcdc: number = 0x91 // LCD control
  private stat: number = 0x00 // LCD status
  private scy: number = 0     // Scroll Y
  private scx: number = 0     // Scroll X
  private ly: number = 0      // Current line
  private lyc: number = 0     // LY compare
  private bgp: number = 0xFC  // BG palette
  private obp0: number = 0xFF // OBJ palette 0
  private obp1: number = 0xFF // OBJ palette 1
  private wy: number = 0      // Window Y
  private wx: number = 0      // Window X
  
  private mode: number = 2    // Current mode (0-3)
  private dots: number = 0    // Dots in current line
  
  public frameComplete: boolean = false
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.framebuffer = new Uint8ClampedArray(160 * 144 * 4)
  }
  
  step(cycles: number): void {
    if (!this.lcdEnabled()) return
    
    this.dots += cycles
    
    switch (this.mode) {
      case 2: // OAM Search (80 dots)
        if (this.dots >= 80) {
          this.mode = 3
          this.dots -= 80
        }
        break
        
      case 3: // Transfer (172 dots)
        if (this.dots >= 172) {
          this.mode = 0
          this.dots -= 172
          this.renderLine()
        }
        break
        
      case 0: // HBlank (204 dots)
        if (this.dots >= 204) {
          this.dots -= 204
          this.ly++
          
          if (this.ly === 144) {
            this.mode = 1
            this.frameComplete = true
            this.requestInterrupt(INTERRUPT_VBLANK)
          } else {
            this.mode = 2
          }
          
          this.checkLYC()
        }
        break
        
      case 1: // VBlank (10 lines, 456 dots each)
        if (this.dots >= 456) {
          this.dots -= 456
          this.ly++
          
          if (this.ly > 153) {
            this.ly = 0
            this.mode = 2
            this.frameComplete = false
          }
          
          this.checkLYC()
        }
        break
    }
    
    this.updateSTAT()
  }
  
  private renderLine(): void {
    if (this.bgEnabled()) {
      this.renderBackground()
    }
    if (this.spritesEnabled()) {
      this.renderSprites()
    }
  }
}
```

#### 5.2 Tile Rendering

**Tile Format**:
Each tile is 16 bytes (8×8 pixels, 2 bits per pixel):
```
Byte 0-1: Row 0 (2 bytes = 8 pixels × 2 bits)
Byte 2-3: Row 1
...
Byte 14-15: Row 7
```

**Decoding**:
```typescript
private getTilePixel(tileData: Uint8Array, tileIndex: number, x: number, y: number): number {
  const offset = tileIndex * 16 + y * 2
  const byte1 = tileData[offset]
  const byte2 = tileData[offset + 1]
  const bit = 7 - x
  const colorBit0 = (byte1 >> bit) & 1
  const colorBit1 = (byte2 >> bit) & 1
  return (colorBit1 << 1) | colorBit0
}
```

**Background Rendering**:
```typescript
private renderBackground(): void {
  const tileMapAddress = this.bgTileMapAddress()
  const tileDataAddress = this.tileDataAddress()
  const signed = tileDataAddress === 0x8800
  
  for (let x = 0; x < 160; x++) {
    const scrollX = (this.scx + x) & 0xFF
    const scrollY = (this.scy + this.ly) & 0xFF
    
    const tileX = scrollX >> 3 // Divide by 8
    const tileY = scrollY >> 3
    const pixelX = scrollX & 7
    const pixelY = scrollY & 7
    
    const tileMapIndex = tileY * 32 + tileX
    let tileIndex = this.vram[tileMapAddress + tileMapIndex - 0x8000]
    
    if (signed && tileIndex < 128) {
      tileIndex += 256
    }
    
    const color = this.getTilePixel(this.vram, tileIndex, pixelX, pixelY)
    const rgb = this.applyPalette(color, this.bgp)
    
    const offset = (this.ly * 160 + x) * 4
    this.framebuffer[offset + 0] = rgb[0]
    this.framebuffer[offset + 1] = rgb[1]
    this.framebuffer[offset + 2] = rgb[2]
    this.framebuffer[offset + 3] = 255
  }
}
```

#### 5.3 Sprite Rendering

**OAM Format** (4 bytes per sprite):
- Byte 0: Y position (minus 16)
- Byte 1: X position (minus 8)
- Byte 2: Tile index
- Byte 3: Attributes (priority, Y-flip, X-flip, palette)

**Sprite Rendering**:
```typescript
private renderSprites(): void {
  const spriteHeight = this.spriteHeight()
  const sprites: Sprite[] = []
  
  // Collect sprites for this line
  for (let i = 0; i < 40; i++) {
    const y = this.oam[i * 4] - 16
    const x = this.oam[i * 4 + 1] - 8
    const tileIndex = this.oam[i * 4 + 2]
    const attrs = this.oam[i * 4 + 3]
    
    if (this.ly >= y && this.ly < y + spriteHeight) {
      sprites.push({ x, y, tileIndex, attrs })
    }
  }
  
  // Sort by X position (priority)
  sprites.sort((a, b) => a.x - b.x)
  
  // Limit to 10 sprites per line
  sprites.splice(10)
  
  // Render sprites
  for (const sprite of sprites) {
    this.renderSprite(sprite)
  }
}

private renderSprite(sprite: Sprite): void {
  const yFlip = (sprite.attrs & 0x40) !== 0
  const xFlip = (sprite.attrs & 0x20) !== 0
  const palette = (sprite.attrs & 0x10) ? this.obp1 : this.obp0
  const priority = (sprite.attrs & 0x80) !== 0
  
  const spriteY = yFlip ? (7 - (this.ly - sprite.y)) : (this.ly - sprite.y)
  
  for (let x = 0; x < 8; x++) {
    const spriteX = xFlip ? (7 - x) : x
    const screenX = sprite.x + x
    
    if (screenX < 0 || screenX >= 160) continue
    
    const color = this.getTilePixel(this.vram, sprite.tileIndex, spriteX, spriteY)
    if (color === 0) continue // Transparent
    
    // Check priority (if set, only draw over color 0)
    if (priority) {
      const offset = (this.ly * 160 + screenX) * 4
      const bgColor = this.framebuffer[offset] // Simplified check
      if (bgColor !== 255) continue // Skip if BG is not color 0
    }
    
    const rgb = this.applyPalette(color, palette)
    
    const offset = (this.ly * 160 + screenX) * 4
    this.framebuffer[offset + 0] = rgb[0]
    this.framebuffer[offset + 1] = rgb[1]
    this.framebuffer[offset + 2] = rgb[2]
    this.framebuffer[offset + 3] = 255
  }
}
```

#### 5.4 Palette Mapping

Game Boy uses 2-bit colors (0-3), mapped via palette registers:

```typescript
private applyPalette(color: number, palette: number): [number, number, number] {
  const paletteColor = (palette >> (color * 2)) & 3
  
  // Map to RGB
  switch (paletteColor) {
    case 0: return [255, 255, 255] // White
    case 1: return [192, 192, 192] // Light gray
    case 2: return [96, 96, 96]    // Dark gray
    case 3: return [0, 0, 0]       // Black
  }
}
```

#### 5.5 Canvas Rendering

```typescript
public render(): void {
  const imageData = new ImageData(this.framebuffer, 160, 144)
  this.ctx.putImageData(imageData, 0, 0)
}
```

### Verification Strategy

**Unit Tests**:
```typescript
// tests/unit/PPU.test.ts
test('decodes tile pixel correctly', () => {
  const tileData = new Uint8Array([0xFF, 0x00, ...]) // Checkerboard pattern
  const color = getTilePixel(tileData, 0, 0, 0)
  expect(color).toBe(1) // Binary: 01
})

test('renders solid color background', () => {
  const ppu = new PPU(mockCanvas)
  // Set up VRAM with solid color tile
  // ...
  ppu.renderBackground()
  // Verify framebuffer
  expect(ppu.framebuffer[0]).toBe(255) // White
})

test('applies palette correctly', () => {
  const ppu = new PPU(mockCanvas)
  ppu.bgp = 0xE4 // Default palette: 11 10 01 00
  const rgb = ppu.applyPalette(2, ppu.bgp)
  expect(rgb).toEqual([192, 192, 192]) // Light gray
})
```

**Integration Tests**:
```typescript
// tests/integration/PPU.test.ts
test('renders Tetris title screen correctly', () => {
  const mmu = new MMU(tetrisROM)
  const ppu = new PPU(mockCanvas)
  
  // Run until title screen
  runUntilFrame(mmu, ppu, 300)
  
  // Compare with golden image
  const goldenImage = loadImage('golden/tetris-title.png')
  const diff = compareImages(ppu.framebuffer, goldenImage)
  expect(diff).toBeLessThan(0.01) // 99% match
})
```

**Success Criteria**:
- ✓ Tiles decode correctly
- ✓ Background renders correctly
- ✓ Sprites render correctly
- ✓ Palettes applied correctly
- ✓ LCD modes transition at correct times
- ✓ VBlank interrupt fires

---

## Phase 6-12: Remaining Components

Due to length constraints, I'll summarize the remaining phases. Each would follow the same detailed structure as above.

### Phase 6: CPU State and Interrupt Controller
- Implement interrupt priority and handling
- Handle EI/DI delay
- Handle HALT/STOP instructions
- Integrate interrupt checks into recompiled code

### Phase 7: Timer and Joypad
- Implement DIV, TIMA, TMA, TAC registers
- Handle timer overflow interrupt
- Implement joypad input (P1 register)
- Map keyboard to Game Boy buttons

### Phase 8: Full ROM Recompilation Pipeline
- Integrate all components into single output
- Generate standalone JavaScript file
- Embed ROM data
- Create main execution loop

### Phase 9: Cycle Accuracy and Timing
- Ensure PPU/Timer sync with CPU cycles
- Match hardware timing (60 FPS)
- Optimize performance

### Phase 10: Automated Test Suite
- Unit tests for all components
- Integration tests for full system
- Golden frame tests (pixel-perfect comparison)
- Blargg CPU tests

### Phase 11: Tetris-Specific Debugging
- Debug boot sequence (Nintendo logo)
- Verify title screen pixel-perfect
- Test input handling
- Performance optimization

### Phase 12: Documentation and Final Verification
- Complete README with architecture explanation
- Document recompiler algorithm
- Create usage examples
- Final test pass

---

## Verification Strategy Summary

### Automated Testing Pyramid

```
                    Golden Tests
                  (Tetris title screen)
                /                      \
          Integration Tests          Blargg Tests
        (Multi-component)          (CPU validation)
       /                  \            /         \
   Unit Tests          Unit Tests   Unit Tests   Unit Tests
  (Decoder)            (MMU)        (PPU)        (Transpiler)
```

### Test Types

#### 1. Unit Tests
- Test individual functions in isolation
- Fast, numerous, granular
- Cover all edge cases
- Example: "Instruction decoder handles opcode 0x3E"

#### 2. Integration Tests
- Test multiple components together
- Medium speed, moderate number
- Verify interactions
- Example: "MMU + PPU render a test pattern"

#### 3. Golden Tests
- Pixel-perfect frame comparison
- Slow, few, high confidence
- Compare with reference emulator output
- Example: "Tetris title screen matches reference"

#### 4. Blargg Tests
- Industry-standard CPU test ROMs
- Verify CPU instruction correctness
- Serial output verification
- Example: "cpu_instrs test ROM passes"

### Continuous Verification

**Every Code Change**:
1. Run unit tests (fast, < 1s)
2. Run integration tests (medium, < 10s)
3. Run Blargg tests (slow, < 60s)
4. Run golden tests (slowest, < 120s)

**Prevent Regressions**:
- All tests must pass before merging
- Code coverage > 90%
- No unknown opcodes in Tetris

---

## Key Challenges and Solutions

### Challenge 1: Indirect Jumps
**Problem**: `JP (HL)` can jump to any address computed at runtime.
**Solution**: 
- Conservatively analyze common patterns (jump tables)
- Generate dispatch code for unknown targets
- Fall back to interpreter for truly dynamic jumps

### Challenge 2: Self-Modifying Code
**Problem**: Game could write to ROM area and modify instructions.
**Solution**:
- Game Boy ROM is read-only (enforced by MMU)
- Only RAM can be modified
- No self-modifying code in typical games

### Challenge 3: Cycle Accuracy
**Problem**: Hardware timing must be exact for correct behavior.
**Solution**:
- Track cycles per instruction
- Step PPU/Timer by exact cycle count
- Use scheduler for precise event timing

### Challenge 4: Interrupts
**Problem**: Interrupts can fire between any two instructions.
**Solution**:
- Check interrupts between basic blocks
- Generate interrupt dispatch code
- Handle EI delay (IME enabled after next instruction)

### Challenge 5: Generated Code Size
**Problem**: Recompiled code can be very large (MB range).
**Solution**:
- Minify generated JavaScript
- Inline hot paths, extract cold paths
- Use compact variable names

---

## Expected Outcomes

### Performance
- **Recompilation time**: < 1 second for Tetris ROM
- **Runtime FPS**: 60 FPS (hardware accurate)
- **Generated code size**: ~500KB for Tetris (minified)

### Correctness
- ✓ Tetris boots correctly
- ✓ Nintendo logo scrolls
- ✓ Title screen displays pixel-perfect
- ✓ All Blargg CPU tests pass
- ✓ No unknown opcodes
- ✓ Audio plays (simplified)

### Code Quality
- TypeScript strict mode enabled
- 90%+ test coverage
- Clean, documented codebase
- Maintainable architecture

---

## Project Structure

```
ai-gb-rec/
├── src/
│   ├── loader/
│   │   └── ROMLoader.ts
│   ├── decoder/
│   │   └── InstructionDecoder.ts
│   ├── analyzer/
│   │   ├── ROMAnalyzer.ts
│   │   ├── BasicBlockAnalyzer.ts
│   │   └── ControlFlowGraph.ts
│   ├── recompiler/
│   │   ├── InstructionTranspiler.ts
│   │   ├── BasicBlockGenerator.ts
│   │   ├── CodeEmitter.ts
│   │   └── ROMRecompiler.ts
│   ├── runtime/
│   │   ├── MMU.ts
│   │   ├── PPU.ts
│   │   ├── CPUState.ts
│   │   ├── InterruptController.ts
│   │   ├── Timer.ts
│   │   ├── Joypad.ts
│   │   └── Scheduler.ts
│   └── main.ts
├── tests/
│   ├── unit/
│   │   ├── ROMLoader.test.ts
│   │   ├── InstructionDecoder.test.ts
│   │   ├── InstructionTranspiler.test.ts
│   │   ├── MMU.test.ts
│   │   └── PPU.test.ts
│   ├── integration/
│   │   ├── CodeGeneration.test.ts
│   │   ├── FullSystem.test.ts
│   │   └── Interrupts.test.ts
│   ├── golden/
│   │   ├── TetrisBoot.test.ts
│   │   ├── TetrisTitle.test.ts
│   │   └── golden-frames/
│   │       └── tetris-title.png
│   └── blargg/
│       ├── cpu_instrs.test.ts
│       └── test-roms/
│           └── cpu_instrs.gb
├── public/
│   └── index.html
├── dist/
│   └── (generated files)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── PLAN.md (this file)
└── README.md
```

---

## Milestones and Timeline

### Milestone 1: Foundation (Phases 1-3)
- **Duration**: 3-4 days
- **Deliverable**: ROM loader, decoder, basic transpiler
- **Verification**: All unit tests pass

### Milestone 2: Runtime Infrastructure (Phases 4-7)
- **Duration**: 4-5 days
- **Deliverable**: MMU, PPU, interrupts, timer, joypad
- **Verification**: Integration tests pass, simple test ROMs work

### Milestone 3: Full Recompilation (Phase 8)
- **Duration**: 2-3 days
- **Deliverable**: Complete standalone JavaScript generation
- **Verification**: Simple ROMs recompile and run

### Milestone 4: Optimization and Testing (Phases 9-10)
- **Duration**: 3-4 days
- **Deliverable**: Cycle-accurate timing, comprehensive test suite
- **Verification**: Blargg tests pass, golden tests pass

### Milestone 5: Tetris Integration (Phase 11)
- **Duration**: 2-3 days
- **Deliverable**: Tetris title screen working
- **Verification**: Pixel-perfect title screen match

### Milestone 6: Polish and Documentation (Phase 12)
- **Duration**: 1-2 days
- **Deliverable**: Complete documentation, final verification
- **Verification**: All tests pass, clean codebase

**Total Estimated Duration**: 15-20 days

---

## Success Criteria

The project is considered successful when:

1. ✅ **Tetris ROM recompiles** to standalone JavaScript
2. ✅ **No dependency on ROM** after recompilation
3. ✅ **Title screen displays** pixel-perfect
4. ✅ **All automated tests pass** (unit, integration, golden, Blargg)
5. ✅ **60 FPS rendering** (hardware accurate timing)
6. ✅ **Clean codebase** with documentation
7. ✅ **100% custom recompiler** (no external libraries for bytecode/recompilation)

---

## References

- [Pan Docs](https://gbdev.io/pandocs/) - Comprehensive Game Boy technical documentation
- [Game Boy CPU Manual](http://marc.rawer.de/Gameboy/Docs/GBCPUman.pdf) - CPU instruction reference
- [Blargg's Test ROMs](https://github.com/retrio/gb-test-roms) - Industry-standard test suite
- [Game Boy Programming Manual](https://archive.org/details/GameBoyProgManVer1.1) - Official Nintendo documentation

---

## Conclusion

This plan provides a structured, testable approach to building a Game Boy dynamic recompiler emulator. By breaking the project into discrete phases with clear verification criteria, we can ensure correctness at every step. The end result will be a novel emulator architecture that transpiles ROM bytecode to JavaScript, with the Tetris title screen as our ultimate verification milestone.

The key innovation is the dynamic recompiler, which analyzes ROM code structure and generates optimized JavaScript functions for each basic block. This approach provides better performance than interpretation while maintaining accuracy through comprehensive automated testing.
