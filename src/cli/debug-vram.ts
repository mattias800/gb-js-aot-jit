#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const cycles = parseInt(process.argv[3] || '1000000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run debug-vram <rom-file> [cycles]');
    process.exit(1);
  }
  
  console.log('🔍 VRAM Debug Tool\n');
  
  try {
    const rom = loadROM(romPath);
    const engine = new RecompilerEngine(rom);
    
    console.log(`Executing ${cycles} cycles...\n`);
    engine.run(cycles);
    
    const mmu = engine.getMMU();
    const ppu = engine.getPPU();
    const vram = mmu.getVRAM();
    
    // Check how much VRAM is non-zero
    let nonZeroBytes = 0;
    for (let i = 0; i < vram.length; i++) {
      if (vram[i] !== 0) nonZeroBytes++;
    }
    
    console.log('📊 VRAM Statistics:');
    console.log(`  Total VRAM: ${vram.length} bytes`);
    console.log(`  Non-zero bytes: ${nonZeroBytes} (${(nonZeroBytes / vram.length * 100).toFixed(1)}%)`);
    
    // Sample first 256 bytes of tile data
    console.log('\n🎨 First 16 bytes of VRAM (tile data):');
    const sample = Array.from(vram.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`  ${sample}`);
    
    // Check LCD control
    console.log('\n🖥️  LCD Control Registers:');
    console.log(`  LCDC (0xFF40): 0x${mmu.getIO(0x40).toString(16).padStart(2, '0')}`);
    console.log(`  STAT (0xFF41): 0x${mmu.getIO(0x41).toString(16).padStart(2, '0')}`);
    console.log(`  SCY  (0xFF42): ${mmu.getIO(0x42)}`);
    console.log(`  SCX  (0xFF43): ${mmu.getIO(0x43)}`);
    console.log(`  LY   (0xFF44): ${mmu.getIO(0x44)}`);
    console.log(`  BGP  (0xFF47): 0x${mmu.getIO(0x47).toString(16).padStart(2, '0')}`);
    
    // Check CPU state
    const state = engine.getState();
    console.log('\n💾 CPU State:');
    console.log(`  PC: 0x${state.PC.toString(16).padStart(4, '0')}`);
    console.log(`  SP: 0x${state.SP.toString(16).padStart(4, '0')}`);
    console.log(`  A: 0x${state.A.toString(16).padStart(2, '0')}`);
    console.log(`  Flags: ${state.getFlags()}`);
    console.log(`  IME: ${state.IME}`);
    console.log(`  Halted: ${state.halted}`);
    
    // Check interrupt flags
    console.log('\n⚡ Interrupts:');
    console.log(`  IE (0xFFFF): 0x${mmu.read8(0xFFFF).toString(16).padStart(2, '0')}`);
    console.log(`  IF (0xFF0F): 0x${mmu.getIO(0x0F).toString(16).padStart(2, '0')}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
