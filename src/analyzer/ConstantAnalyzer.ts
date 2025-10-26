import { Instruction } from "../decoder/InstructionDecoder.js";
import { BasicBlock } from "./BasicBlockAnalyzer.js";
import { ControlFlowGraph } from "./ControlFlowGraph.js";
import { Register } from "./RegisterAnalyzer.js";

/**
 * Represents a constant value or unknown
 */
export type ConstantValue = 
  | { type: 'constant', value: number }
  | { type: 'unknown' }
  | { type: 'bottom' };  // Uninitialized

/**
 * State of all registers at a program point
 */
export interface RegisterState {
  A: ConstantValue;
  B: ConstantValue;
  C: ConstantValue;
  D: ConstantValue;
  E: ConstantValue;
  H: ConstantValue;
  L: ConstantValue;
  F: ConstantValue;
  SP: ConstantValue;
}

/**
 * Constant information for a basic block
 */
export interface BlockConstantInfo {
  blockId: number;
  stateIn: RegisterState;   // Register state at block entry
  stateOut: RegisterState;  // Register state at block exit
  instructionStates: Map<number, RegisterState>; // State before each instruction
}

/**
 * Analyzes constant values through program flow
 */
export class ConstantAnalyzer {
  private blockConstantInfo = new Map<number, BlockConstantInfo>();

  constructor(
    private blocks: Map<number, BasicBlock>,
    private cfg: ControlFlowGraph
  ) {}

  /**
   * Run constant propagation analysis
   */
  public analyze(): void {
    // Initialize all blocks with bottom (uninitialized) state
    for (const block of this.blocks.values()) {
      const blockId = block.startAddress;
      this.blockConstantInfo.set(blockId, {
        blockId,
        stateIn: this.createBottomState(),
        stateOut: this.createBottomState(),
        instructionStates: new Map(),
      });
    }

    // Entry point starts with unknown values
    const entryBlock = this.blockConstantInfo.get(this.cfg.entryPoint);
    if (entryBlock) {
      entryBlock.stateIn = this.createUnknownState();
    }

    // Forward data flow analysis until fixpoint
    let changed = true;
    let iterations = 0;
    const maxIterations = 1000;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // Process blocks in topological order for faster convergence
      const sortedBlocks = Array.from(this.blocks.keys());

      for (const blockId of sortedBlocks) {
        const block = this.blocks.get(blockId);
        if (!block) continue;

        const blockInfo = this.blockConstantInfo.get(blockId)!;
        
        // Merge predecessor states
        const newStateIn = this.mergePredecessorStates(blockId);
        
        if (!this.statesEqual(blockInfo.stateIn, newStateIn)) {
          blockInfo.stateIn = newStateIn;
          changed = true;
        }

        // Propagate through block
        let currentState = { ...blockInfo.stateIn };

        for (let i = 0; i < block.instructions.length; i++) {
          const instr = block.instructions[i];
          blockInfo.instructionStates.set(i, { ...currentState });
          
          // Apply instruction effect
          currentState = this.applyInstruction(instr, currentState);
        }

        if (!this.statesEqual(blockInfo.stateOut, currentState)) {
          blockInfo.stateOut = currentState;
          changed = true;
        }
      }
    }

    if (iterations >= maxIterations) {
      console.warn("Constant propagation did not converge");
    }
  }

  /**
   * Get the constant value of a register before an instruction (if known)
   */
  public getConstantValue(blockId: number, instructionIndex: number, register: Register): ConstantValue {
    const blockInfo = this.blockConstantInfo.get(blockId);
    if (!blockInfo) return { type: 'unknown' };

    const state = blockInfo.instructionStates.get(instructionIndex);
    if (!state) return { type: 'unknown' };

    return state[register];
  }

  /**
   * Check if a register has a known constant value at a point
   */
  public isConstant(blockId: number, instructionIndex: number, register: Register): boolean {
    const value = this.getConstantValue(blockId, instructionIndex, register);
    return value.type === 'constant';
  }

  /**
   * Merge states from all predecessor blocks
   */
  private mergePredecessorStates(blockId: number): RegisterState {
    const cfgNode = this.cfg.nodes.get(blockId);
    if (!cfgNode || cfgNode.predecessors.size === 0) {
      // No predecessors - use current stateIn or unknown
      const currentInfo = this.blockConstantInfo.get(blockId);
      return currentInfo ? { ...currentInfo.stateIn } : this.createUnknownState();
    }

    // Merge all predecessor states
    let merged: RegisterState | null = null;

    for (const predId of cfgNode.predecessors) {
      const predInfo = this.blockConstantInfo.get(predId);
      if (!predInfo) continue;

      if (merged === null) {
        merged = { ...predInfo.stateOut };
      } else {
        merged = this.mergeStates(merged, predInfo.stateOut);
      }
    }

    return merged || this.createUnknownState();
  }

  /**
   * Merge two register states (meet operation in lattice)
   */
  private mergeStates(state1: RegisterState, state2: RegisterState): RegisterState {
    const merged: RegisterState = {} as RegisterState;

    for (const reg of Object.keys(state1) as Register[]) {
      merged[reg] = this.mergeValues(state1[reg], state2[reg]);
    }

    return merged;
  }

  /**
   * Merge two constant values
   */
  private mergeValues(val1: ConstantValue, val2: ConstantValue): ConstantValue {
    // Bottom + X = X
    if (val1.type === 'bottom') return val2;
    if (val2.type === 'bottom') return val1;

    // Unknown + X = Unknown
    if (val1.type === 'unknown' || val2.type === 'unknown') {
      return { type: 'unknown' };
    }

    // Constant + same Constant = Constant
    if (val1.type === 'constant' && val2.type === 'constant') {
      if (val1.value === val2.value) {
        return val1;
      }
      // Different constants = Unknown
      return { type: 'unknown' };
    }

    return { type: 'unknown' };
  }

  /**
   * Apply an instruction's effect on register state
   */
  private applyInstruction(instr: Instruction, state: RegisterState): RegisterState {
    const newState = { ...state };
    const mnemonic = instr.mnemonic.toUpperCase();
    const parts = mnemonic.split(/[\s,]+/).filter(p => p.length > 0);

    // LD r, n - load immediate
    if (mnemonic.startsWith('LD ') && mnemonic.includes(', N')) {
      const reg = parts[1] as Register;
      // Need to extract actual immediate value from instruction bytes
      // For now, mark as unknown since we don't have access to bytes here
      if (reg in newState) {
        newState[reg] = { type: 'unknown' };
      }
      return newState;
    }

    // LD r, r' - register copy
    if (mnemonic.startsWith('LD ') && !mnemonic.includes('(') && !mnemonic.includes('N')) {
      const dst = parts[1] as Register;
      const src = parts[2] as Register;
      if (dst in newState && src in newState) {
        newState[dst] = state[src];
      }
      return newState;
    }

    // XOR A, A - always results in 0
    if (mnemonic === 'XOR A') {
      newState.A = { type: 'constant', value: 0 };
      newState.F = { type: 'unknown' }; // Flags set but we don't track them precisely
      return newState;
    }

    // INC r - increment
    if (mnemonic.startsWith('INC ') && parts[1].length === 1) {
      const reg = parts[1] as Register;
      if (reg in newState && state[reg].type === 'constant') {
        newState[reg] = { 
          type: 'constant', 
          value: (state[reg].value + 1) & 0xFF 
        };
      } else {
        newState[reg] = { type: 'unknown' };
      }
      newState.F = { type: 'unknown' };
      return newState;
    }

    // DEC r - decrement
    if (mnemonic.startsWith('DEC ') && parts[1].length === 1) {
      const reg = parts[1] as Register;
      if (reg in newState && state[reg].type === 'constant') {
        newState[reg] = { 
          type: 'constant', 
          value: (state[reg].value - 1) & 0xFF 
        };
      } else {
        newState[reg] = { type: 'unknown' };
      }
      newState.F = { type: 'unknown' };
      return newState;
    }

    // ADD A, r
    if (mnemonic.startsWith('ADD A,')) {
      const src = parts[parts.length - 1] as Register;
      if (state.A.type === 'constant' && src in state && state[src].type === 'constant') {
        newState.A = {
          type: 'constant',
          value: (state.A.value + state[src].value) & 0xFF
        };
      } else {
        newState.A = { type: 'unknown' };
      }
      newState.F = { type: 'unknown' };
      return newState;
    }

    // SUB A, r or SUB r
    if (mnemonic.startsWith('SUB ')) {
      const src = parts[parts.length - 1] as Register;
      if (state.A.type === 'constant' && src in state && state[src].type === 'constant') {
        newState.A = {
          type: 'constant',
          value: (state.A.value - state[src].value) & 0xFF
        };
      } else {
        newState.A = { type: 'unknown' };
      }
      newState.F = { type: 'unknown' };
      return newState;
    }

    // AND, OR, XOR
    if (mnemonic.startsWith('AND ') || mnemonic.startsWith('OR ') || mnemonic.startsWith('XOR ')) {
      const src = parts[parts.length - 1] as Register;
      if (state.A.type === 'constant' && src in state && state[src].type === 'constant') {
        let result: number;
        if (mnemonic.startsWith('AND')) {
          result = state.A.value & state[src].value;
        } else if (mnemonic.startsWith('OR')) {
          result = state.A.value | state[src].value;
        } else { // XOR
          result = state.A.value ^ state[src].value;
        }
        newState.A = { type: 'constant', value: result & 0xFF };
      } else {
        newState.A = { type: 'unknown' };
      }
      newState.F = { type: 'unknown' };
      return newState;
    }

    // For any other instruction that writes a register, mark it unknown
    // This is conservative but correct
    for (const reg of Object.keys(newState) as Register[]) {
      if (this.instructionWrites(mnemonic, reg)) {
        newState[reg] = { type: 'unknown' };
      }
    }

    return newState;
  }

  /**
   * Check if instruction writes to a register
   */
  private instructionWrites(mnemonic: string, register: Register): boolean {
    // Conservative check
    return mnemonic.includes(register) && 
           (mnemonic.startsWith('LD ') || mnemonic.startsWith('POP '));
  }

  /**
   * Create a state where all registers are bottom (uninitialized)
   */
  private createBottomState(): RegisterState {
    return {
      A: { type: 'bottom' },
      B: { type: 'bottom' },
      C: { type: 'bottom' },
      D: { type: 'bottom' },
      E: { type: 'bottom' },
      H: { type: 'bottom' },
      L: { type: 'bottom' },
      F: { type: 'bottom' },
      SP: { type: 'bottom' },
    };
  }

  /**
   * Create a state where all registers are unknown
   */
  private createUnknownState(): RegisterState {
    return {
      A: { type: 'unknown' },
      B: { type: 'unknown' },
      C: { type: 'unknown' },
      D: { type: 'unknown' },
      E: { type: 'unknown' },
      H: { type: 'unknown' },
      L: { type: 'unknown' },
      F: { type: 'unknown' },
      SP: { type: 'unknown' },
    };
  }

  /**
   * Check if two states are equal
   */
  private statesEqual(state1: RegisterState, state2: RegisterState): boolean {
    for (const reg of Object.keys(state1) as Register[]) {
      if (!this.valuesEqual(state1[reg], state2[reg])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if two constant values are equal
   */
  private valuesEqual(val1: ConstantValue, val2: ConstantValue): boolean {
    if (val1.type !== val2.type) return false;
    if (val1.type === 'constant' && val2.type === 'constant') {
      return val1.value === val2.value;
    }
    return true;
  }

  /**
   * Get debug information
   */
  public getDebugInfo(blockId: number): string {
    const blockInfo = this.blockConstantInfo.get(blockId);
    if (!blockInfo) return "No constant info available";

    const lines: string[] = [];
    lines.push(`Block ${blockId}:`);
    lines.push(`  State In:  ${this.stateToString(blockInfo.stateIn)}`);
    lines.push(`  State Out: ${this.stateToString(blockInfo.stateOut)}`);

    const block = this.blocks.get(blockId);
    if (block) {
      lines.push(`  Instructions:`);
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const state = blockInfo.instructionStates.get(i);
        
        lines.push(`    [${i}] ${instr.mnemonic}`);
        if (state) {
          lines.push(`        State: ${this.stateToString(state)}`);
        }
      }
    }

    return lines.join("\n");
  }

  private stateToString(state: RegisterState): string {
    const parts: string[] = [];
    for (const [reg, val] of Object.entries(state)) {
      if (val.type === 'constant') {
        parts.push(`${reg}=${val.value}`);
      } else if (val.type === 'unknown') {
        parts.push(`${reg}=?`);
      }
    }
    return parts.length > 0 ? parts.join(', ') : '(all unknown)';
  }
}
