#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { analyzeBasicBlocksWithTargets } from '../analyzer/BasicBlockAnalyzer';

const main = (): void => {
  const romPath = process.argv[2];
  
  if (!romPath) {
    console.error('Usage: npm run find-invalid <rom-file>');
    process.exit(1);
  }
  
  console.log('🔍 Finding Invalid Instructions\n');
  
  try {
    const rom = loadROM(romPath);
    const database = analyzeBasicBlocksWithTargets(rom);
    
    for (const [address, block] of database.blocks) {
      let currentAddr = address;
      for (const instr of block.instructions) {
        if (instr.mnemonic.includes('INVALID') || instr.mnemonic.includes('UNKNOWN')) {
          console.log(`Found INVALID/UNKNOWN at 0x${currentAddr.toString(16).padStart(4, '0')}`);
          console.log(`  Mnemonic: ${instr.mnemonic}`);
          console.log(`  Opcode: 0x${rom.data[currentAddr].toString(16).padStart(2, '0')}`);
          console.log(`  Block: 0x${address.toString(16).padStart(4, '0')}`);
          
          // Show surrounding bytes
          const start = Math.max(0, currentAddr - 5);
          const end = Math.min(rom.data.length, currentAddr + 10);
          const bytes = Array.from(rom.data.slice(start, end))
            .map((b, i) => {
              const addr = start + i;
              const mark = addr === currentAddr ? '>' : ' ';
              return `${mark}${addr.toString(16).padStart(4, '0')}: ${b.toString(16).padStart(2, '0')}`;
            });
          console.log(`\n  Context:\n${bytes.join('\n')}\n`);
        }
        currentAddr += instr.length;
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
