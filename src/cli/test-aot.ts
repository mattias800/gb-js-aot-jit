#!/usr/bin/env node
/**
 * Test AOT-compiled game headlessly
 */
import { readFileSync } from 'fs';
import { loadROM } from '../loader/ROMLoader';
import { AOTCompiler } from '../compiler/AOTCompiler';

const main = (): void => {
  const romPath = process.argv[2] || 'tetris.gb';
  
  console.log('🔍 Testing AOT Compilation\n');
  console.log(`ROM: ${romPath}\n`);
  
  // Load and compile
  const rom = loadROM(romPath);
  const compiler = new AOTCompiler(rom);
  
  console.log('Compiling...');
  const jsCode = compiler.compile({
    romTitle: 'test',
    outputPath: './test',
  });
  
  console.log(`Generated ${(jsCode.length / 1024).toFixed(2)} KB of JavaScript\n`);
  
  // Try to evaluate the generated code
  console.log('Testing generated code...\n');
  
  try {
    // Execute the generated JavaScript
    eval(jsCode);
    
    // Check if GameBoyEmulator was created
    if (typeof (global as any).GameBoyEmulator === 'undefined') {
      console.error('❌ GameBoyEmulator not defined after eval');
      console.error('The generated code should create window.GameBoyEmulator');
      process.exit(1);
    }
    
    const GameBoyEmulator = (global as any).GameBoyEmulator;
    
    console.log('✅ Code executed successfully');
    console.log(`   ROM Title: ${GameBoyEmulator.romTitle}`);
    console.log(`   ROM Size: ${GameBoyEmulator.romSize}`);
    console.log(`   Blocks Compiled: ${GameBoyEmulator.blocksCompiled}\n`);
    
    // Try to create emulator instance
    console.log('Creating emulator instance...');
    const emulator = new GameBoyEmulator.Emulator();
    
    console.log('✅ Emulator created');
    console.log(`   Initial PC: 0x${emulator.state.PC.toString(16)}`);
    console.log(`   Initial SP: 0x${emulator.state.SP.toString(16)}\n`);
    
    // Execute some frames
    console.log('Executing 10000 frames to allow game initialization...');
    for (let i = 0; i < 10000; i++) {
      emulator.executeFrame();
      if (i === 0 || i === 9999) {
        console.log(`   Frame ${i + 1}: PC=0x${emulator.state.PC.toString(16)} Cycles=${emulator.state.cycles}`);
      }
      // Sample PC at various points to detect stuck execution
      if (i === 100 || i === 500 || i === 1000 || i === 5000) {
        console.log(`   Frame ${i + 1}: PC=0x${emulator.state.PC.toString(16)} IME=${emulator.state.IME} IE=0x${emulator.mmu.getIO(0xFF).toString(16)}`);
      }
    }
    
    console.log('\n✅ Execution successful');
    console.log(`   Final PC: 0x${emulator.state.PC.toString(16)}`);
    console.log(`   Total Cycles: ${emulator.state.cycles}`);
    console.log(`   Halted: ${emulator.state.halted}\n`);
    
    // Check if any graphics were rendered
    const frameBuffer = emulator.ppu.getFrameBuffer();
    let nonWhitePixels = 0;
    for (let i = 0; i < frameBuffer.length; i += 4) {
      if (frameBuffer[i] !== 255) {
        nonWhitePixels++;
      }
    }
    
    console.log('Graphics Check:');
    console.log(`   Non-white pixels: ${nonWhitePixels} / ${frameBuffer.length / 4}`);
    
    // Check LCD status
    const lcdc = emulator.mmu.getIO(0x40);
    console.log(`   LCDC register: 0x${lcdc.toString(16).toUpperCase().padStart(2, '0')} (LCD ${lcdc & 0x80 ? 'ON' : 'OFF'}, BG ${lcdc & 0x01 ? 'ON' : 'OFF'})`);
    
    if (nonWhitePixels === 0) {
      console.log('   ⚠️  Screen is all white - game may not have started rendering yet');
    } else {
      console.log('   ✅ Screen has content');
    }
    
    // Report missing instructions
    console.log('\nMissing Instructions Summary:');
    if (typeof (global as any).getMissingInstructionsSummary === 'function') {
      const missing = (global as any).getMissingInstructionsSummary();
      if (missing.length === 0) {
        console.log('   ✅ All instructions transpiled');
      } else {
        console.log(`   Found ${missing.length} missing instructions:`);
        missing.forEach((instr: string) => console.log(`   - ${instr}`));
      }
    } else {
      console.log('   (getMissingInstructionsSummary not available)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
};

main();
