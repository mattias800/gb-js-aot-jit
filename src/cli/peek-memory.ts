#!/usr/bin/env node
/**
 * Check memory value at a specific address after N cycles
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const address = parseInt(process.argv[3], 16);
  const cycles = parseInt(process.argv[4] || '1000000', 10);
  
  if (!romPath || isNaN(address)) {
    console.error('Usage: npm run peek-memory <rom-file> <address-hex> [cycles]');
    process.exit(1);
  }
  
  console.log(`🔍 Checking memory at 0x${address.toString(16).padStart(4, '0')} after ${cycles} cycles\n`);
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  engine.run(cycles);
  
  const mmu = engine.getMMU();
  const value = mmu.read8(address);
  
  console.log(`Value at 0x${address.toString(16).padStart(4, '0')}: 0x${value.toString(16).padStart(2, '0')} (${value})`);
  console.log(`Binary: ${value.toString(2).padStart(8, '0')}`);
  
  // Show surrounding memory
  console.log(`\nSurrounding memory:`);
  for (let i = -8; i <= 8; i++) {
    const addr = address + i;
    const val = mmu.read8(addr);
    const marker = i === 0 ? ' <--' : '';
    console.log(`  0x${addr.toString(16).padStart(4, '0')}: 0x${val.toString(16).padStart(2, '0')}${marker}`);
  }
};

main();
