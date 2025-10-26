#!/usr/bin/env node
/**
 * Capture VRAM snapshot right after tile data writes complete
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const stopAfterTileDataWrites = parseInt(process.argv[3] || '1000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run vram-snapshot <rom-file> [num-tile-data-writes-to-stop-after]');
    process.exit(1);
  }
  
  console.log('📸 VRAM Snapshot Tool\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  const mmu = engine.getMMU();
  
  // Track tile data writes
  let tileDataWriteCount = 0;
  let stopped = false;
  
  // Hook into MMU write8
  const originalWrite8 = mmu.write8.bind(mmu);
  mmu.write8 = (address: number, value: number): void => {
    if (!stopped && address >= 0x8000 && address < 0x9800) {
      tileDataWriteCount++;
      if (tileDataWriteCount >= stopAfterTileDataWrites) {
        stopped = true;
        console.log(`\n✓ Stopped after ${tileDataWriteCount} tile data writes`);
        console.log(`  Cycle: ${engine.getState().cycles}`);
        engine.stop();
      }
    }
    originalWrite8(address, value);
  };
  
  console.log(`Running until ${stopAfterTileDataWrites} tile data writes...\n`);
  engine.run(100000000);
  
  // Capture VRAM
  const vram = mmu.getVRAM();
  
  // Analyze tile data
  console.log('\n📊 Tile Data Analysis:\n');
  
  let nonZeroTiles = 0;
  let emptyTiles = 0;
  
  for (let tileNum = 0; tileNum < 384; tileNum++) {
    const tileOffset = tileNum * 16;
    let tileEmpty = true;
    
    for (let i = 0; i < 16; i++) {
      if (vram[tileOffset + i] !== 0) {
        tileEmpty = false;
        break;
      }
    }
    
    if (tileEmpty) {
      emptyTiles++;
    } else {
      nonZeroTiles++;
    }
  }
  
  console.log(`Non-empty tiles: ${nonZeroTiles}/384`);
  console.log(`Empty tiles: ${emptyTiles}/384`);
  
  // Show first few non-empty tiles
  console.log('\n🎨 First Non-Empty Tiles:\n');
  
  let shown = 0;
  for (let tileNum = 0; tileNum < 384 && shown < 5; tileNum++) {
    const tileOffset = tileNum * 16;
    let tileEmpty = true;
    
    for (let i = 0; i < 16; i++) {
      if (vram[tileOffset + i] !== 0) {
        tileEmpty = false;
        break;
      }
    }
    
    if (!tileEmpty) {
      console.log(`Tile ${tileNum} (address 0x${(0x8000 + tileOffset).toString(16).padStart(4, '0')}):`);
      
      // Show tile data as 8 rows of 2 bytes each
      for (let row = 0; row < 8; row++) {
        const byte1 = vram[tileOffset + row * 2];
        const byte2 = vram[tileOffset + row * 2 + 1];
        const binary1 = byte1.toString(2).padStart(8, '0');
        const binary2 = byte2.toString(2).padStart(8, '0');
        console.log(`  Row ${row}: ${binary1} ${binary2}`);
      }
      console.log();
      shown++;
    }
  }
  
  // Show tile map
  console.log('\n🗺️  Tile Map (first 64 tiles):\n');
  const tileMapStart = 0x9800 - 0x8000;
  for (let row = 0; row < 4; row++) {
    const tiles: string[] = [];
    for (let col = 0; col < 16; col++) {
      const tile = vram[tileMapStart + row * 32 + col];
      tiles.push(tile.toString(16).padStart(2, '0'));
    }
    console.log(`  Row ${row}: ${tiles.join(' ')}`);
  }
};

main();
