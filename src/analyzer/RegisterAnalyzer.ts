import { Instruction } from "../decoder/InstructionDecoder.js";
import { BasicBlock } from "./BasicBlockAnalyzer.js";
import { ControlFlowGraph } from "./ControlFlowGraph.js";

/**
 * Game Boy CPU registers
 */
export enum Register {
  A = "A",
  B = "B",
  C = "C",
  D = "D",
  E = "E",
  H = "H",
  L = "L",
  F = "F",  // Flag register
  SP = "SP",
}

/**
 * Register behavior for an instruction
 */
export interface RegisterBehavior {
  reads: Set<Register>;   // Registers this instruction reads
  writes: Set<Register>;  // Registers this instruction writes/kills
}

/**
 * Register liveness information for a basic block
 */
export interface BlockRegisterInfo {
  blockId: number;
  liveIn: Set<Register>;  // Registers that must be live at block entry
  liveOut: Set<Register>; // Registers that must be live at block exit
  instructionLiveness: Map<number, Set<Register>>; // Live registers after each instruction index
}

/**
 * Analyzes register usage and determines which register writes are necessary
 */
export class RegisterAnalyzer {
  private registerBehaviors = new Map<string, RegisterBehavior>();  // key: "blockId:instrIndex"
  private blockRegisterInfo = new Map<number, BlockRegisterInfo>();

  constructor(
    private blocks: Map<number, BasicBlock>,
    private cfg: ControlFlowGraph
  ) {}

  /**
   * Run complete register liveness analysis
   */
  public analyze(): void {
    // Step 1: Determine register behavior for each instruction
    this.analyzeRegisterBehaviors();

    // Step 2: Compute register liveness via backward data flow analysis
    this.computeRegisterLiveness();
  }

  /**
   * Check if a register write at the given instruction is live (needed)
   */
  public isRegisterWriteLive(blockId: number, instructionIndex: number, register: Register): boolean {
    const blockInfo = this.blockRegisterInfo.get(blockId);
    if (!blockInfo) return true; // Conservative: assume live if not analyzed

    const liveRegs = blockInfo.instructionLiveness.get(instructionIndex);
    if (!liveRegs) return true;

    return liveRegs.has(register);
  }

  /**
   * Get all live registers after an instruction
   */
  public getLiveRegistersAfter(blockId: number, instructionIndex: number): Set<Register> {
    const blockInfo = this.blockRegisterInfo.get(blockId);
    if (!blockInfo) {
      return new Set([Register.A, Register.B, Register.C, Register.D, Register.E, Register.H, Register.L, Register.SP]);
    }

    return blockInfo.instructionLiveness.get(instructionIndex) || new Set();
  }

  /**
   * Step 1: Analyze each instruction to determine register behavior
   */
  private analyzeRegisterBehaviors(): void {
    for (const block of this.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const behavior = this.getInstructionRegisterBehavior(instr);
        const key = `${block.id}:${i}`;
        this.registerBehaviors.set(key, behavior);
      }
    }
  }

  /**
   * Determine register behavior for a single instruction
   */
  private getInstructionRegisterBehavior(instr: Instruction): RegisterBehavior {
    const reads = new Set<Register>();
    const writes = new Set<Register>();

    const mnemonic = instr.mnemonic.toUpperCase();

    // Parse common patterns
    const parts = mnemonic.split(/[\s,]+/).filter(p => p.length > 0);

    // LD instructions
    if (mnemonic.startsWith("LD ")) {
      const dst = this.parseRegisterOperand(parts[1]);
      const src = this.parseRegisterOperand(parts[2]);

      if (dst) writes.add(dst);
      if (src) reads.add(src);

      // LD (HL), r or LD r, (HL) - reads HL
      if (mnemonic.includes("(HL)")) {
        reads.add(Register.H);
        reads.add(Register.L);
      }
      // LD (BC), A etc.
      if (mnemonic.includes("(BC)")) {
        reads.add(Register.B);
        reads.add(Register.C);
      }
      if (mnemonic.includes("(DE)")) {
        reads.add(Register.D);
        reads.add(Register.E);
      }
      // LD (HL+) / LD (HL-) - also writes HL
      if (mnemonic.includes("(HL+)") || mnemonic.includes("(HL-)")) {
        writes.add(Register.H);
        writes.add(Register.L);
      }
      // LD HL, SP+r8
      if (mnemonic.includes("HL, SP")) {
        reads.add(Register.SP);
      }
      return { reads, writes };
    }

    // ALU operations: ADD, ADC, SUB, SBC, AND, XOR, OR, CP
    if (mnemonic.startsWith("ADD") || mnemonic.startsWith("ADC") || 
        mnemonic.startsWith("SUB") || mnemonic.startsWith("SBC") ||
        mnemonic.startsWith("AND") || mnemonic.startsWith("XOR") ||
        mnemonic.startsWith("OR") || mnemonic.startsWith("CP")) {
      
      reads.add(Register.A);
      if (!mnemonic.startsWith("CP")) {
        writes.add(Register.A); // CP doesn't write to A
      }

      // Read source register
      const src = this.parseRegisterOperand(parts[parts.length - 1]);
      if (src && src !== Register.A) reads.add(src);

      // ADD HL, rr
      if (mnemonic.startsWith("ADD HL")) {
        reads.add(Register.H);
        reads.add(Register.L);
        writes.add(Register.H);
        writes.add(Register.L);
        
        const src = this.parseRegisterOperand(parts[2]);
        if (src) reads.add(src);
      }

      // Handle (HL) indirection
      if (mnemonic.includes("(HL)")) {
        reads.add(Register.H);
        reads.add(Register.L);
      }

      // ADC/SBC read carry flag
      if (mnemonic.startsWith("ADC") || mnemonic.startsWith("SBC")) {
        reads.add(Register.F);
      }

      writes.add(Register.F); // All ALU ops write flags
      return { reads, writes };
    }

    // INC/DEC
    if (mnemonic.startsWith("INC") || mnemonic.startsWith("DEC")) {
      const reg = this.parseRegisterOperand(parts[1]);
      
      if (reg) {
        reads.add(reg);
        writes.add(reg);
      }

      // 16-bit INC/DEC (BC, DE, HL, SP)
      if (parts[1] === "BC" || parts[1] === "DE" || parts[1] === "HL") {
        const hi = parts[1][0] as Register;
        const lo = parts[1][1] as Register;
        reads.add(hi);
        reads.add(lo);
        writes.add(hi);
        writes.add(lo);
      } else if (parts[1] === "SP") {
        reads.add(Register.SP);
        writes.add(Register.SP);
      }

      // INC (HL) / DEC (HL)
      if (mnemonic.includes("(HL)")) {
        reads.add(Register.H);
        reads.add(Register.L);
      }

      // 8-bit INC/DEC write flags, 16-bit don't
      if (parts[1].length === 1) {
        writes.add(Register.F);
      }

      return { reads, writes };
    }

    // PUSH/POP
    if (mnemonic.startsWith("PUSH")) {
      const reg = parts[1];
      if (reg === "AF") {
        reads.add(Register.A);
        reads.add(Register.F);
      } else if (reg === "BC") {
        reads.add(Register.B);
        reads.add(Register.C);
      } else if (reg === "DE") {
        reads.add(Register.D);
        reads.add(Register.E);
      } else if (reg === "HL") {
        reads.add(Register.H);
        reads.add(Register.L);
      }
      reads.add(Register.SP);
      writes.add(Register.SP);
      return { reads, writes };
    }

    if (mnemonic.startsWith("POP")) {
      const reg = parts[1];
      if (reg === "AF") {
        writes.add(Register.A);
        writes.add(Register.F);
      } else if (reg === "BC") {
        writes.add(Register.B);
        writes.add(Register.C);
      } else if (reg === "DE") {
        writes.add(Register.D);
        writes.add(Register.E);
      } else if (reg === "HL") {
        writes.add(Register.H);
        writes.add(Register.L);
      }
      reads.add(Register.SP);
      writes.add(Register.SP);
      return { reads, writes };
    }

    // Conditional operations read flags
    if (mnemonic.includes(" NZ") || mnemonic.includes(" Z,") || 
        mnemonic.includes(" NC") || mnemonic.includes(" C,")) {
      reads.add(Register.F);
    }

    // JP (HL)
    if (mnemonic === "JP (HL)") {
      reads.add(Register.H);
      reads.add(Register.L);
    }

    // Rotate/shift operations
    if (mnemonic.startsWith("RLC") || mnemonic.startsWith("RRC") ||
        mnemonic.startsWith("RL") || mnemonic.startsWith("RR") ||
        mnemonic.startsWith("SLA") || mnemonic.startsWith("SRA") ||
        mnemonic.startsWith("SRL") || mnemonic.startsWith("SWAP")) {
      const reg = this.parseRegisterOperand(parts[1]);
      if (reg) {
        reads.add(reg);
        writes.add(reg);
      }
      if (mnemonic.includes("(HL)")) {
        reads.add(Register.H);
        reads.add(Register.L);
      }
      writes.add(Register.F);
      return { reads, writes };
    }

    // CPL, CCF, SCF
    if (mnemonic === "CPL") {
      reads.add(Register.A);
      writes.add(Register.A);
      writes.add(Register.F);
    }
    if (mnemonic === "CCF" || mnemonic === "SCF") {
      reads.add(Register.F);
      writes.add(Register.F);
    }

    // DAA
    if (mnemonic === "DAA") {
      reads.add(Register.A);
      reads.add(Register.F);
      writes.add(Register.A);
      writes.add(Register.F);
    }

    // CALL/RET read/write SP
    if (mnemonic.startsWith("CALL") || mnemonic.startsWith("RET") || mnemonic.startsWith("RST")) {
      reads.add(Register.SP);
      writes.add(Register.SP);
    }

    // RETI
    if (mnemonic === "RETI") {
      reads.add(Register.SP);
      writes.add(Register.SP);
    }

    return { reads, writes };
  }

  /**
   * Parse a register name from an operand string
   */
  private parseRegisterOperand(operand: string | undefined): Register | null {
    if (!operand) return null;

    const clean = operand.replace(/[(),]/g, "").trim();

    switch (clean) {
      case "A": return Register.A;
      case "B": return Register.B;
      case "C": return Register.C;
      case "D": return Register.D;
      case "E": return Register.E;
      case "H": return Register.H;
      case "L": return Register.L;
      case "F": return Register.F;
      case "SP": return Register.SP;
      default: return null;
    }
  }

  /**
   * Step 2: Compute register liveness via backward data flow analysis
   */
  private computeRegisterLiveness(): void {
    // Initialize block info
    for (const block of this.blocks.values()) {
      const blockId = block.startAddress;
      this.blockRegisterInfo.set(blockId, {
        blockId,
        liveIn: new Set(),
        liveOut: new Set(),
        instructionLiveness: new Map(),
      });
    }

    // Iterative backward data flow analysis until fixpoint
    let changed = true;
    let iterations = 0;
    const maxIterations = 1000;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // Process blocks in reverse order
      const sortedBlocks = Array.from(this.blocks.keys()).reverse();

      for (const blockId of sortedBlocks) {
        const block = this.blocks.get(blockId);
        if (!block) continue;

        const blockInfo = this.blockRegisterInfo.get(blockId)!;
        const oldLiveIn = new Set(blockInfo.liveIn);

        // liveOut = union of all successor liveIn
        const newLiveOut = new Set<Register>();
        const cfgNode = this.cfg.nodes.get(blockId);
        if (cfgNode) {
          for (const succId of cfgNode.successors) {
            const succInfo = this.blockRegisterInfo.get(succId);
            if (succInfo) {
              for (const reg of succInfo.liveIn) {
                newLiveOut.add(reg);
              }
            }
          }
        }

        // Backward pass through instructions
        let currentLive = new Set(newLiveOut);

        for (let i = block.instructions.length - 1; i >= 0; i--) {
          const instr = block.instructions[i];
          const key = `${blockId}:${i}`;
          const behavior = this.registerBehaviors.get(key);

          // Store live-after for this instruction (before updating)
          blockInfo.instructionLiveness.set(i, new Set(currentLive));

          if (behavior) {
            // Remove written registers (killed)
            for (const reg of behavior.writes) {
              currentLive.delete(reg);
            }

            // Add read registers (needed)
            for (const reg of behavior.reads) {
              currentLive.add(reg);
            }
          }
        }

        blockInfo.liveIn = currentLive;
        blockInfo.liveOut = newLiveOut;

        // Check if changed
        if (!this.setsEqual(oldLiveIn, blockInfo.liveIn)) {
          changed = true;
        }
      }
    }

    if (iterations >= maxIterations) {
      console.warn("Register liveness analysis did not converge");
    }
  }

  private setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  /**
   * Get debug information about register liveness
   */
  public getDebugInfo(blockId: number): string {
    const blockInfo = this.blockRegisterInfo.get(blockId);
    if (!blockInfo) return "No register info available";

    const lines: string[] = [];
    lines.push(`Block ${blockId}:`);
    lines.push(`  Live In:  ${Array.from(blockInfo.liveIn).join(", ") || "(none)"}`);
    lines.push(`  Live Out: ${Array.from(blockInfo.liveOut).join(", ") || "(none)"}`);

    const block = this.blocks.get(blockId);
    if (block) {
      lines.push(`  Instructions:`);
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const liveAfter = blockInfo.instructionLiveness.get(i);
        
        lines.push(`    [${i}] ${instr.mnemonic}`);
        const key = `${blockId}:${i}`;
        const behavior = this.registerBehaviors.get(key);
        if (behavior) {
          if (behavior.reads.size > 0) {
            lines.push(`        Reads:  ${Array.from(behavior.reads).join(", ")}`);
          }
          if (behavior.writes.size > 0) {
            lines.push(`        Writes: ${Array.from(behavior.writes).join(", ")}`);
          }
        }
        if (liveAfter) {
          lines.push(`        Live:   ${Array.from(liveAfter).join(", ") || "(none)"}`);
        }
      }
    }

    return lines.join("\n");
  }
}
