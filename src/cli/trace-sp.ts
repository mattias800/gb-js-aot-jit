#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';
import { decodeInstruction } from '../decoder/InstructionDecoder';

const main = (): void => {
  const romPath = process.argv[2];
  const maxCycles = parseInt(process.argv[3] || '100000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-sp <rom-file> [max-cycles]');
    process.exit(1);
  }
  
  console.log('🔍 SP Change Tracer\n');
  
  try {
    const rom = loadROM(romPath);
    const engine = new RecompilerEngine(rom);
    
    console.log(`Title: ${rom.header.title}\n`);
    console.log('SP changes:\n');
    console.log('      PC      Old SP   New SP   Instruction');
    console.log('  -------- -------- -------- ----------------------------------');
    
    const state = engine.getState();
    let lastSP = state.SP;
    let iterations = 0;
    
    while (state.cycles < maxCycles && !state.halted && iterations < 10000) {
      const pc = state.PC;
      const sp = state.SP;
      
      // Execute one block
      engine.step();
      
      // Check if SP changed
      if (state.SP !== lastSP) {
        const instr = decodeInstruction(rom.data, pc);
        console.log(`  0x${pc.toString(16).padStart(4, '0')}   0x${lastSP.toString(16).padStart(4, '0')}   0x${state.SP.toString(16).padStart(4, '0')}   ${instr.mnemonic}`);
        lastSP = state.SP;
      }
      
      // Check for suspicious conditions
      if (state.SP < 0xC000 && state.SP > 0) {
        console.log(`\n⚠️  Warning: SP is suspiciously low: 0x${state.SP.toString(16)}`);
        console.log(`   PC: 0x${state.PC.toString(16)}, Cycles: ${state.cycles}`);
        break;
      }
      
      if (pc === 0xFFFF) {
        console.log(`\n❌ ERROR: PC reached 0xFFFF!`);
        break;
      }
      
      iterations++;
    }
    
    console.log(`\n✅ Traced ${state.cycles} cycles (${iterations} blocks)`);
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
