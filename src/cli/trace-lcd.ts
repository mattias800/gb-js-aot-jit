#!/usr/bin/env tsx
/**
 * Trace LCD control register (LCDC at 0xFF40) to understand display state
 */
import { loadROM } from "../loader/ROMLoader";
import { MMU } from "../runtime/MMU";
import { CPUState } from "../runtime/CPUState";
import { Interpreter } from "../runtime/Interpreter";
import { PPU } from "../runtime/PPU";

const romPath = process.argv[2];
const maxCycles = parseInt(process.argv[3] || "100000");

if (!romPath) {
  console.error("Usage: trace-lcd <rom-file> [max-cycles]");
  process.exit(1);
}

const rom = loadROM(romPath).data;
const mmu = new MMU(rom);
const cpuState = new CPUState();
const ppu = new PPU(mmu, cpuState);

// Track LCDC changes
const lcdcChanges: Array<{cycle: number, pc: number, value: number}> = [];

// Hook into MMU write8 to trace LCDC writes (0xFF40)
const originalWrite8 = mmu.write8.bind(mmu);
mmu.write8 = (address: number, value: number): void => {
  if (address === 0xFF40) {
    lcdcChanges.push({
      cycle: cpuState.totalCycles,
      pc: cpuState.PC,
      value
    });
  }
  originalWrite8(address, value);
};

// Run emulation
let cycles = 0;
while (cycles < maxCycles && !cpuState.halted) {
  const instructionCycles = Interpreter.executeInstruction(cpuState, mmu);
  cpuState.totalCycles += instructionCycles;
  ppu.step(instructionCycles);
  cycles = cpuState.totalCycles;
}

// Decode LCDC bits
const decodeLCDC = (lcdc: number): string => {
  const bits: string[] = [];
  if (lcdc & 0x80) bits.push("LCD_ON");
  if (lcdc & 0x40) bits.push("WIN_TILEMAP_9C00");
  if (lcdc & 0x20) bits.push("WIN_ON");
  if (lcdc & 0x10) bits.push("BG_TILEDATA_8000");
  if (lcdc & 0x08) bits.push("BG_TILEMAP_9C00");
  if (lcdc & 0x04) bits.push("OBJ_8x16");
  if (lcdc & 0x02) bits.push("OBJ_ON");
  if (lcdc & 0x01) bits.push("BG_ON");
  return bits.join(" | ");
};

console.log(`\nLCDC changes: ${lcdcChanges.length}`);

if (lcdcChanges.length === 0) {
  console.log("No LCDC writes detected!");
  console.log(`\nInitial LCDC value: 0x${mmu.getIO(0x40).toString(16).padStart(2, '0')}`);
  console.log(`  ${decodeLCDC(mmu.getIO(0x40))}`);
} else {
  console.log("\nAll LCDC changes:");
  lcdcChanges.forEach(change => {
    console.log(`  Cycle ${change.cycle.toString().padStart(8)}: [PC=0x${change.pc.toString(16).padStart(4, '0')}] LCDC = 0x${change.value.toString(16).padStart(2, '0')}`);
    console.log(`    ${decodeLCDC(change.value)}`);
  });
}

// Show final state
console.log(`\nFinal LCDC: 0x${mmu.getIO(0x40).toString(16).padStart(2, '0')}`);
console.log(`  ${decodeLCDC(mmu.getIO(0x40))}`);

// Check if LCD is enabled
const lcdc = mmu.getIO(0x40);
if (!(lcdc & 0x80)) {
  console.log("\n⚠️  LCD is OFF - VRAM access is unrestricted but display is disabled");
} else {
  console.log("\n✓ LCD is ON");
}
