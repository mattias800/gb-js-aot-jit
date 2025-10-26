#!/usr/bin/env node
/**
 * Analyze ROM vs RAM execution to understand recompiler effectiveness
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const maxCycles = parseInt(process.argv[3] || '2000000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run analyze-execution <rom-file> [max-cycles]');
    process.exit(1);
  }
  
  console.log('📊 Analyzing Execution Patterns\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  let romBlocks = 0;
  let ramBlocks = 0;
  let totalBlocks = 0;
  const ramAddresses = new Map<number, number>();
  
  // Hook execution
  const originalExecuteBlock = (engine as any).executeBlock.bind(engine);
  (engine as any).executeBlock = function() {
    const state = engine.getState();
    const pc = state.PC;
    totalBlocks++;
    
    // ROM: 0x0000-0x7FFF, RAM: 0x8000+ (VRAM, WRAM, etc)
    if (pc < 0x8000) {
      romBlocks++;
    } else {
      ramBlocks++;
      ramAddresses.set(pc, (ramAddresses.get(pc) || 0) + 1);
    }
    
    return originalExecuteBlock();
  };
  
  console.log(`Running for ${maxCycles} cycles...\n`);
  
  try {
    engine.run(maxCycles);
  } catch (error) {
    console.log('Execution stopped with error (continuing analysis)');
  }
  
  const stats = engine.getStats();
  const romPercent = (romBlocks / totalBlocks * 100).toFixed(2);
  const ramPercent = (ramBlocks / totalBlocks * 100).toFixed(2);
  
  console.log('📈 Execution Analysis:\n');
  console.log(`Total blocks executed: ${totalBlocks.toLocaleString()}`);
  console.log(`  ROM blocks: ${romBlocks.toLocaleString()} (${romPercent}%)`);
  console.log(`  RAM blocks: ${ramBlocks.toLocaleString()} (${ramPercent}%)`);
  console.log();
  console.log(`Unique RAM addresses: ${ramAddresses.size}`);
  
  if (ramAddresses.size > 0) {
    console.log('\n🔥 RAM execution hotspots (by frequency):');
    const sortedRAM = Array.from(ramAddresses.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    sortedRAM.forEach(([addr, count]) => {
      const region = addr < 0xA000 ? 'VRAM' : 
                     addr < 0xC000 ? 'External RAM' :
                     addr < 0xE000 ? 'Work RAM' :
                     addr < 0xFE00 ? 'Echo RAM' :
                     addr < 0xFEA0 ? 'OAM' : 'I/O/HRAM';
      const percent = (count / totalBlocks * 100).toFixed(2);
      console.log(`  0x${addr.toString(16).padStart(4, '0')} - ${count.toLocaleString()} times (${percent}% of total) [${region}]`);
    });
  }
  
  console.log('\n📊 Recompiler Stats:\n');
  console.log(`Blocks compiled: ${stats.blocksCompiled}`);
  console.log(`Cache hit rate: ${(stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(2)}%`);
  console.log(`Total cycles: ${stats.totalCycles.toLocaleString()}`);
  
  const realHardwareSpeed = 4.19; // MHz
  const emulatorSpeed = stats.totalCycles / 1_000_000;
  const speedup = emulatorSpeed / realHardwareSpeed;
  console.log(`\n⚡ Performance: ${speedup.toFixed(1)}x faster than real hardware`);
  
  if (ramPercent > '10') {
    console.log(`\n⚠️  Warning: ${ramPercent}% of execution is in RAM (interpreted, not recompiled)`);
    console.log('This significantly impacts recompiler effectiveness.');
    console.log('Consider implementing JIT compilation for hot RAM code paths.');
  }
};

main();
