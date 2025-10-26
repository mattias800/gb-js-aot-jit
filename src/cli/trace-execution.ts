#!/usr/bin/env node
/**
 * Detailed execution trace showing instruction-by-instruction execution
 */
import { loadROM } from '../loader/ROMLoader';
import { MMU } from '../runtime/MMU';
import { CPUState } from '../runtime/CPUState';
import { Interpreter } from '../runtime/Interpreter';
import { PPU } from '../runtime/PPU';
import { decodeInstruction } from '../decoder/InstructionDecoder';

const main = (): void => {
  const romPath = process.argv[2];
  const startCycle = parseInt(process.argv[3] || '0', 10);
  const numInstructions = parseInt(process.argv[4] || '50', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-execution <rom-file> [start-cycle] [num-instructions]');
    process.exit(1);
  }
  
  console.log(`🔍 Execution Trace (starting at cycle ${startCycle}, showing ${numInstructions} instructions)\n`);
  
  const rom = loadROM(romPath).data;
  const mmu = new MMU(rom);
  const cpuState = new CPUState();
  const ppu = new PPU(mmu, cpuState);
  
  // Run until start cycle
  while (cpuState.totalCycles < startCycle && !cpuState.halted) {
    const instructionCycles = Interpreter.executeInstruction(cpuState, mmu);
    cpuState.totalCycles += instructionCycles;
    ppu.step(instructionCycles);
  }
  
  console.log(`Starting trace at cycle ${cpuState.totalCycles}, PC=0x${cpuState.PC.toString(16).padStart(4, '0')}\n`);
  
  // Trace execution
  for (let i = 0; i < numInstructions && !cpuState.halted; i++) {
    const pc = cpuState.PC;
    const sp = cpuState.SP;
    const a = cpuState.A;
    const b = cpuState.B;
    const c = cpuState.C;
    const d = cpuState.D;
    const e = cpuState.E;
    const h = cpuState.H;
    const l = cpuState.L;
    const f = cpuState.F;
    
    // Decode instruction
    const instrBytes = new Uint8Array(4);
    for (let j = 0; j < 4; j++) {
      instrBytes[j] = mmu.read8(pc + j);
    }
    const instr = decodeInstruction(instrBytes, 0);
    
    // Show instruction
    const opcodeStr = Array.from(instrBytes.slice(0, instr.length))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    
    console.log(`[${i.toString().padStart(3)}] 0x${pc.toString(16).padStart(4, '0')}: ${opcodeStr.padEnd(12)} ${instr.mnemonic.padEnd(20)} | A=${a.toString(16).padStart(2, '0')} BC=${b.toString(16).padStart(2, '0')}${c.toString(16).padStart(2, '0')} DE=${d.toString(16).padStart(2, '0')}${e.toString(16).padStart(2, '0')} HL=${h.toString(16).padStart(2, '0')}${l.toString(16).padStart(2, '0')} SP=${sp.toString(16).padStart(4, '0')} F=${f.toString(16).padStart(2, '0')}`);
    
    // For memory reads/writes, show the address and value
    if (instr.mnemonic.includes('(HL)')) {
      const hl = (h << 8) | l;
      const val = mmu.read8(hl);
      console.log(`     └─> (HL)=0x${hl.toString(16).padStart(4, '0')} [${val.toString(16).padStart(2, '0')}]`);
    } else if (instr.mnemonic.includes('(BC)')) {
      const bc = (b << 8) | c;
      const val = mmu.read8(bc);
      console.log(`     └─> (BC)=0x${bc.toString(16).padStart(4, '0')} [${val.toString(16).padStart(2, '0')}]`);
    } else if (instr.mnemonic.includes('(DE)')) {
      const de = (d << 8) | e;
      const val = mmu.read8(de);
      console.log(`     └─> (DE)=0x${de.toString(16).padStart(4, '0')} [${val.toString(16).padStart(2, '0')}]`);
    }
    
    // Execute
    const instructionCycles = Interpreter.executeInstruction(cpuState, mmu);
    cpuState.totalCycles += instructionCycles;
    ppu.step(instructionCycles);
    
    // Show result for conditional branches
    if (instr.mnemonic.startsWith('JR') || instr.mnemonic.startsWith('JP') || instr.mnemonic.startsWith('RET') || instr.mnemonic.startsWith('CALL')) {
      if (cpuState.PC !== pc + instr.length) {
        console.log(`     └─> TAKEN -> 0x${cpuState.PC.toString(16).padStart(4, '0')}`);
      } else if (instr.mnemonic !== 'JR' && instr.mnemonic !== 'JP' && instr.mnemonic !== 'RET' && instr.mnemonic !== 'CALL') {
        console.log(`     └─> NOT TAKEN`);
      }
    }
  }
};

main();
