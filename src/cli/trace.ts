#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { analyzeBasicBlocksWithTargets } from '../analyzer/BasicBlockAnalyzer';
import { CPUState } from '../runtime/CPUState';
import { MMU } from '../runtime/MMU';
import { decodeInstruction } from '../decoder/InstructionDecoder';

const main = (): void => {
  const romPath = process.argv[2];
  const maxInstrs = parseInt(process.argv[3] || '100', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace <rom-file> [max-instructions]');
    process.exit(1);
  }
  
  console.log('🔍 Execution Tracer\n');
  
  try {
    const rom = loadROM(romPath);
    const state = new CPUState();
    const mmu = new MMU(rom.data);
    
    console.log('Initial state:');
    console.log(`  PC: 0x${state.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${state.SP.toString(16).padStart(4, '0')}\n`);
    console.log('Execution trace:\n');
    
    for (let i = 0; i < maxInstrs; i++) {
      const pc = state.PC;
      
      // Stop if we hit an invalid address
      if (pc >= rom.data.length) {
        console.log(`\n❌ PC out of bounds: 0x${pc.toString(16)}`);
        break;
      }
      
      // Decode instruction
      const instr = decodeInstruction(rom.data, pc);
      
      // Print trace
      const bytes = Array.from(rom.data.slice(pc, pc + instr.length))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      
      console.log(`${i.toString().padStart(4)}: 0x${pc.toString(16).padStart(4, '0')}  ${bytes.padEnd(9)}  ${instr.mnemonic.padEnd(15)}  A=${state.A.toString(16).padStart(2,'0')} F=${state.getFlags()} SP=${state.SP.toString(16).padStart(4,'0')}`);
      
      // Execute instruction (simplified - just update PC)
      // For now, just step PC forward and handle basic instructions
      switch (instr.mnemonic) {
        case 'NOP':
          break;
        case 'HALT':
          console.log('\n⏸️  HALT encountered');
          return;
        case 'JP nn':
          // Read target from instruction bytes
          const target = rom.data[pc + 1] | (rom.data[pc + 2] << 8);
          state.PC = target;
          continue;
        case 'JR r8':
        case 'JR NZ, r8':
        case 'JR Z, r8':
        case 'JR NC, r8':
        case 'JR C, r8': {
          // Check condition
          const offset = rom.data[pc + 1];
          const signedOffset = offset > 127 ? offset - 256 : offset;
          
          let shouldJump = true;
          if (instr.mnemonic.includes('NZ')) shouldJump = !state.getZ();
          else if (instr.mnemonic.includes('Z,')) shouldJump = state.getZ();
          else if (instr.mnemonic.includes('NC')) shouldJump = !state.getC();
          else if (instr.mnemonic.includes('C,')) shouldJump = state.getC();
          
          if (shouldJump) {
            state.PC = (pc + instr.length + signedOffset) & 0xFFFF;
            continue;
          }
          break;
        }
        case 'LD SP, nn':
          state.SP = rom.data[pc + 1] | (rom.data[pc + 2] << 8);
          break;
        case 'XOR A':
          state.A = 0;
          state.setZ(true);
          state.setN(false);
          state.setH(false);
          state.setC(false);
          break;
        case 'INC A':
          state.A = (state.A + 1) & 0xFF;
          state.setZ(state.A === 0);
          state.setN(false);
          state.setH((state.A & 0xF) === 0);
          break;
        case 'DEC A':
          state.A = (state.A - 1) & 0xFF;
          state.setZ(state.A === 0);
          state.setN(true);
          state.setH((state.A & 0xF) === 0xF);
          break;
        case 'CP n': {
          const val = rom.data[pc + 1];
          state.setZ(state.A === val);
          state.setN(true);
          state.setH((state.A & 0xF) < (val & 0xF));
          state.setC(state.A < val);
          break;
        }
      }
      
      // Advance PC
      state.PC = (state.PC + instr.length) & 0xFFFF;
    }
    
    console.log(`\n✅ Traced ${maxInstrs} instructions`);
    console.log(`\nFinal state:`);
    console.log(`  PC: 0x${state.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${state.SP.toString(16).padStart(4, '0')}`);
    console.log(`  A:  0x${state.A.toString(16).padStart(2, '0')}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
