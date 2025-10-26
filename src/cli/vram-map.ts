#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const cycles = parseInt(process.argv[3] || '1000000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run vram-map <rom-file> [cycles]');
    process.exit(1);
  }
  
  console.log('🗺️  VRAM Memory Map\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  console.log(`Executing ${cycles} cycles...\n`);
  engine.run(cycles);
  
  const mmu = engine.getMMU();
  const vram = mmu.getVRAM();
  
  // Find regions with data
  let inRegion = false;
  let regionStart = 0;
  let regionEnd = 0;
  
  console.log('Non-zero VRAM regions:\n');
  
  for (let i = 0; i < vram.length; i++) {
    if (vram[i] !== 0) {
      if (!inRegion) {
        regionStart = i;
        inRegion = true;
      }
      regionEnd = i;
    } else if (inRegion && (vram[i] === 0 && vram[i+1] === 0 && vram[i+2] === 0)) {
      // End region after 3 consecutive zeros
      const size = regionEnd - regionStart + 1;
      const addr = 0x8000 + regionStart;
      console.log(`  0x${addr.toString(16).padStart(4, '0')} - 0x${(addr + size - 1).toString(16).padStart(4, '0')} (${size} bytes)`);
      
      // Show first 32 bytes
      const preview = Array.from(vram.slice(regionStart, Math.min(regionStart + 32, regionEnd + 1)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`    ${preview}${size > 32 ? ' ...' : ''}\n`);
      
      inRegion = false;
    }
  }
  
  // Check tile maps
  console.log('\n🗺️  Background Tile Map (0x9800-0x9BFF):');
  const tileMapStart = 0x9800 - 0x8000;
  const tileMapData = vram.slice(tileMapStart, tileMapStart + 32); // First row
  const tiles = Array.from(tileMapData).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  First row: ${tiles}`);
  
  const nonZeroTiles = Array.from(vram.slice(tileMapStart, tileMapStart + 1024)).filter(b => b !== 0).length;
  console.log(`  Non-zero tiles: ${nonZeroTiles}/1024\n`);
};

main();
