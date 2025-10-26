#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';
import { writeFileSync } from 'fs';
import { PNG } from 'pngjs';

const main = (): void => {
  const romPath = process.argv[2];
  const cycles = parseInt(process.argv[3] || '70224', 10); // Default: 1 frame
  const outputPath = process.argv[4] || 'frame.png';
  
  if (!romPath) {
    console.error('Usage: npm run render <rom-file> [cycles] [output.png]');
    console.error('  cycles: number of CPU cycles to execute (default: 70224 = 1 frame)');
    console.error('  output: PNG file to save (default: frame.png)');
    process.exit(1);
  }
  
  console.log('🎮 Game Boy Dynamic Recompiler - Frame Renderer\n');
  console.log(`Loading ROM: ${romPath}`);
  
  try {
    const rom = loadROM(romPath);
    
    console.log(`Title: ${rom.header.title}`);
    console.log(`ROM Size: ${rom.data.length} bytes\n`);
    
    // Create recompiler engine
    console.log('Analyzing ROM...');
    const engine = new RecompilerEngine(rom);
    
    console.log(`\n🚀 Executing ${cycles} cycles...\n`);
    
    // Run
    const startTime = Date.now();
    engine.run(cycles);
    const endTime = Date.now();
    const elapsed = endTime - startTime;
    
    console.log(`✅ Execution complete in ${elapsed}ms`);
    
    // Get frame buffer from PPU
    const ppu = engine.getPPU();
    const frameBuffer = ppu.getFrameBuffer();
    
    // Create PNG
    const png = new PNG({
      width: 160,
      height: 144,
      colorType: 2, // RGB
    });
    
    // Convert RGBA to RGB (PNG library handles this better)
    for (let y = 0; y < 144; y++) {
      for (let x = 0; x < 160; x++) {
        const srcIdx = (y * 160 + x) * 4;
        const dstIdx = (y * 160 + x) * 4;
        
        png.data[dstIdx] = frameBuffer[srcIdx];       // R
        png.data[dstIdx + 1] = frameBuffer[srcIdx + 1]; // G
        png.data[dstIdx + 2] = frameBuffer[srcIdx + 2]; // B
        png.data[dstIdx + 3] = 255;                     // A
      }
    }
    
    // Save PNG
    const buffer = PNG.sync.write(png);
    writeFileSync(outputPath, buffer);
    
    console.log(`\n📸 Frame saved to: ${outputPath}`);
    console.log(`   Size: 160x144 pixels`);
    console.log(`   Format: PNG`);
    
    // Print statistics
    const stats = engine.getStats();
    console.log(`\n📊 Performance:`);
    console.log(`   Blocks compiled: ${stats.blocksCompiled}`);
    console.log(`   Blocks executed: ${stats.blocksExecuted}`);
    console.log(`   Total cycles: ${stats.totalCycles}`);
    console.log(`   Cache hit rate: ${((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(2)}%`);
    
    if (stats.totalCycles > 0 && elapsed > 0) {
      const mhz = (stats.totalCycles / elapsed) / 1000;
      const speedup = mhz / 4.19;
      console.log(`   Effective speed: ${mhz.toFixed(2)} MHz`);
      console.log(`   Speedup: ${speedup.toFixed(2)}x vs real hardware`);
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
