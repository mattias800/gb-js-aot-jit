#!/usr/bin/env node
/**
 * Debug transpiler output for a specific block
 */
import { loadROM } from '../loader/ROMLoader';
import { analyzeBlockWithTargetsAt } from '../analyzer/BasicBlockAnalyzer';
import { transpileBlock } from '../recompiler/BlockTranspiler';

const main = (): void => {
  const romPath = process.argv[2];
  const addressStr = process.argv[3];
  
  if (!romPath || !addressStr) {
    console.error('Usage: npm run debug-transpile <rom-file> <address>');
    process.exit(1);
  }
  
  const address = parseInt(addressStr, 16);
  
  console.log(`🔍 Debugging transpiler at address 0x${address.toString(16)}\n`);
  
  const rom = loadROM(romPath);
  
  // Analyze block dynamically
  const block = analyzeBlockWithTargetsAt(rom.data, address, new Set());
  
  if (!block) {
    console.error(`❌ Failed to analyze block at 0x${address.toString(16)}`);
    process.exit(1);
  }
  
  console.log(`📦 Block Info:`);
  console.log(`  Start: 0x${block.startAddress.toString(16)}`);
  console.log(`  End: 0x${block.endAddress.toString(16)}`);
  console.log(`  Instructions: ${block.instructions.length}`);
  console.log(`  Exit type: ${block.exitType}`);
  console.log(`  Targets: ${block.targets.map(t => `0x${t.toString(16)}`).join(', ')}`);
  console.log();
  
  console.log(`📋 Instructions:`);
  let addr = block.startAddress;
  for (const instr of block.instructions) {
    console.log(`  0x${addr.toString(16)}  ${instr.mnemonic}`);
    addr += instr.length;
  }
  console.log();
  
  // Try to transpile
  try {
    console.log(`🔨 Transpiling...\n`);
    const jsCode = transpileBlock(block, rom.data, {
      flagAnalyzer: undefined as any,
      registerAnalyzer: undefined as any,
      constantAnalyzer: undefined as any,
    });
    
    console.log(`✅ Generated JavaScript:\n`);
    console.log('─'.repeat(60));
    console.log(jsCode);
    console.log('─'.repeat(60));
    
  } catch (error) {
    console.error(`\n❌ Transpilation failed:`, error);
    process.exit(1);
  }
};

main();
