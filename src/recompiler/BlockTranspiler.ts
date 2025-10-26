import { BasicBlock } from '../analyzer/BasicBlockAnalyzer';
import { FlagAnalyzer } from '../analyzer/FlagAnalyzer';
import { RegisterAnalyzer } from '../analyzer/RegisterAnalyzer';
import { ConstantAnalyzer } from '../analyzer/ConstantAnalyzer';
import { transpileInstruction } from './InstructionTranspiler';

export interface TranspilerContext {
  flagAnalyzer?: FlagAnalyzer;
  registerAnalyzer?: RegisterAnalyzer;
  constantAnalyzer?: ConstantAnalyzer;
}

/**
 * Transpile an entire basic block to JavaScript
 * 
 * @param block The basic block to transpile
 * @param romData ROM data for reading instruction bytes
 * @param context Analysis context for optimizations
 * @returns JavaScript code that implements the block
 */
export const transpileBlock = (
  block: BasicBlock,
  romData: Uint8Array,
  context: TranspilerContext = {}
): string => {
  const lines: string[] = [];
  
  // Add block header comment
  lines.push(`// Block 0x${block.startAddress.toString(16)} - ${block.exitType}`);
  lines.push('');
  
  let pc = block.startAddress;
  
  // Transpile each instruction in the block
  for (let instrIndex = 0; instrIndex < block.instructions.length; instrIndex++) {
    const varSuffix = `_${pc.toString(16)}`;  // Unique suffix for this instruction
    const instr = block.instructions[instrIndex];
    
    // Get instruction bytes
    const instrBytes = new Uint8Array(instr.length);
    for (let i = 0; i < instr.length && pc + i < romData.length; i++) {
      instrBytes[i] = romData[pc + i];
    }
    
    // Transpile with optimization context
    const result = transpileInstruction(instr, pc, instrBytes, {
      blockId: block.id,
      instructionIndex: instrIndex,
      flagAnalyzer: context.flagAnalyzer,
      registerAnalyzer: context.registerAnalyzer,
      constantAnalyzer: context.constantAnalyzer,
    });
    
    // Add comment with original instruction
    lines.push(`  // 0x${pc.toString(16)}: ${instr.mnemonic}`);
    
    // Wrap in block scope to avoid variable name conflicts
    lines.push(`  {`);
    lines.push(`    ${result.code.replace(/\n/g, '\n    ')}`);
    
    // Only add cycle increment if the instruction doesn't already return
    // (control flow instructions handle their own return)
    if (!result.code.includes('return {')) {
      lines.push(`    cycles += ${result.cycles};`);
    }
    lines.push(`  }`);
    lines.push('');
    
    pc += instr.length;
  }
  
  // Add block exit logic (only if last instruction didn't already return)
  const lastInstr = block.instructions[block.instructions.length - 1];
  const lastInstrIsUnconditionalControlFlow = 
    (lastInstr.mnemonic === 'JP nn') ||
    (lastInstr.mnemonic === 'JR r8') ||
    (lastInstr.mnemonic === 'JP (HL)') ||
    (lastInstr.mnemonic === 'RET' && !lastInstr.mnemonic.includes(' ')) || // Unconditional RET only
    (lastInstr.mnemonic === 'RETI') ||
    (lastInstr.mnemonic === 'HALT') ||
    (lastInstr.mnemonic.startsWith('RST'));
  
  if (lastInstrIsUnconditionalControlFlow && (block.exitType === 'jump' || block.exitType === 'return' || block.exitType === 'halt')) {
    // Unconditional control flow instruction already handled the return
    return lines.join('\n');
  }
  
  lines.push('  // Block exit');
  
  switch (block.exitType) {
    case 'jump':
      // Unconditional jump - target should be in block.targets[0]
      if (block.targets.length > 0) {
        lines.push(`  return { nextBlock: 0x${block.targets[0].toString(16)}, cycles };`);
      } else {
        lines.push(`  // ERROR: jump with no target`);
        lines.push(`  return { nextBlock: null, cycles, exit: 'halt' };`);
      }
      break;
      
    case 'branch':
      // Conditional branch - need fallthrough for when branch not taken
      lines.push(`  // Branch not taken, fall through`);
      const fallthroughAddr = block.endAddress + 1;
      lines.push(`  return { nextBlock: 0x${fallthroughAddr.toString(16)}, cycles };`);
      break;
      
    case 'call':
      // Call returns to next instruction after the block
      lines.push(`  // Call handled by instruction, fallthrough to next block`);
      const nextAddr = block.endAddress + 1;
      lines.push(`  return { nextBlock: 0x${nextAddr.toString(16)}, cycles };`);
      break;
      
    case 'return':
      // Return - PC was popped from stack (if conditional return executed)
      // If conditional return didn't execute, fall through to next instruction
      const fallthroughAfterReturn = block.endAddress + 1;
      lines.push(`  // Check if we actually returned or fell through`);
      lines.push(`  if (state.PC !== ${block.startAddress}) {`);
      lines.push(`    return { nextBlock: state.PC, cycles };`);
      lines.push(`  } else {`);
      lines.push(`    // Conditional return didn't execute, fall through`);
      lines.push(`    return { nextBlock: 0x${fallthroughAfterReturn.toString(16)}, cycles };`);
      lines.push(`  }`);
      break;
      
    case 'halt':
      lines.push(`  return { nextBlock: null, cycles, exit: 'halt' };`);
      break;
      
    case 'fallthrough':
      // Continue to next block
      if (block.targets.length > 0) {
        lines.push(`  return { nextBlock: 0x${block.targets[0].toString(16)}, cycles };`);
      } else {
        const nextAddr = block.endAddress + 1;
        lines.push(`  return { nextBlock: 0x${nextAddr.toString(16)}, cycles };`);
      }
      break;
      
    case 'indirect':
      // JP (HL) or similar - target is in register
      lines.push(`  return { nextBlock: state.getHL(), cycles };`);
      break;
  }
  
  return lines.join('\n');
};
