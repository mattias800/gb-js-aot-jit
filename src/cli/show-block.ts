#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { analyzeBasicBlocksWithTargets } from '../analyzer/BasicBlockAnalyzer';

const main = (): void => {
  const romPath = process.argv[2];
  const blockAddr = parseInt(process.argv[3] || '0x0100', 16);
  
  if (!romPath) {
    console.error('Usage: npm run show-block <rom-file> <block-address>');
    process.exit(1);
  }
  
  console.log(`🔍 Basic Block Info\n`);
  
  try {
    const rom = loadROM(romPath);
    const database = analyzeBasicBlocksWithTargets(rom);
    
    const block = database.blocks.get(blockAddr);
    
    if (!block) {
      console.log(`❌ No block found at address 0x${blockAddr.toString(16)}`);
      console.log(`\nAvailable blocks near this address:`);
      
      // Show nearby blocks
      const nearby = Array.from(database.blocks.keys())
        .filter(addr => Math.abs(addr - blockAddr) < 32)
        .sort((a, b) => a - b);
      
      for (const addr of nearby) {
        console.log(`  0x${addr.toString(16).padStart(4, '0')}`);
      }
      
      process.exit(1);
    }
    
    console.log(`Block at 0x${blockAddr.toString(16).padStart(4, '0')}:`);
    console.log(`  Start: 0x${block.startAddress.toString(16).padStart(4, '0')}`);
    console.log(`  End:   0x${block.endAddress.toString(16).padStart(4, '0')}`);
    console.log(`  Size:  ${block.endAddress - block.startAddress + 1} bytes`);
    console.log(`  Instructions: ${block.instructions.length}`);
    console.log(`  Exit type: ${block.exitType}`);
    
    if (block.targets.length > 0) {
      console.log(`  Targets: ${block.targets.map(t => '0x' + t.toString(16)).join(', ')}`);
    }
    
    console.log(`\n  Instructions:`);
    for (const instr of block.instructions) {
      const bytes = Array.from(rom.data.slice(instr.address, instr.address + instr.length))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      const cyclesStr = Array.isArray(instr.cycles) ? instr.cycles.join('/') : instr.cycles.toString();
      console.log(`    0x${instr.address.toString(16).padStart(4, '0')}:  ${bytes.padEnd(9)}  ${instr.mnemonic.padEnd(20)}  (${cyclesStr} cycles)`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
