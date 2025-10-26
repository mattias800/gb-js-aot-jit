#!/usr/bin/env tsx
/**
 * Check which opcodes are implemented vs missing in the Interpreter
 */
import { readFileSync } from 'fs';

const interpreterPath = './src/runtime/Interpreter.ts';
const interpreterCode = readFileSync(interpreterPath, 'utf-8');

// Extract all implemented opcodes from the interpreter
const implementedOpcodes = new Set<number>();

// Match patterns like: else if (opcode === 0xXX)
const opcodeMatches = interpreterCode.matchAll(/opcode === 0x([0-9a-fA-F]{2})/g);
for (const match of opcodeMatches) {
  implementedOpcodes.add(parseInt(match[1], 16));
}

// Match ranges like: opcode >= 0xXX && opcode <= 0xYY
const rangeMatches = interpreterCode.matchAll(/opcode >= 0x([0-9a-fA-F]{2}) && opcode <= 0x([0-9a-fA-F]{2})/g);
for (const match of rangeMatches) {
  const start = parseInt(match[1], 16);
  const end = parseInt(match[2], 16);
  for (let i = start; i <= end; i++) {
    implementedOpcodes.add(i);
  }
}

// Game Boy has 256 main opcodes + 256 CB-prefixed opcodes
const allOpcodes = Array.from({ length: 256 }, (_, i) => i);
const missingOpcodes = allOpcodes.filter(op => !implementedOpcodes.has(op));

console.log(`\u{1F4CA} Opcode Implementation Status\n`);
console.log(`Implemented: ${implementedOpcodes.size}/256 (${(implementedOpcodes.size / 256 * 100).toFixed(1)}%)`);
console.log(`Missing: ${missingOpcodes.length}/256\n`);

if (missingOpcodes.length > 0) {
  console.log(`Missing opcodes:`);
  
  // Group by ranges for readability
  let rangeStart = missingOpcodes[0];
  let rangePrev = missingOpcodes[0];
  
  for (let i = 1; i <= missingOpcodes.length; i++) {
    const current = missingOpcodes[i];
    
    if (current !== rangePrev + 1 || i === missingOpcodes.length) {
      // End of range
      if (rangeStart === rangePrev) {
        console.log(`  0x${rangeStart.toString(16).padStart(2, '0').toUpperCase()}`);
      } else {
        console.log(`  0x${rangeStart.toString(16).padStart(2, '0').toUpperCase()} - 0x${rangePrev.toString(16).padStart(2, '0').toUpperCase()}`);
      }
      rangeStart = current;
    }
    rangePrev = current;
  }
}

// Check if CB prefix is handled
const hasCBPrefix = interpreterCode.includes('opcode === 0xCB');
console.log(`\nCB-prefixed opcodes: ${hasCBPrefix ? '\u2713 Handler found' : '\u26A0\uFE0F  Not implemented'}`);

if (!hasCBPrefix) {
  console.log(`\nNote: CB-prefixed opcodes are bit operations (BIT, SET, RES, rotate/shift).`);
  console.log(`These are critical for many games and should be implemented.`);
}
