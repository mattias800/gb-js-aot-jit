#!/usr/bin/env node
import { loadROM } from '../loader/ROMLoader';
import { analyzeBasicBlocksWithTargets } from '../analyzer/BasicBlockAnalyzer';
import { buildControlFlowGraph } from '../analyzer/ControlFlowGraph';
import { FlagAnalyzer } from '../analyzer/FlagAnalyzer';
import { RegisterAnalyzer } from '../analyzer/RegisterAnalyzer';
import { ConstantAnalyzer } from '../analyzer/ConstantAnalyzer';
import { transpileBlock } from '../recompiler/BlockTranspiler';

const main = (): void => {
  const romPath = process.argv[2];
  
  if (!romPath) {
    console.error('Usage: npm run find-todos <rom-file>');
    process.exit(1);
  }
  
  console.log('🔍 Finding Unimplemented Instructions\n');
  
  try {
    const rom = loadROM(romPath);
    console.log(`Analyzing ${rom.header.title}...\n`);
    
    const database = analyzeBasicBlocksWithTargets(rom);
    const cfg = buildControlFlowGraph(database);
    
    const flagAnalyzer = new FlagAnalyzer(database.blocks, cfg);
    flagAnalyzer.analyze();
    
    const registerAnalyzer = new RegisterAnalyzer(database.blocks, cfg);
    registerAnalyzer.analyze();
    
    const constantAnalyzer = new ConstantAnalyzer(database.blocks, cfg);
    constantAnalyzer.analyze();
    
    const todos = new Map<string, number>();
    
    for (const [address, block] of database.blocks) {
      const jsCode = transpileBlock(block, rom.data, {
        flagAnalyzer,
        registerAnalyzer,
        constantAnalyzer,
      });
      
      // Find TODO comments
      const todoMatches = jsCode.match(/\/\/ TODO: (.+)/g);
      if (todoMatches) {
        for (const match of todoMatches) {
          const instruction = match.replace('// TODO: ', '');
          todos.set(instruction, (todos.get(instruction) || 0) + 1);
        }
      }
    }
    
    if (todos.size === 0) {
      console.log('✅ No unimplemented instructions found!');
    } else {
      console.log(`Found ${todos.size} unimplemented instruction types:\n`);
      
      const sorted = Array.from(todos.entries())
        .sort((a, b) => b[1] - a[1]);
      
      for (const [instruction, count] of sorted) {
        console.log(`  ${instruction.padEnd(20)} (${count} occurrences)`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

main();
