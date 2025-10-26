#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const maxCycles = parseInt(process.argv[3] || '100000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-stack <rom-file> [max-cycles]');
    process.exit(1);
  }
  
  console.log('🔍 Execution Tracer with Stack Tracking\n');
  
  try {
    const rom = loadROM(romPath);
    const engine = new RecompilerEngine(rom);
    
    console.log(`Title: ${rom.header.title}\n`);
    console.log('Execution trace:\n');
    console.log('      PC      SP   Stack[SP] Stack[SP+1]  Cycles');
    console.log('  -------- -------- --------- ----------- --------');
    
    const state = engine.getState();
    const mmu = engine.getMMU();
    
    let lastPC = -1;
    let stuckCount = 0;
    
    while (state.cycles < maxCycles && !state.halted) {
      const pc = state.PC;
      const sp = state.SP;
      const cycles = state.cycles;
      
      // Check if stuck in a loop
      if (pc === lastPC) {
        stuckCount++;
        if (stuckCount > 1000) {
          console.log('\n⚠️  Stuck in loop, stopping trace');
          break;
        }
      } else {
        stuckCount = 0;
        lastPC = pc;
      }
      
      // Read stack top (if valid)
      let stackVal = '----';
      let stackVal2 = '----';
      if (sp < 0xFFFE) {
        try {
          const v = mmu.read16(sp);
          stackVal = `0x${(v & 0xFF).toString(16).padStart(2, '0')}`;
          stackVal2 = `0x${((v >> 8) & 0xFF).toString(16).padStart(2, '0')}`;
        } catch (e) {
          // ignore
        }
      }
      
      console.log(`  0x${pc.toString(16).padStart(4, '0')}   0x${sp.toString(16).padStart(4, '0')}   ${stackVal.padEnd(9)} ${stackVal2.padEnd(11)} ${cycles.toString().padStart(8)}`);
      
      // Execute one block
      engine.step();
      
      // Check for suspicious conditions
      if (pc === 0xFFFF) {
        console.log('\n❌ ERROR: PC reached 0xFFFF (Interrupt Enable register)!');
        console.log(`   This likely means RET popped an invalid address from stack.`);
        console.log(`   SP before: 0x${sp.toString(16)}, SP after: 0x${state.SP.toString(16)}`);
        break;
      }
      
      if (sp < 0xFF00 && sp !== state.SP && state.SP < sp - 100) {
        console.log(`\n⚠️  Warning: SP dropped significantly: 0x${sp.toString(16)} -> 0x${state.SP.toString(16)}`);
      }
    }
    
    console.log(`\n✅ Traced ${state.cycles} cycles`);
    console.log(`\nFinal state:`);
    console.log(`  PC: 0x${state.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${state.SP.toString(16).padStart(4, '0')}`);
    console.log(`  A:  0x${state.A.toString(16).padStart(2, '0')}`);
    console.log(`  Halted: ${state.halted}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
