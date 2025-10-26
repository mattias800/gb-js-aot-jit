#!/usr/bin/env node
/**
 * Check if the game is progressing or stuck in a loop
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const checkInterval = parseInt(process.argv[3] || '100000', 10);
  const numChecks = parseInt(process.argv[4] || '20', 10);
  
  if (!romPath) {
    console.error('Usage: npm run check-progress <rom-file> [check-interval] [num-checks]');
    process.exit(1);
  }
  
  console.log('🔍 Checking game progress\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  const pcSamples: number[] = [];
  
  for (let i = 0; i < numChecks; i++) {
    engine.run(checkInterval);
    const state = engine.getState();
    pcSamples.push(state.PC);
    console.log(`Check ${i.toString().padStart(2)}: Cycle ${state.cycles.toString().padStart(10)} | PC = 0x${state.PC.toString(16).padStart(4, '0')}`);
  }
  
  // Analyze if stuck
  const uniquePCs = new Set(pcSamples);
  console.log(`\n📊 Analysis:`);
  console.log(`  Unique PC values: ${uniquePCs.size}/${numChecks}`);
  
  if (uniquePCs.size === 1) {
    console.log(`  ⚠️  STUCK at 0x${pcSamples[0].toString(16).padStart(4, '0')}`);
  } else if (uniquePCs.size < 5) {
    console.log(`  ⚠️  Likely in a tight loop between:`);
    Array.from(uniquePCs).forEach(pc => {
      const count = pcSamples.filter(p => p === pc).length;
      console.log(`      0x${pc.toString(16).padStart(4, '0')} (${count} times)`);
    });
  } else {
    console.log(`  ✓ Game appears to be progressing`);
  }
};

main();
