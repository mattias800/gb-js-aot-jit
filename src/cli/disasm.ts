#!/usr/bin/env node
import { readFileSync } from 'fs';
import { decodeInstruction } from '../decoder/InstructionDecoder';

const main = (): void => {
  const romPath = process.argv[2];
  const startAddr = parseInt(process.argv[3] || '0x0100', 16);
  const count = parseInt(process.argv[4] || '20', 10);
  
  if (!romPath) {
    console.error('Usage: npm run disasm <rom-file> [start-address] [count]');
    process.exit(1);
  }
  
  const rom = readFileSync(romPath);
  let pc = startAddr;
  
  for (let i = 0; i < count && pc < rom.length; i++) {
    const instr = decodeInstruction(rom, pc);
    const bytes = Array.from(rom.slice(pc, pc + instr.length))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`0x${pc.toString(16).padStart(4, '0')}  ${bytes.padEnd(9)}  ${instr.mnemonic}`);
    pc += instr.length;
  }
};

main();
