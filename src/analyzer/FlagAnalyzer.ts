import { Instruction } from "../decoder/InstructionDecoder.js";
import { BasicBlock } from "./BasicBlockAnalyzer.js";
import { ControlFlowGraph } from "./ControlFlowGraph.js";

/**
 * Flags that can be set/read by instructions
 */
export enum Flag {
  Z = "Z", // Zero flag
  N = "N", // Subtract flag
  H = "H", // Half carry flag
  C = "C", // Carry flag
}

/**
 * Flag behavior for an instruction
 */
export interface FlagBehavior {
  sets: Set<Flag>; // Flags this instruction sets
  reads: Set<Flag>; // Flags this instruction reads
  kills: Set<Flag>; // Flags this instruction unconditionally overwrites
}

/**
 * Flag liveness information for a basic block
 */
export interface BlockFlagInfo {
  blockId: number;
  liveIn: Set<Flag>; // Flags that must be live at block entry
  liveOut: Set<Flag>; // Flags that must be live at block exit
  instructionLiveness: Map<number, Set<Flag>>; // Live flags after each instruction index
}

/**
 * Analyzes flag usage and determines which flag computations are necessary
 */
export class FlagAnalyzer {
  private flagBehaviors = new Map<string, FlagBehavior>();  // key: "blockId:instrIndex"
  private blockFlagInfo = new Map<number, BlockFlagInfo>();

  constructor(
    private blocks: Map<number, BasicBlock>,
    private cfg: ControlFlowGraph
  ) {}

  /**
   * Run complete flag analysis
   */
  public analyze(): void {
    // Step 1: Determine flag behavior for each instruction
    this.analyzeFlagBehaviors();

    // Step 2: Compute flag liveness via backward data flow analysis
    this.computeFlagLiveness();
  }

  /**
   * Check if a flag write at the given instruction is live (needed)
   */
  public isFlagWriteLive(blockId: number, instructionIndex: number, flag: Flag): boolean {
    const blockInfo = this.blockFlagInfo.get(blockId);
    if (!blockInfo) return true; // Conservative: assume live if not analyzed

    const liveFlags = blockInfo.instructionLiveness.get(instructionIndex);
    if (!liveFlags) return true;

    return liveFlags.has(flag);
  }

  /**
   * Get all live flags after an instruction
   */
  public getLiveFlagsAfter(blockId: number, instructionIndex: number): Set<Flag> {
    const blockInfo = this.blockFlagInfo.get(blockId);
    if (!blockInfo) return new Set([Flag.Z, Flag.N, Flag.H, Flag.C]);

    return blockInfo.instructionLiveness.get(instructionIndex) || new Set();
  }

  /**
   * Step 1: Analyze each instruction to determine flag behavior
   */
  private analyzeFlagBehaviors(): void {
    for (const block of this.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        const behavior = this.getInstructionFlagBehavior(instr);
        const key = `${block.id}:${i}`;
        this.flagBehaviors.set(key, behavior);
      }
    }
  }

  /**
   * Determine flag behavior for a single instruction
   */
  private getInstructionFlagBehavior(instr: Instruction): FlagBehavior {
    const sets = new Set<Flag>();
    const reads = new Set<Flag>();
    const kills = new Set<Flag>();

    const mnemonic = instr.mnemonic.toUpperCase();

    // Instructions that read flags
    // Conditional jumps/calls/returns read flags
    if (mnemonic.includes(" NZ") || mnemonic.endsWith("NZ")) {
      reads.add(Flag.Z);
    }
    if (mnemonic.includes(" Z,") || mnemonic.includes(" Z")) {
      // Make sure it's not NZ
      if (!mnemonic.includes("NZ")) {
        reads.add(Flag.Z);
      }
    }
    if (mnemonic.includes(" NC")) {
      reads.add(Flag.C);
    }
    if (mnemonic.includes(" C,") || (mnemonic.includes(" C") && !mnemonic.includes("NC") && !mnemonic.includes("CALL"))) {
      reads.add(Flag.C);
    }

    if (mnemonic.startsWith("ADC") || mnemonic.startsWith("SBC")) {
      reads.add(Flag.C);
    }

    if (mnemonic.startsWith("RLA") || mnemonic.startsWith("RRA") || 
        mnemonic.startsWith("RL ") || mnemonic.startsWith("RR ")) {
      reads.add(Flag.C);
    }

    if (mnemonic === "CCF" || mnemonic === "SCF") {
      reads.add(Flag.C);
    }

    if (mnemonic === "DAA") {
      reads.add(Flag.N);
      reads.add(Flag.H);
      reads.add(Flag.C);
    }

    // Instructions that set/kill flags
    if (
      mnemonic.startsWith("ADD") ||
      mnemonic.startsWith("ADC") ||
      mnemonic.startsWith("SUB") ||
      mnemonic.startsWith("SBC") ||
      mnemonic.startsWith("AND") ||
      mnemonic.startsWith("XOR") ||
      mnemonic.startsWith("OR") ||
      mnemonic.startsWith("CP") ||
      mnemonic.startsWith("INC") ||
      mnemonic.startsWith("DEC")
    ) {
      sets.add(Flag.Z);
      sets.add(Flag.N);
      sets.add(Flag.H);
      sets.add(Flag.C);
      kills.add(Flag.Z);
      kills.add(Flag.N);
      kills.add(Flag.H);
      kills.add(Flag.C);
    }

    if (
      mnemonic.startsWith("RL") ||
      mnemonic.startsWith("RR") ||
      mnemonic.startsWith("SLA") ||
      mnemonic.startsWith("SRA") ||
      mnemonic.startsWith("SRL") ||
      mnemonic.startsWith("SWAP")
    ) {
      sets.add(Flag.Z);
      sets.add(Flag.N);
      sets.add(Flag.H);
      sets.add(Flag.C);
      kills.add(Flag.Z);
      kills.add(Flag.N);
      kills.add(Flag.H);
      kills.add(Flag.C);
    }

    if (mnemonic === "CCF") {
      sets.add(Flag.C);
      sets.add(Flag.N);
      sets.add(Flag.H);
      kills.add(Flag.N);
      kills.add(Flag.H);
      kills.add(Flag.C);
    }

    if (mnemonic === "SCF") {
      sets.add(Flag.C);
      sets.add(Flag.N);
      sets.add(Flag.H);
      kills.add(Flag.N);
      kills.add(Flag.H);
      kills.add(Flag.C);
    }

    if (mnemonic === "DAA") {
      sets.add(Flag.Z);
      sets.add(Flag.H);
      sets.add(Flag.C);
      kills.add(Flag.Z);
      kills.add(Flag.H);
    }

    if (mnemonic.startsWith("BIT ")) {
      sets.add(Flag.Z);
      sets.add(Flag.N);
      sets.add(Flag.H);
      kills.add(Flag.Z);
      kills.add(Flag.N);
      kills.add(Flag.H);
    }

    return { sets, reads, kills };
  }

  /**
   * Step 2: Compute flag liveness via backward data flow analysis
   */
  private computeFlagLiveness(): void {
    // Initialize block info
    for (const block of this.blocks.values()) {
      const blockId = block.startAddress;
      this.blockFlagInfo.set(blockId, {
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

      // Process blocks in reverse topological order for faster convergence
      // Use block addresses as IDs
      const sortedBlocks = Array.from(this.blocks.keys()).reverse();

      for (const blockId of sortedBlocks) {
        const block = this.blocks.get(blockId);
        if (!block) continue;

        const blockInfo = this.blockFlagInfo.get(blockId)!;
        const oldLiveIn = new Set(blockInfo.liveIn);

        // liveOut = union of all successor liveIn
        const newLiveOut = new Set<Flag>();
        const cfgNode = this.cfg.nodes.get(blockId);
        if (cfgNode) {
          for (const succId of cfgNode.successors) {
            const succInfo = this.blockFlagInfo.get(succId);
            if (succInfo) {
              for (const flag of succInfo.liveIn) {
                newLiveOut.add(flag);
              }
            }
          }
        }

        // Backward pass through instructions
        let currentLive = new Set(newLiveOut);

        for (let i = block.instructions.length - 1; i >= 0; i--) {
          const instr = block.instructions[i];
          const key = `${blockId}:${i}`;
          const behavior = this.flagBehaviors.get(key);

          // Store live-after for this instruction (before updating)
          blockInfo.instructionLiveness.set(i, new Set(currentLive));

          if (behavior) {
            // Remove killed flags (that are overwritten)
            for (const flag of behavior.kills) {
              currentLive.delete(flag);
            }

            // Add read flags (that are needed)
            for (const flag of behavior.reads) {
              currentLive.add(flag);
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
      console.warn("Flag liveness analysis did not converge");
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
   * Get debug information about flag liveness
   */
  public getDebugInfo(blockId: number): string {
    const blockInfo = this.blockFlagInfo.get(blockId);
    if (!blockInfo) return "No flag info available";

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
        const behavior = this.flagBehaviors.get(key);
        if (behavior) {
          if (behavior.reads.size > 0) {
            lines.push(`        Reads: ${Array.from(behavior.reads).join(", ")}`);
          }
          if (behavior.sets.size > 0) {
            lines.push(`        Sets:  ${Array.from(behavior.sets).join(", ")}`);
          }
        }
        if (liveAfter) {
          lines.push(`        Live:  ${Array.from(liveAfter).join(", ") || "(none)"}`);
        }
      }
    }

    return lines.join("\n");
  }
}
