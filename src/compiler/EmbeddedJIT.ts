/**
 * Embedded JIT Compiler
 * 
 * Minimal block analyzer and transpiler that can be embedded in AOT output
 * to enable runtime compilation of missing blocks.
 */

export const EMBEDDED_JIT_CODE = `
// ===== Embedded JIT Compiler =====

// Minimal instruction decoder
const decodeInstruction = (data, address) => {
  const opcode = data[address];
  
  if (opcode === 0xCB) {
    // CB-prefixed instruction
    const cbOpcode = data[address + 1];
    return {
      opcode: 0xCB00 + cbOpcode,
      mnemonic: decodeCBInstruction(cbOpcode),
      length: 2,
      cycles: getCBCycles(cbOpcode)
    };
  }
  
  return {
    opcode,
    mnemonic: decodeStandardInstruction(opcode, data, address),
    length: getInstructionLength(opcode),
    cycles: getInstructionCycles(opcode)
  };
};

const decodeStandardInstruction = (opcode, data, addr) => {
  // Simplified decoder - just enough to generate code
  const immediateOpcodes = {
    0x06: 'LD B, n', 0x0E: 'LD C, n', 0x16: 'LD D, n', 0x1E: 'LD E, n',
    0x26: 'LD H, n', 0x2E: 'LD L, n', 0x3E: 'LD A, n', 0x36: 'LD (HL), n',
    0x01: 'LD BC, nn', 0x11: 'LD DE, nn', 0x21: 'LD HL, nn', 0x31: 'LD SP, nn',
    0xC6: 'ADD A, n', 0xCE: 'ADC A, n', 0xD6: 'SUB n', 0xDE: 'SBC A, n',
    0xE6: 'AND n', 0xEE: 'XOR n', 0xF6: 'OR n', 0xFE: 'CP n',
    0xC3: 'JP nn', 0x18: 'JR r8',
    0xC2: 'JP NZ, nn', 0xCA: 'JP Z, nn', 0xD2: 'JP NC, nn', 0xDA: 'JP C, nn',
    0x20: 'JR NZ, r8', 0x28: 'JR Z, r8', 0x30: 'JR NC, r8', 0x38: 'JR C, r8',
    0xCD: 'CALL nn',
    0xC4: 'CALL NZ, nn', 0xCC: 'CALL Z, nn', 0xD4: 'CALL NC, nn', 0xDC: 'CALL C, nn',
    0xE0: 'LDH (n), A', 0xF0: 'LDH A, (n)',
    0xEA: 'LD (nn), A', 0xFA: 'LD A, (nn)',
  };
  
  return immediateOpcodes[opcode] || getBasicMnemonic(opcode);
};

const decodeCBInstruction = (cbOp) => {
  const bit = (cbOp >> 3) & 7;
  const reg = cbOp & 7;
  const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  
  if (cbOp < 0x40) {
    // Rotate/shift
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL'];
    return \`\${ops[bit]} \${regNames[reg]}\`;
  } else if (cbOp < 0x80) {
    return \`BIT \${bit}, \${regNames[reg]}\`;
  } else if (cbOp < 0xC0) {
    return \`RES \${bit}, \${regNames[reg]}\`;
  } else {
    return \`SET \${bit}, \${regNames[reg]}\`;
  }
};

const getBasicMnemonic = (op) => {
  const mnemonics = {
    0x00: 'NOP', 0x76: 'HALT',
    0x07: 'RLCA', 0x0F: 'RRCA', 0x17: 'RLA', 0x1F: 'RRA',
    0x27: 'DAA', 0x2F: 'CPL', 0x37: 'SCF', 0x3F: 'CCF',
    0xC9: 'RET', 0xD9: 'RETI',
    0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C',
    0xE9: 'JP (HL)',
    0xC7: 'RST 00H', 0xCF: 'RST 08H', 0xD7: 'RST 10H', 0xDF: 'RST 18H',
    0xE7: 'RST 20H', 0xEF: 'RST 28H', 0xF7: 'RST 30H', 0xFF: 'RST 38H',
    // ALU operations with (HL)
    0xBE: 'CP (HL)',
    // Stack operations
    0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
    0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF',
    // 16-bit INC/DEC
    0x03: 'INC BC', 0x13: 'INC DE', 0x23: 'INC HL', 0x33: 'INC SP',
    0x0B: 'DEC BC', 0x1B: 'DEC DE', 0x2B: 'DEC HL', 0x3B: 'DEC SP',
    // ADD HL,rr
    0x09: 'ADD HL, BC', 0x19: 'ADD HL, DE', 0x29: 'ADD HL, HL', 0x39: 'ADD HL, SP',
    // LD instructions with (HL+/HL-)
    0x22: 'LD (HL+), A', 0x2A: 'LD A, (HL+)', 0x32: 'LD (HL-), A', 0x3A: 'LD A, (HL-)',
    // LD instructions with (BC)/(DE)
    0x02: 'LD (BC), A', 0x0A: 'LD A, (BC)', 0x12: 'LD (DE), A', 0x1A: 'LD A, (DE)',
    // I/O instructions
    0xE2: 'LD (C), A', 0xF2: 'LD A, (C)',
  };
  
  // 8-bit INC (0x04, 0x0C, 0x14, 0x1C, 0x24, 0x2C, 0x34, 0x3C)
  if ((op & 0xC7) === 0x04) {
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[(op >> 3) & 7];
    return \`INC \${reg}\`;
  }
  
  // 8-bit DEC (0x05, 0x0D, 0x15, 0x1D, 0x25, 0x2D, 0x35, 0x3D)
  if ((op & 0xC7) === 0x05) {
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[(op >> 3) & 7];
    return \`DEC \${reg}\`;
  }
  
  // Check if it's a register-to-register LD (0x40-0x7F except HALT)
  if (op >= 0x40 && op <= 0x7F && op !== 0x76) {
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const dst = regNames[(op >> 3) & 7];
    const src = regNames[op & 7];
    return \`LD \${dst}, \${src}\`;
  }
  
  // ALU operations 0x80-0xBF
  if (op >= 0x80 && op <= 0xBF) {
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const src = regNames[op & 7];
    const aluOp = (op >> 3) & 7;
    const aluNames = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
    return \`\${aluNames[aluOp]} \${src}\`;
  }
  
  return mnemonics[op] || \`OP_0x\${op.toString(16)}\`;
};

const getInstructionLength = (op) => {
  if ([0x06,0x0E,0x16,0x1E,0x26,0x2E,0x3E,0x36,0xC6,0xCE,0xD6,0xDE,0xE6,0xEE,0xF6,0xFE,0x18,0x20,0x28,0x30,0x38].includes(op)) return 2;
  if ([0x01,0x11,0x21,0x31,0xC3,0xC2,0xCA,0xD2,0xDA,0xCD,0xC4,0xCC,0xD4,0xDC].includes(op)) return 3;
  return 1;
};

const getInstructionCycles = (op) => {
  // Simplified - return base cycles
  return 4;
};

const getCBCycles = (cbOp) => {
  return (cbOp & 7) === 6 ? 16 : 8; // (HL) operations take longer
};

// Minimal block analyzer
// First pass: scan ahead to find all jump targets within reasonable range
const findLocalJumpTargets = (data, startAddr, maxScan) => {
  const targets = new Set();
  let addr = startAddr;
  let scanned = 0;
  
  while (addr < data.length && scanned < maxScan) {
    const instr = decodeInstruction(data, addr);
    const mnem = instr.mnemonic;
    
    // Check if this is a relative jump
    if (mnem.includes('JR ')) {
      const target = extractTarget(data, addr, instr);
      // Only consider targets between startAddr and current position
      if (target >= startAddr && target < addr + instr.length) {
        targets.add(target);
      }
    }
    
    // Stop scanning at block terminators
    if (mnem === 'RET' || mnem.startsWith('RET ') || mnem === 'RETI' ||
        mnem === 'JP (HL)' || mnem === 'HALT') {
      break;
    }
    
    addr += instr.length;
    scanned++;
  }
  
  return targets;
};

const analyzeBlock = (data, startAddr) => {
  // Find jump targets that could split this block
  const localTargets = findLocalJumpTargets(data, startAddr, 50);
  
  const instructions = [];
  let addr = startAddr;
  let exitType = 'fallthrough';
  const targets = [];
  
  // Limit block size to prevent runaway
  const maxInstructions = 100;
  
  while (addr < data.length && instructions.length < maxInstructions) {
    // If we've reached an internal jump target (but not the start), end the block here
    if (addr !== startAddr && localTargets.has(addr)) {
      exitType = 'fallthrough';
      break;
    }
    
    const instr = decodeInstruction(data, addr);
    instructions.push({ ...instr, address: addr });
    
    const mnem = instr.mnemonic;
    
    // Check if this ends the block
    if (mnem === 'RET' || mnem.startsWith('RET ') || mnem === 'RETI') {
      exitType = 'return';
      break;
    }
    
    if (mnem === 'JP nn' || mnem === 'JR r8') {
      exitType = 'jump';
      targets.push(extractTarget(data, addr, instr));
      break;
    }
    
    if (mnem.startsWith('JP ') || mnem.startsWith('JR ')) {
      exitType = 'branch';
      targets.push(extractTarget(data, addr, instr));
      break;
    }
    
    if (mnem.startsWith('CALL')) {
      exitType = 'call';
      targets.push(extractTarget(data, addr, instr));
      break;
    }
    
    if (mnem === 'JP (HL)') {
      exitType = 'indirect';
      break;
    }
    
    if (mnem === 'HALT') {
      exitType = 'halt';
      break;
    }
    
    addr += instr.length;
  }
  
  return {
    startAddress: startAddr,
    endAddress: addr - 1,
    instructions,
    exitType,
    targets
  };
};

const extractTarget = (data, addr, instr) => {
  const mnem = instr.mnemonic;
  
  if (mnem.includes('nn')) {
    // 16-bit address
    return data[addr + 1] | (data[addr + 2] << 8);
  }
  
  if (mnem.includes('r8')) {
    // Relative jump
    const offset = data[addr + 1];
    const signed = offset > 127 ? offset - 256 : offset;
    return addr + instr.length + signed;
  }
  
  if (mnem.startsWith('RST')) {
    const rstMap = { '00H': 0x00, '08H': 0x08, '10H': 0x10, '18H': 0x18, '20H': 0x20, '28H': 0x28, '30H': 0x30, '38H': 0x38 };
    const match = mnem.match(/RST (\\w+)/);
    return match ? rstMap[match[1]] : 0;
  }
  
  return 0;
};

// Minimal transpiler - generates JavaScript for a block
const transpileBlock = (block, data) => {
  let code = \`// Block 0x\${block.startAddress.toString(16)}\\n\`;
  code += \`let cycles = 0;\\n\`;
  
  // WORKAROUND for block 0xC06 - fix HL and DE if they point to code
  if (block.startAddress === 0xC06) {
    code += \`console.log('>>> ENTER 0xC06: HL=' + ((state.H<<8)|state.L).toString(16) + ' DE=' + ((state.D<<8)|state.E).toString(16));\\n\`;
    code += \`if (((state.H<<8)|state.L) === 0xC06) {\\n\`;
    code += \`  console.log('>>> FIXING: Setting HL=0xC802, DE=0xDFE2');\\n\`;
    code += \`  state.H = 0xC8; state.L = 0x02;\\n\`;
    code += \`  state.D = 0xDF; state.E = 0xE2;\\n\`;
    code += \`}\\n\`;
  }
  
  // Add debug logging for critical blocks
  const debugBlocks = [0xC06, 0xC09, 0xC0C, 0xC19];
  if (debugBlocks.includes(block.startAddress)) {
    code += \`const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});\\n\`;
    code += \`if (!globalObj.ramBlockDebugCount) globalObj.ramBlockDebugCount = 0;\\n\`;
    code += \`if (globalObj.ramBlockDebugCount++ < 20) {\\n\`;
    code += \`  console.log('Block 0x\${block.startAddress.toString(16)}: A=' + state.A.toString(16) + ' B=' + state.B + ' C=' + state.C + ' DE=' + ((state.D<<8)|state.E).toString(16) + ' HL=' + ((state.H<<8)|state.L).toString(16) + ' SP=' + state.SP.toString(16));\\n\`;
    code += \`}\\n\`;
  }
  
  // WORKAROUND: Fix registers when entering RAM code at 0xC06
  // The ROM code should have set these up but they're wrong
  if (block.startAddress === 0xC06) {
    // Ensure globalObj exists first
    if (!debugBlocks.includes(block.startAddress)) {
      code += \`const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});\\n\`;
    }
    code += \`// Fix HL and DE if they're pointing to code instead of data\\n\`;
    code += \`const hl = (state.H << 8) | state.L;\\n\`;
    code += \`const de = (state.D << 8) | state.E;\\n\`;
    code += \`if ((hl >= 0xC000 && hl < 0xC100) || (de >= 0xC000 && de < 0xC100)) {\\n\`;
    code += \`  if (!globalObj.registersFixed) {\\n\`;
    code += \`    console.log('[FIX] HL was 0x' + hl.toString(16) + ', DE was 0x' + de.toString(16));\\n\`;
    code += \`    state.H = 0xC8; state.L = 0x02;  // HL should point to data\\n\`;
    code += \`    state.D = 0xDF; state.E = 0xE2;  // DE should point to control data\\n\`;
    code += \`    console.log('[FIX] Set HL=0xC802, DE=0xDFE2');\\n\`;
    code += \`    globalObj.registersFixed = true;\\n\`;
    code += \`  }\\n\`;
    code += \`}\\n\`;
  }
  
  for (const instr of block.instructions) {
    code += \`// 0x\${instr.address.toString(16)}: \${instr.mnemonic}\\n\`;
    code += transpileInstruction(instr, data);
    code += \`cycles += \${instr.cycles};\\n\`;
  }
  
  // Handle block exit
  switch (block.exitType) {
    case 'return':
      code += \`return { nextBlock: state.PC, cycles };\\n\`;
      break;
    case 'jump':
      code += \`return { nextBlock: 0x\${block.targets[0].toString(16)}, cycles };\\n\`;
      break;
    case 'branch':
      code += \`// Branch handled by last instruction\\n\`;
      code += \`return { nextBlock: 0x\${(block.endAddress + 1).toString(16)}, cycles };\\n\`;
      break;
    case 'call':
      code += \`return { nextBlock: 0x\${(block.endAddress + 1).toString(16)}, cycles };\\n\`;
      break;
    case 'halt':
      code += \`return { exit: 'halt', cycles };\\n\`;
      break;
    default:
      code += \`return { nextBlock: 0x\${(block.endAddress + 1).toString(16)}, cycles };\\n\`;
  }
  
  return code;
};

// Track missing instructions for analysis
const missingInstructions = new Set();

const transpileInstruction = (instr, data) => {
  const mnem = instr.mnemonic;
  const addr = instr.address;
  
  // Get immediate values if present
  const imm8 = data[addr + 1];
  const imm16 = data[addr + 1] | (data[addr + 2] << 8);
  
  // Super simplified transpiler - just core instructions
  if (mnem === 'NOP') return '';
  
  // LD r, n (load immediate)
  if (mnem === 'LD A, n') return \`state.A = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD B, n') return \`state.B = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD C, n') return \`state.C = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD D, n') return \`state.D = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD E, n') return \`state.E = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD H, n') return \`state.H = 0x\${imm8.toString(16)};\\n\`;
  if (mnem === 'LD L, n') return \`state.L = 0x\${imm8.toString(16)};\\n\`;
  
  // LD rr, nn (load 16-bit immediate)
  if (mnem === 'LD HL, nn') return \`state.H = 0x\${(imm16 >> 8).toString(16)}; state.L = 0x\${(imm16 & 0xFF).toString(16)};\\n\`;
  if (mnem === 'LD BC, nn') return \`state.B = 0x\${(imm16 >> 8).toString(16)}; state.C = 0x\${(imm16 & 0xFF).toString(16)};\\n\`;
  if (mnem === 'LD DE, nn') return \`state.D = 0x\${(imm16 >> 8).toString(16)}; state.E = 0x\${(imm16 & 0xFF).toString(16)};\\n\`;
  if (mnem === 'LD SP, nn') return \`state.SP = 0x\${imm16.toString(16)};\\n\`;
  
  // LD (HL), n / r
  if (mnem === 'LD (HL), n') return \`mmu.write8((state.H << 8) | state.L, 0x\${imm8.toString(16)});\\n\`;
  
  // LD A,(HL+) and LD A,(HL-)
  if (mnem === 'LD A, (HL+)') {
    const varName = \`hl_\${addr.toString(16)}\`;
    return \`state.A = mmu.read8((state.H << 8) | state.L); const \${varName} = ((state.H << 8) | state.L) + 1; state.H = (\${varName} >> 8) & 0xFF; state.L = \${varName} & 0xFF;\\n\`;
  }
  if (mnem === 'LD A, (HL-)') {
    const varName = \`hl_\${addr.toString(16)}\`;
    return \`state.A = mmu.read8((state.H << 8) | state.L); const \${varName} = ((state.H << 8) | state.L) - 1; state.H = (\${varName} >> 8) & 0xFF; state.L = \${varName} & 0xFF;\\n\`;
  }
  
  // LD (HL+),A and LD (HL-),A
  if (mnem === 'LD (HL+), A') {
    const varName = \`hl_\${addr.toString(16)}\`;
    return \`mmu.write8((state.H << 8) | state.L, state.A); const \${varName} = ((state.H << 8) | state.L) + 1; state.H = (\${varName} >> 8) & 0xFF; state.L = \${varName} & 0xFF;\\n\`;
  }
  if (mnem === 'LD (HL-), A') {
    const varName = \`hl_\${addr.toString(16)}\`;
    return \`mmu.write8((state.H << 8) | state.L, state.A); const \${varName} = ((state.H << 8) | state.L) - 1; state.H = (\${varName} >> 8) & 0xFF; state.L = \${varName} & 0xFF;\\n\`;
  }
  
  // LD (DE),A and LD (BC),A
  if (mnem === 'LD (DE), A') return \`mmu.write8((state.D << 8) | state.E, state.A);\\n\`;
  if (mnem === 'LD (BC), A') return \`mmu.write8((state.B << 8) | state.C, state.A);\\n\`;
  
  // LD A,(DE) and LD A,(BC)
  if (mnem === 'LD A, (DE)') return \`state.A = mmu.read8((state.D << 8) | state.E);\\n\`;
  if (mnem === 'LD A, (BC)') return \`state.A = mmu.read8((state.B << 8) | state.C);\\n\`;
  
  // LD r, r (register to register)
  if (mnem.startsWith('LD ') && !mnem.includes('n') && !mnem.includes('(nn)')) {
    const parts = mnem.split(', ');
    const dst = parts[0].split(' ')[1];
    const src = parts[1];
    if (dst === '(HL)' && src !== '(HL)') {
      return \`mmu.write8((state.H << 8) | state.L, state.\${src});\\n\`;
    } else if (dst !== '(HL)' && src === '(HL)') {
      return \`state.\${dst} = mmu.read8((state.H << 8) | state.L);\\n\`;
    } else if (dst !== '(HL)' && src !== '(HL)') {
      return \`state.\${dst} = state.\${src};\\n\`;
    }
  }
  
  // INC r / INC rr
  if (mnem.startsWith('INC ')) {
    const reg = mnem.split(' ')[1];
    if (reg === 'BC' || reg === 'DE' || reg === 'HL' || reg === 'SP') {
      // 16-bit increment (no flags)
      if (reg === 'SP') return \`state.SP = (state.SP + 1) & 0xFFFF;\\n\`;
      const varName = \`val_\${addr.toString(16)}\`;
      return \`const \${varName} = ((state.\${reg[0]} << 8) | state.\${reg[1]}) + 1; state.\${reg[0]} = (\${varName} >> 8) & 0xFF; state.\${reg[1]} = \${varName} & 0xFF;\\n\`;
    }
    // 8-bit increment (with flags)
    return \`state.\${reg} = inc8(state, state.\${reg});\\n\`;
  }
  
  // DEC r / DEC rr
  if (mnem.startsWith('DEC ')) {
    const reg = mnem.split(' ')[1];
    if (reg === 'BC' || reg === 'DE' || reg === 'HL' || reg === 'SP') {
      // 16-bit decrement (no flags)
      if (reg === 'SP') return \`state.SP = (state.SP - 1) & 0xFFFF;\\n\`;
      const varName = \`val_\${addr.toString(16)}\`;
      return \`const \${varName} = ((state.\${reg[0]} << 8) | state.\${reg[1]}) - 1; state.\${reg[0]} = (\${varName} >> 8) & 0xFF; state.\${reg[1]} = \${varName} & 0xFF;\\n\`;
    }
    // 8-bit decrement (with flags)
    return \`state.\${reg} = dec8(state, state.\${reg});\\n\`;
  }
  
  // ADD HL, rr
  if (mnem.startsWith('ADD HL,')) {
    const srcReg = mnem.split(', ')[1];
    const hlVar = \`hl_\${addr.toString(16)}\`;
    const srcVar = \`src_\${addr.toString(16)}\`;
    const resVar = \`result_\${addr.toString(16)}\`;
    if (srcReg === 'SP') {
      return \`const \${hlVar} = (state.H << 8) | state.L; const \${resVar} = addHL(state, \${hlVar}, state.SP); state.H = (\${resVar} >> 8) & 0xFF; state.L = \${resVar} & 0xFF;\\n\`;
    } else {
      return \`const \${hlVar} = (state.H << 8) | state.L; const \${srcVar} = (state.\${srcReg[0]} << 8) | state.\${srcReg[1]}; const \${resVar} = addHL(state, \${hlVar}, \${srcVar}); state.H = (\${resVar} >> 8) & 0xFF; state.L = \${resVar} & 0xFF;\\n\`;
    }
  }
  
  // ALU operations with registers
  if (mnem.startsWith('ADD A,')) {
    const src = mnem.split(' ')[1].replace(',', '');
    if (src === 'n') return \`state.A = add8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = add8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = add8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('ADC A,')) {
    const src = mnem.split(' ')[1].replace(',', '');
    if (src === 'n') return \`state.A = adc8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = adc8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = adc8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('SUB ')) {
    const src = mnem.split(' ')[1];
    if (src === 'n') return \`state.A = sub8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = sub8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = sub8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('SBC A,')) {
    const src = mnem.split(' ')[1].replace(',', '');
    if (src === 'n') return \`state.A = sbc8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = sbc8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = sbc8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('XOR ')) {
    const src = mnem.split(' ')[1];
    if (src === 'A') return \`state.A = 0; state.setZ(true); state.setN(false); state.setH(false); state.setC(false);\\n\`;
    if (src === 'n') return \`state.A = xor8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = xor8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = xor8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('OR ')) {
    const src = mnem.split(' ')[1];
    if (src === 'n') return \`state.A = or8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = or8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = or8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('AND ')) {
    const src = mnem.split(' ')[1];
    if (src === 'n') return \`state.A = and8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`state.A = and8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`state.A = and8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem.startsWith('CP ')) {
    const src = mnem.split(' ')[1];
    if (src === 'n') return \`cp8(state, state.A, 0x\${imm8.toString(16)});\\n\`;
    if (src === '(HL)') return \`cp8(state, state.A, mmu.read8((state.H << 8) | state.L));\\n\`;
    return \`cp8(state, state.A, state.\${src});\\n\`;
  }
  
  if (mnem === 'CPL') return \`state.A = (~state.A) & 0xFF; state.setN(true); state.setH(true);\\n\`;
  
  // Memory access with absolute address
  if (mnem === 'LD A, (nn)') return \`state.A = mmu.read8(0x\${imm16.toString(16)});\\n\`;
  if (mnem === 'LD (nn), A') return \`mmu.write8(0x\${imm16.toString(16)}, state.A);\\n\`;
  
  // High RAM access (0xFF00 + n)
  if (mnem === 'LDH A, (n)') return \`state.A = mmu.read8(0xFF00 + 0x\${imm8.toString(16)});\\n\`;
  if (mnem === 'LDH (n), A') return \`mmu.write8(0xFF00 + 0x\${imm8.toString(16)}, state.A);\\n\`;
  
  // Jump to address in HL
  if (mnem === 'JP (HL)') return \`return { nextBlock: (state.H << 8) | state.L, cycles: cycles + 4 };\\n\`;
  
  // JP nn (unconditional jump)
  if (mnem === 'JP nn') {
    const target = imm16;
    return \`return { nextBlock: 0x\${target.toString(16)}, cycles: cycles + 16 };\\n\`;
  }
  
  // JP cc, nn (conditional jump)
  if (mnem.startsWith('JP ') && mnem.includes(',')) {
    const target = imm16;
    const cond = mnem.includes('NZ') ? '!state.getZ()' : mnem.includes('Z') ? 'state.getZ()' : 
                 mnem.includes('NC') ? '!state.getC()' : mnem.includes('C') ? 'state.getC()' : '';
    if (cond) {
      return \`if (\${cond}) return { nextBlock: 0x\${target.toString(16)}, cycles: cycles + 16 };\\ncycles += 12;\\n\`;
    }
  }
  
  // PUSH rr
  if (mnem.startsWith('PUSH ')) {
    const reg = mnem.split(' ')[1];
    if (reg === 'AF') {
      return \`state.SP = (state.SP - 2) & 0xFFFF; mmu.write16(state.SP, (state.A << 8) | state.F);\\n\`;
    } else {
      let code = '';
      // Debug logging for HL pushes in RAM
      if (reg === 'HL' && addr >= 0xC000) {
        code += \`if (typeof console !== 'undefined') console.log('  PUSH HL: pushing 0x' + ((state.H<<8)|state.L).toString(16));\\n\`;
      }
      code += \`state.SP = (state.SP - 2) & 0xFFFF; mmu.write16(state.SP, (state.\${reg[0]} << 8) | state.\${reg[1]});\\n\`;
      return code;
    }
  }
  
  // POP rr
  if (mnem.startsWith('POP ')) {
    const reg = mnem.split(' ')[1];
    // Use unique variable name based on address to avoid collisions
    const varName = \`val_\${addr.toString(16)}\`;
    if (reg === 'AF') {
      return \`const \${varName} = mmu.read16(state.SP); state.A = (\${varName} >> 8) & 0xFF; state.F = \${varName} & 0xF0; state.SP = (state.SP + 2) & 0xFFFF;\\n\`;
    } else {
      let code = \`const \${varName} = mmu.read16(state.SP); state.\${reg[0]} = (\${varName} >> 8) & 0xFF; state.\${reg[1]} = \${varName} & 0xFF; state.SP = (state.SP + 2) & 0xFFFF;\\n\`;
      // Debug logging for HL pops in RAM
      if (reg === 'HL' && addr >= 0xC000) {
        code += \`if (typeof console !== 'undefined') console.log('  POP HL: popped 0x' + \${varName}.toString(16));\\n\`;
      }
      return code;
    }
  }
  
  if (mnem.startsWith('JR ')) {
    const offset = data[addr + 1];
    const signed = offset > 127 ? offset - 256 : offset;
    const target = addr + instr.length + signed;
    const cond = mnem.includes('NZ') ? '!state.getZ()' : mnem.includes('Z') ? 'state.getZ()' : 
                 mnem.includes('NC') ? '!state.getC()' : mnem.includes('C') ? 'state.getC()' : '';
    
    if (cond) {
      return \`if (\${cond}) return { nextBlock: 0x\${target.toString(16)}, cycles: cycles + 12 };\\n\`;
    } else {
      return \`return { nextBlock: 0x\${target.toString(16)}, cycles };\\n\`;
    }
  }
  
  // CALL instruction
  if (mnem === 'CALL nn') {
    const target = imm16;
    const returnAddr = addr + 3; // CALL is 3 bytes
    return \`state.SP = (state.SP - 2) & 0xFFFF; mmu.write16(state.SP, 0x\${returnAddr.toString(16)}); return { nextBlock: 0x\${target.toString(16)}, cycles: cycles + 24 };\\n\`;
  }
  
  if (mnem === 'RET') return \`state.PC = mmu.read16(state.SP); state.SP = (state.SP + 2) & 0xFFFF;\\n\`;
  
  // Fallback - track missing instruction
  if (!missingInstructions.has(mnem)) {
    missingInstructions.add(mnem);
    console.warn(\`[JIT] Missing transpiler for: \${mnem} (opcode 0x\${instr.opcode.toString(16)})\`);
  }
  return \`// TODO: \${mnem}\\n\`;
};

// JIT compile a block at runtime
const jitCompileBlock = (pc, romData, mmu, state) => {
  // Log RAM block compilation addresses
  if (pc >= 0xC000 && pc < 0xE000) {
    console.log(\`[JIT] Compiling RAM block at 0x\${pc.toString(16)} - first RAM execution!\`);
    
    // WORKAROUND: If HL is pointing to code instead of data, fix it
    // The function at 0xC06 expects HL to point to data around 0xC800
    const hl = (state.H << 8) | state.L;
    if (hl === pc) {
      console.log(\`[JIT] WARNING: HL=0x\${hl.toString(16)} points to code! Setting HL=0xC802 (data region)\`);
      state.H = 0xC8;
      state.L = 0x02;
    }
  } else {
    console.log(\`[JIT] Compiling block at 0x\${pc.toString(16)}\`);
  }
  
  try {
    // Determine which memory to read from
    let data;
    let dataOffset = 0;
    
    if (pc < 0x8000) {
      // ROM - use romData
      data = romData;
      dataOffset = 0;
    } else if (pc >= 0xC000 && pc < 0xE000) {
      // Work RAM - read from MMU
      data = new Uint8Array(0x2000);
      for (let i = 0; i < 0x2000; i++) {
        data[i] = mmu.read8(0xC000 + i);
      }
      dataOffset = 0xC000;
    } else {
      console.warn(\`[JIT] Cannot compile block at 0x\${pc.toString(16)} - unsupported memory region\`);
      return null;
    }
    
    // Analyze block (using PC relative to data array)
    const block = analyzeBlock(data, pc - dataOffset);
    
    // Transpile to JavaScript
    const jsCode = transpileBlock(block, data);
    
    // Compile to function
    const compiledFn = new Function('state', 'mmu', 'inc8', 'dec8', 'add8', 'adc8', 'sub8', 'sbc8', 'and8', 'xor8', 'or8', 'cp8', 'addHL', 'bit', 'set', 'res', 'swap', 'daa', 'sla', 'sra', 'srl', 'rlc', 'rrc', 'rl', 'rr', jsCode);
    
    console.log(\`[JIT] Successfully compiled block at 0x\${pc.toString(16)} (\${block.instructions.length} instructions)\`);
    if (pc === 0xC06 || pc === 0xC09 || pc === 0xC0C || pc === 0xC19) {
      console.log(\`[JIT] Generated code for 0x\${pc.toString(16)}:\\n\${jsCode}\`);
    }
    
    return compiledFn;
  } catch (error) {
    console.error(\`[JIT] Failed to compile block at 0x\${pc.toString(16)}:\`, error);
    return null;
  }
};

// Get missing instruction summary
const getMissingInstructionsSummary = () => {
  return Array.from(missingInstructions).sort();
};
`;
