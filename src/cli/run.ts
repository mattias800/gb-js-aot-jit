#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const maxCycles = parseInt(process.argv[3] || '100000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run execute <rom-file> [max-cycles]');
    process.exit(1);
  }
  
  console.log('🎮 Game Boy Dynamic Recompiler - Execution Engine\n');
  console.log(`Loading ROM: ${romPath}`);
  
  try {
    const rom = loadROM(romPath);
    
    console.log(`Title: ${rom.header.title}`);
    console.log(`ROM Size: ${rom.data.length} bytes\n`);
    
    // Create recompiler engine
    const engine = new RecompilerEngine(rom);
    
    console.log(`\n🚀 Starting execution (max ${maxCycles} cycles)...\n`);
    
    // Get initial state
    const initialState = engine.getState();
    console.log('Initial state:');
    console.log(`  PC: 0x${initialState.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${initialState.SP.toString(16).padStart(4, '0')}`);
    console.log(`  A:  0x${initialState.A.toString(16).padStart(2, '0')}`);
    console.log();
    
    // Run
    const startTime = Date.now();
    engine.run(maxCycles);
    const endTime = Date.now();
    const elapsed = endTime - startTime;
    
    // Get final state
    const finalState = engine.getState();
    console.log('\n✅ Execution complete!\n');
    console.log('Final state:');
    console.log(`  PC: 0x${finalState.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${finalState.SP.toString(16).padStart(4, '0')}`);
    console.log(`  A:  0x${finalState.A.toString(16).padStart(2, '0')}`);
    console.log(`  Flags: ${finalState.getFlags()}`);
    console.log(`  Halted: ${finalState.halted}`);
    console.log();
    
    // Print statistics
    engine.printStats();
    
    console.log(`\n⏱️  Execution time: ${elapsed}ms`);
    
    const stats = engine.getStats();
    if (stats.totalCycles > 0 && elapsed > 0) {
      const cyclesPerSecond = (stats.totalCycles / elapsed) * 1000;
      const mhz = cyclesPerSecond / 1_000_000;
      console.log(`📊 Performance: ${mhz.toFixed(2)} MHz (${cyclesPerSecond.toFixed(0)} cycles/sec)`);
      
      // Game Boy CPU runs at ~4.19 MHz
      const speedup = mhz / 4.19;
      console.log(`🚀 Speedup: ${speedup.toFixed(2)}x vs real hardware`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
};

main();
