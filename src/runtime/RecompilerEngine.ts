import { CPUState } from './CPUState';
import { MMU } from './MMU';
import { PPU } from './PPU';
import { Interpreter } from './Interpreter';
import { ROM } from '../loader/ROMLoader';
import { CodeDatabase, analyzeBasicBlocksWithTargets, analyzeBlockWithTargetsAt } from '../analyzer/BasicBlockAnalyzer';
import { buildControlFlowGraph } from '../analyzer/ControlFlowGraph';
import { FlagAnalyzer } from '../analyzer/FlagAnalyzer';
import { RegisterAnalyzer } from '../analyzer/RegisterAnalyzer';
import { ConstantAnalyzer } from '../analyzer/ConstantAnalyzer';
import { transpileBlock } from '../recompiler/BlockTranspiler';

/**
 * Result from executing a recompiled block
 */
export interface BlockExecutionResult {
  nextBlock: number | null;  // Next block address to execute, null = halt/stop
  cycles: number;             // Cycles consumed by this block
  exit?: 'halt' | 'return' | 'interrupt';  // Special exit conditions
}

/**
 * Compiled block function signature
 */
export type CompiledBlock = (state: CPUState, mmu: MMU) => BlockExecutionResult;

/**
 * Statistics about recompiler performance
 */
export interface RecompilerStats {
  blocksCompiled: number;
  blocksExecuted: number;
  instructionsExecuted: number;
  totalCycles: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Dynamic recompiler execution engine
 * 
 * Compiles Game Boy blocks to JavaScript functions and executes them.
 */
export class RecompilerEngine {
  private state: CPUState;
  private mmu: MMU;
  private ppu: PPU;
  private rom: ROM;
  
  // Analysis results
  private database: CodeDatabase;
  private flagAnalyzer: FlagAnalyzer;
  private registerAnalyzer: RegisterAnalyzer;
  private constantAnalyzer: ConstantAnalyzer;
  
  // Compiled block cache
  private compiledBlocks = new Map<number, CompiledBlock>();
  
  // Statistics
  private stats: RecompilerStats = {
    blocksCompiled: 0,
    blocksExecuted: 0,
    instructionsExecuted: 0,
    totalCycles: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  
  // Execution control
  private running = false;
  private maxCyclesPerFrame = 70224;  // ~59.7 Hz
  
  constructor(rom: ROM) {
    this.rom = rom;
    this.state = new CPUState();
    this.mmu = new MMU(rom.data);
    this.ppu = new PPU(this.mmu);
    
    // Perform static analysis
    console.log('Analyzing ROM...');
    this.database = analyzeBasicBlocksWithTargets(rom);
    const cfg = buildControlFlowGraph(this.database);
    
    console.log(`Found ${this.database.blocks.size} blocks`);
    
    // Run data flow analyses
    this.flagAnalyzer = new FlagAnalyzer(this.database.blocks, cfg);
    this.flagAnalyzer.analyze();
    
    this.registerAnalyzer = new RegisterAnalyzer(this.database.blocks, cfg);
    this.registerAnalyzer.analyze();
    
    this.constantAnalyzer = new ConstantAnalyzer(this.database.blocks, cfg);
    this.constantAnalyzer.analyze();
    
    console.log('Analysis complete');
  }
  
  /**
   * Reset the emulator
   */
  public reset(): void {
    this.state.reset();
    this.mmu.reset();
    this.ppu.reset();
    this.stats = {
      blocksCompiled: 0,
      blocksExecuted: 0,
      instructionsExecuted: 0,
      totalCycles: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }
  
  /**
   * Execute for one frame (~70224 cycles)
   */
  public executeFrame(): void {
    const targetCycles = this.state.cycles + this.maxCyclesPerFrame;
    
    while (this.state.cycles < targetCycles && !this.state.halted) {
      this.executeBlock();
      
      // Check for interrupts
      if (this.state.IME && this.checkInterrupts()) {
        this.handleInterrupt();
      }
    }
  }
  
  /**
   * Execute a single block
   */
  private executeBlock(): void {
    const blockAddress = this.state.PC;
    
    // Get or compile block
    let block = this.compiledBlocks.get(blockAddress);
    
    if (!block) {
      this.stats.cacheMisses++;
      block = this.compileBlock(blockAddress);
      this.compiledBlocks.set(blockAddress, block);
      this.stats.blocksCompiled++;
    } else {
      this.stats.cacheHits++;
    }
    
    // Execute block
    this.stats.blocksExecuted++;
    const result = block(this.state, this.mmu);
    
    if (!result) {
      throw new Error(`Block at 0x${blockAddress.toString(16)} returned undefined`);
    }
    
    // Update state based on result
    this.state.cycles += result.cycles;
    this.stats.totalCycles += result.cycles;
    
    // Step PPU
    this.ppu.step(result.cycles);
    
    if (result.exit === 'halt') {
      this.state.halted = true;
    } else if (result.nextBlock !== null) {
      this.state.PC = result.nextBlock;
    }
    // else PC was already updated by block (e.g., return instruction)
  }
  
  /**
   * Compile a block to JavaScript
   */
  private compileBlock(address: number): CompiledBlock {
    let block = this.database.blocks.get(address);
    
    if (!block) {
      // Block not found in database - analyze it dynamically
      console.warn(`Block at 0x${address.toString(16)} not in database, analyzing dynamically`);
      
      // Only analyze blocks in ROM range (0x0000-0x7FFF)
      if (address < 0x8000 && address < this.rom.data.length) {
        block = analyzeBlockWithTargetsAt(this.rom.data, address, this.database.jumpTargets) || undefined;
        
        if (block) {
          block.id = address;
          this.database.blocks.set(address, block);
          console.log(`Dynamically discovered block at 0x${address.toString(16)} with ${block.instructions.length} instructions`);
        } else {
          console.error(`Failed to analyze block at 0x${address.toString(16)}`);
          return this.createFallbackBlock(address);
        }
      } else {
        // Code in RAM (VRAM/WRAM/etc) - use interpreter fallback
        console.warn(`Block at 0x${address.toString(16)} is in RAM, using interpreter fallback`);
        return this.createFallbackBlock(address);
      }
    }
    
    try {
      // Transpile block with optimizations
      const jsCode = transpileBlock(block, this.rom.data, {
        flagAnalyzer: this.flagAnalyzer,
        registerAnalyzer: this.registerAnalyzer,
        constantAnalyzer: this.constantAnalyzer,
      });
      
      // Wrap in function with helper functions
      const functionBody = `
        "use strict";
        let cycles = 0;
        
        // Helper functions for ALU operations
        const inc8 = (state, val) => {
          const result = (val + 1) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH((val & 0xF) === 0xF);
          return result;
        };
        
        const dec8 = (state, val) => {
          const result = (val - 1) & 0xFF;
          state.setZ(result === 0);
          state.setN(true);
          state.setH((val & 0xF) === 0);
          return result;
        };
        
        const add8 = (state, a, b) => {
          const result = (a + b) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH((a & 0xF) + (b & 0xF) > 0xF);
          state.setC(a + b > 0xFF);
          return result;
        };
        
        const adc8 = (state, a, b) => {
          const carry = state.getC() ? 1 : 0;
          const result = (a + b + carry) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH((a & 0xF) + (b & 0xF) + carry > 0xF);
          state.setC(a + b + carry > 0xFF);
          return result;
        };
        
        const sub8 = (state, a, b) => {
          const result = (a - b) & 0xFF;
          state.setZ(result === 0);
          state.setN(true);
          state.setH((a & 0xF) < (b & 0xF));
          state.setC(a < b);
          return result;
        };
        
        const sbc8 = (state, a, b) => {
          const carry = state.getC() ? 1 : 0;
          const result = (a - b - carry) & 0xFF;
          state.setZ(result === 0);
          state.setN(true);
          state.setH((a & 0xF) < (b & 0xF) + carry);
          state.setC(a < b + carry);
          return result;
        };
        
        const and8 = (state, a, b) => {
          const result = a & b;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(true);
          state.setC(false);
          return result;
        };
        
        const xor8 = (state, a, b) => {
          const result = a ^ b;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(false);
          return result;
        };
        
        const or8 = (state, a, b) => {
          const result = a | b;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(false);
          return result;
        };
        
        const cp8 = (state, a, b) => {
          state.setZ(a === b);
          state.setN(true);
          state.setH((a & 0xF) < (b & 0xF));
          state.setC(a < b);
        };
        
        const addHL = (state, hl, val) => {
          const result = (hl + val) & 0xFFFF;
          state.setN(false);
          state.setH((hl & 0xFFF) + (val & 0xFFF) > 0xFFF);
          state.setC(hl + val > 0xFFFF);
          return result;
        };
        
        const daa = (state) => {
          let a = state.A;
          if (!state.getN()) {
            if (state.getC() || a > 0x99) {
              a += 0x60;
              state.setC(true);
            }
            if (state.getH() || (a & 0x0F) > 0x09) {
              a += 0x06;
            }
          } else {
            if (state.getC()) a -= 0x60;
            if (state.getH()) a -= 0x06;
          }
          a &= 0xFF;
          state.A = a;
          state.setZ(a === 0);
          state.setH(false);
        };
        
        const swap = (state, val) => {
          const result = ((val & 0x0F) << 4) | ((val & 0xF0) >> 4);
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(false);
          return result;
        };
        
        const sla = (state, val) => {
          const carry = (val >> 7) & 1;
          const result = (val << 1) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const sra = (state, val) => {
          const carry = val & 1;
          const result = ((val >> 1) | (val & 0x80)) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const srl = (state, val) => {
          const carry = val & 1;
          const result = (val >> 1) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const rlc = (state, val) => {
          const carry = (val >> 7) & 1;
          const result = ((val << 1) | carry) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const rrc = (state, val) => {
          const carry = val & 1;
          const result = ((val >> 1) | (carry << 7)) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const rl = (state, val) => {
          const oldCarry = state.getC() ? 1 : 0;
          const carry = (val >> 7) & 1;
          const result = ((val << 1) | oldCarry) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        const rr = (state, val) => {
          const oldCarry = state.getC() ? 1 : 0;
          const carry = val & 1;
          const result = ((val >> 1) | (oldCarry << 7)) & 0xFF;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(false);
          state.setC(carry === 1);
          return result;
        };
        
        // Bit operations
        const bit = (state, bitNum, val) => {
          const result = (val >> bitNum) & 1;
          state.setZ(result === 0);
          state.setN(false);
          state.setH(true);
        };
        
        const set = (state, bitNum, val) => {
          return val | (1 << bitNum);
        };
        
        const res = (state, bitNum, val) => {
          return val & ~(1 << bitNum);
        };
        
        ${jsCode}
      `;
      
      // Create function with state and mmu parameters
      const compiledFn = new Function('state', 'mmu', functionBody) as CompiledBlock;
      
      return compiledFn;
    } catch (error) {
      console.error(`Failed to compile block at 0x${address.toString(16)}:`, error);
      return this.createFallbackBlock(address);
    }
  }
  
  /**
   * Create a fallback interpreter block for when compilation fails
   */
  private createFallbackBlock(address: number): CompiledBlock {
    return (state: CPUState, mmu: MMU): BlockExecutionResult => {
      // Use interpreter to execute single instruction
      const cycles = Interpreter.executeInstruction(state, mmu);
      
      return {
        nextBlock: state.PC,
        cycles,
      };
    };
  }
  
  /**
   * Check if any interrupts are pending
   */
  private checkInterrupts(): boolean {
    const IF = this.mmu.getIO(0x0F);  // Interrupt Flag
    const IE = this.mmu.getIO(0xFF);  // Interrupt Enable (actually at 0xFFFF)
    
    return (IF & IE & 0x1F) !== 0;
  }
  
  /**
   * Handle interrupt
   */
  private handleInterrupt(): void {
    const IF = this.mmu.getIO(0x0F);
    const IE = this.mmu.getIO(0xFF);
    
    // Priority order: VBlank, LCD STAT, Timer, Serial, Joypad
    const interrupts = [
      { bit: 0x01, vector: 0x40 },  // VBlank
      { bit: 0x02, vector: 0x48 },  // LCD STAT
      { bit: 0x04, vector: 0x50 },  // Timer
      { bit: 0x08, vector: 0x58 },  // Serial
      { bit: 0x10, vector: 0x60 },  // Joypad
    ];
    
    for (const int of interrupts) {
      if ((IF & IE & int.bit) !== 0) {
        // Disable interrupts
        this.state.IME = false;
        this.state.halted = false;
        
        // Clear interrupt flag
        this.mmu.setIO(0x0F, IF & ~int.bit);
        
        // Push PC to stack
        this.state.SP = (this.state.SP - 2) & 0xFFFF;
        this.mmu.write16(this.state.SP, this.state.PC);
        
        // Jump to interrupt vector
        this.state.PC = int.vector;
        
        // Add cycles
        this.state.cycles += 20;
        
        break;
      }
    }
  }
  
  /**
   * Run until halted or max cycles reached
   */
  public run(maxCycles: number = 1000000): void {
    this.running = true;
    const startCycles = this.state.cycles;
    
    while (this.running && !this.state.halted && (this.state.cycles - startCycles) < maxCycles) {
      this.executeBlock();
      
      if (this.state.IME && this.checkInterrupts()) {
        this.handleInterrupt();
      }
    }
  }
  
  /**
   * Stop execution
   */
  public stop(): void {
    this.running = false;
  }
  
  /**
   * Step one block
   */
  public step(): void {
    this.executeBlock();
  }
  
  /**
   * Get current CPU state
   */
  public getState(): CPUState {
    return this.state;
  }
  
  /**
   * Get MMU
   */
  public getMMU(): MMU {
    return this.mmu;
  }
  
  /**
   * Get PPU
   */
  public getPPU(): PPU {
    return this.ppu;
  }
  
  /**
   * Get statistics
   */
  public getStats(): RecompilerStats {
    return { ...this.stats };
  }
  
  /**
   * Print statistics
   */
  public printStats(): void {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : '0.00';
    
    console.log('\n=== Recompiler Statistics ===');
    console.log(`Blocks compiled: ${this.stats.blocksCompiled}`);
    console.log(`Blocks executed: ${this.stats.blocksExecuted}`);
    console.log(`Instructions executed: ${this.stats.instructionsExecuted}`);
    console.log(`Total cycles: ${this.stats.totalCycles}`);
    console.log(`Cache hits: ${this.stats.cacheHits}`);
    console.log(`Cache misses: ${this.stats.cacheMisses}`);
    console.log(`Cache hit rate: ${hitRate}%`);
  }
}
