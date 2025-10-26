#!/usr/bin/env node
/**
 * Trace VRAM writes using the recompiler engine
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const cycles = parseInt(process.argv[3] || '1000000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-vram-recomp <rom-file> [cycles]');
    process.exit(1);
  }
  
  console.log('🔍 Tracing VRAM writes\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  const mmu = engine.getMMU();
  
  // Track VRAM writes
  const vramWrites: Array<{address: number, value: number, cycle: number}> = [];
  
  // Hook into MMU write8
  const originalWrite8 = mmu.write8.bind(mmu);
  mmu.write8 = (address: number, value: number): void => {
    if (address >= 0x8000 && address < 0xA000) {
      const state = engine.getState();
      vramWrites.push({
        address,
        value,
        cycle: state.cycles
      });
    }
    originalWrite8(address, value);
  };
  
  console.log(`Executing ${cycles} cycles...\n`);
  engine.run(cycles);
  
  // Report VRAM writes
  console.log(`\nTotal VRAM writes: ${vramWrites.length}`);
  
  if (vramWrites.length === 0) {
    console.log("No VRAM writes detected!");
  } else {
    // Group by region
    const tileDataWrites = vramWrites.filter(w => w.address >= 0x8000 && w.address < 0x9800);
    const tileMapWrites = vramWrites.filter(w => w.address >= 0x9800 && w.address < 0xA000);
    
    console.log(`\nTile data writes (0x8000-0x97FF): ${tileDataWrites.length}`);
    console.log(`Tile map writes (0x9800-0x9FFF): ${tileMapWrites.length}`);
    
    // Show first 20 writes
    console.log(`\nFirst 20 VRAM writes:`);
    vramWrites.slice(0, 20).forEach(w => {
      console.log(`  Cycle ${w.cycle.toString().padStart(8)}: 0x${w.address.toString(16).padStart(4, '0')} = 0x${w.value.toString(16).padStart(2, '0')}`);
    });
    
    if (tileDataWrites.length > 0) {
      console.log(`\nFirst tile data write:`);
      const first = tileDataWrites[0];
      console.log(`  Cycle ${first.cycle}: 0x${first.address.toString(16).padStart(4, '0')} = 0x${first.value.toString(16).padStart(2, '0')}`);
      
      // Find first non-zero tile data write
      const firstNonZero = tileDataWrites.find(w => w.value !== 0);
      if (firstNonZero) {
        console.log(`\nFirst NON-ZERO tile data write:`);
        console.log(`  Cycle ${firstNonZero.cycle}: 0x${firstNonZero.address.toString(16).padStart(4, '0')} = 0x${firstNonZero.value.toString(16).padStart(2, '0')}`);
      } else {
        console.log(`\n⚠️  ALL tile data writes are ZERO - VRAM is being cleared, not loaded!`);
      }
    } else {
      console.log(`\n⚠️  No tile data writes found - only tile map!`);
    }
    
    // Show write distribution
    const writesByRegion: Record<string, number> = {};
    vramWrites.forEach(w => {
      const region = Math.floor((w.address - 0x8000) / 0x100);
      const key = `0x${(0x8000 + region * 0x100).toString(16)}`;
      writesByRegion[key] = (writesByRegion[key] || 0) + 1;
    });
    
    console.log(`\nWrites by 256-byte region:`);
    Object.entries(writesByRegion).sort(([a], [b]) => a.localeCompare(b)).forEach(([region, count]) => {
      console.log(`  ${region}: ${count} writes`);
    });
  }
};

main();
