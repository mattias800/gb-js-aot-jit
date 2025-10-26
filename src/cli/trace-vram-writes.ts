#!/usr/bin/env tsx
/**
 * Trace VRAM writes to understand when tile data is loaded
 */
import { loadROM } from "../loader/ROMLoader";
import { MMU } from "../runtime/MMU";
import { CPUState } from "../runtime/CPUState";
import { Interpreter } from "../runtime/Interpreter";
import { PPU } from "../runtime/PPU";

const romPath = process.argv[2];
const maxCycles = parseInt(process.argv[3] || "10000000");

if (!romPath) {
  console.error("Usage: trace-vram-writes <rom-file> [max-cycles]");
  process.exit(1);
}

const rom = loadROM(romPath).data;
const mmu = new MMU(rom);
const cpuState = new CPUState();
const ppu = new PPU(mmu, cpuState);

// Track VRAM writes
const vramWrites: Array<{address: number, value: number, cycle: number, pc: number}> = [];

// Hook into MMU write8 to trace VRAM writes
const originalWrite8 = mmu.write8.bind(mmu);
mmu.write8 = (address: number, value: number): void => {
  if (address >= 0x8000 && address < 0xA000) {
    vramWrites.push({
      address,
      value,
      cycle: cpuState.totalCycles,
      pc: cpuState.PC
    });
  }
  originalWrite8(address, value);
};

// Run emulation
let cycles = 0;
while (cycles < maxCycles && !cpuState.halted) {
  const prevCycles = cpuState.totalCycles;
  const instructionCycles = Interpreter.executeInstruction(cpuState, mmu);
  cpuState.totalCycles += instructionCycles;
  ppu.step(instructionCycles);
  cycles = cpuState.totalCycles;
}

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
    console.log(`  Cycle ${w.cycle.toString().padStart(8)}: [PC=0x${w.pc.toString(16).padStart(4, '0')}] 0x${w.address.toString(16).padStart(4, '0')} = 0x${w.value.toString(16).padStart(2, '0')}`);
  });
  
  if (tileDataWrites.length > 0) {
    console.log(`\nFirst tile data write:`);
    const first = tileDataWrites[0];
    console.log(`  Cycle ${first.cycle}: [PC=0x${first.pc.toString(16).padStart(4, '0')}] 0x${first.address.toString(16).padStart(4, '0')} = 0x${first.value.toString(16).padStart(2, '0')}`);
  }
  
  // Show unique PC addresses
  const uniquePCs = new Set(vramWrites.map(w => w.pc));
  console.log(`\nUnique PC addresses writing to VRAM: ${uniquePCs.size}`);
  const pcList = Array.from(uniquePCs).sort((a, b) => a - b);
  console.log(`  ${pcList.map(pc => `0x${pc.toString(16).padStart(4, '0')}`).join(', ')}`);
}
