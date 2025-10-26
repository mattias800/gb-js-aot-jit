#!/usr/bin/env node
/**
 * Trace which blocks are being executed
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const numBlocks = parseInt(process.argv[3] || '50', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-blocks <rom-file> [num-blocks]');
    process.exit(1);
  }
  
  console.log(`🔍 Tracing Block Execution (showing ${numBlocks} blocks)\n`);
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  // Hack into the engine to trace blocks
  const originalStep = (engine as any).executeBlock.bind(engine);
  let blockCount = 0;
  
  (engine as any).executeBlock = function() {
    const state = engine.getState();
    const pc = state.PC;
    
    if (blockCount < numBlocks) {
      console.log(`[${blockCount.toString().padStart(3)}] Block at 0x${pc.toString(16).padStart(4, '0')} | Cycle ${state.cycles}`);
      blockCount++;
    }
    
    return originalStep();
  };
  
  // Run for a bit
  engine.run(10000000);
  
  console.log(`\nExecuted ${blockCount} blocks`);
};

main();
