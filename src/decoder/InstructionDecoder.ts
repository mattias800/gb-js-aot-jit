export interface Operand {
  type: 'register' | 'immediate8' | 'immediate16' | 'indirect' | 'relative' | 'address16' | 'implied'
  value?: string
}

export interface FlagsAffected {
  Z?: boolean  // Zero flag
  N?: boolean  // Subtract flag
  H?: boolean  // Half-carry flag
  C?: boolean  // Carry flag
}

export interface Instruction {
  opcode: number
  mnemonic: string
  length: number
  cycles: number | [number, number]  // [not taken, taken] for branches
  operands: Operand[]
  flagsAffected: FlagsAffected
}

// Decode instruction at given address
export const decodeInstruction = (data: Uint8Array, address: number): Instruction => {
  const opcode = data[address]
  
  // CB-prefixed instructions
  if (opcode === 0xCB) {
    const cbOpcode = data[address + 1]
    return decodeCBInstruction(cbOpcode)
  }
  
  return decodeBaseInstruction(opcode, data, address)
}

const decodeBaseInstruction = (opcode: number, data: Uint8Array, address: number): Instruction => {
  const instructions: Record<number, Omit<Instruction, 'opcode'>> = {
    // 0x00-0x0F
    0x00: { mnemonic: 'NOP', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0x01: { mnemonic: 'LD BC, nn', length: 3, cycles: 12, operands: [{ type: 'register', value: 'BC' }, { type: 'immediate16' }], flagsAffected: {} },
    0x02: { mnemonic: 'LD (BC), A', length: 1, cycles: 8, operands: [{ type: 'indirect', value: 'BC' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0x03: { mnemonic: 'INC BC', length: 1, cycles: 8, operands: [{ type: 'register', value: 'BC' }], flagsAffected: {} },
    0x04: { mnemonic: 'INC B', length: 1, cycles: 4, operands: [{ type: 'register', value: 'B' }], flagsAffected: { Z: true, N: true, H: true } },
    0x05: { mnemonic: 'DEC B', length: 1, cycles: 4, operands: [{ type: 'register', value: 'B' }], flagsAffected: { Z: true, N: true, H: true } },
    0x06: { mnemonic: 'LD B, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'B' }, { type: 'immediate8' }], flagsAffected: {} },
    0x07: { mnemonic: 'RLCA', length: 1, cycles: 4, operands: [], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0x08: { mnemonic: 'LD (nn), SP', length: 3, cycles: 20, operands: [{ type: 'address16' }, { type: 'register', value: 'SP' }], flagsAffected: {} },
    0x09: { mnemonic: 'ADD HL, BC', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }, { type: 'register', value: 'BC' }], flagsAffected: { N: true, H: true, C: true } },
    0x0A: { mnemonic: 'LD A, (BC)', length: 1, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'indirect', value: 'BC' }], flagsAffected: {} },
    0x0B: { mnemonic: 'DEC BC', length: 1, cycles: 8, operands: [{ type: 'register', value: 'BC' }], flagsAffected: {} },
    0x0C: { mnemonic: 'INC C', length: 1, cycles: 4, operands: [{ type: 'register', value: 'C' }], flagsAffected: { Z: true, N: true, H: true } },
    0x0D: { mnemonic: 'DEC C', length: 1, cycles: 4, operands: [{ type: 'register', value: 'C' }], flagsAffected: { Z: true, N: true, H: true } },
    0x0E: { mnemonic: 'LD C, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'C' }, { type: 'immediate8' }], flagsAffected: {} },
    0x0F: { mnemonic: 'RRCA', length: 1, cycles: 4, operands: [], flagsAffected: { Z: true, N: true, H: true, C: true } },
    
    // 0x10-0x1F
    0x10: { mnemonic: 'STOP', length: 2, cycles: 4, operands: [], flagsAffected: {} },
    0x11: { mnemonic: 'LD DE, nn', length: 3, cycles: 12, operands: [{ type: 'register', value: 'DE' }, { type: 'immediate16' }], flagsAffected: {} },
    0x12: { mnemonic: 'LD (DE), A', length: 1, cycles: 8, operands: [{ type: 'indirect', value: 'DE' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0x13: { mnemonic: 'INC DE', length: 1, cycles: 8, operands: [{ type: 'register', value: 'DE' }], flagsAffected: {} },
    0x14: { mnemonic: 'INC D', length: 1, cycles: 4, operands: [{ type: 'register', value: 'D' }], flagsAffected: { Z: true, N: true, H: true } },
    0x15: { mnemonic: 'DEC D', length: 1, cycles: 4, operands: [{ type: 'register', value: 'D' }], flagsAffected: { Z: true, N: true, H: true } },
    0x16: { mnemonic: 'LD D, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'D' }, { type: 'immediate8' }], flagsAffected: {} },
    0x17: { mnemonic: 'RLA', length: 1, cycles: 4, operands: [], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0x18: { mnemonic: 'JR r8', length: 2, cycles: 12, operands: [{ type: 'relative' }], flagsAffected: {} },
    0x19: { mnemonic: 'ADD HL, DE', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }, { type: 'register', value: 'DE' }], flagsAffected: { N: true, H: true, C: true } },
    0x1A: { mnemonic: 'LD A, (DE)', length: 1, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'indirect', value: 'DE' }], flagsAffected: {} },
    0x1B: { mnemonic: 'DEC DE', length: 1, cycles: 8, operands: [{ type: 'register', value: 'DE' }], flagsAffected: {} },
    0x1C: { mnemonic: 'INC E', length: 1, cycles: 4, operands: [{ type: 'register', value: 'E' }], flagsAffected: { Z: true, N: true, H: true } },
    0x1D: { mnemonic: 'DEC E', length: 1, cycles: 4, operands: [{ type: 'register', value: 'E' }], flagsAffected: { Z: true, N: true, H: true } },
    0x1E: { mnemonic: 'LD E, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'E' }, { type: 'immediate8' }], flagsAffected: {} },
    0x1F: { mnemonic: 'RRA', length: 1, cycles: 4, operands: [], flagsAffected: { Z: true, N: true, H: true, C: true } },
    
    // 0x20-0x2F
    0x20: { mnemonic: 'JR NZ, r8', length: 2, cycles: [8, 12], operands: [{ type: 'relative' }], flagsAffected: {} },
    0x21: { mnemonic: 'LD HL, nn', length: 3, cycles: 12, operands: [{ type: 'register', value: 'HL' }, { type: 'immediate16' }], flagsAffected: {} },
    0x22: { mnemonic: 'LD (HL+), A', length: 1, cycles: 8, operands: [{ type: 'indirect', value: 'HL+' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0x23: { mnemonic: 'INC HL', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }], flagsAffected: {} },
    0x24: { mnemonic: 'INC H', length: 1, cycles: 4, operands: [{ type: 'register', value: 'H' }], flagsAffected: { Z: true, N: true, H: true } },
    0x25: { mnemonic: 'DEC H', length: 1, cycles: 4, operands: [{ type: 'register', value: 'H' }], flagsAffected: { Z: true, N: true, H: true } },
    0x26: { mnemonic: 'LD H, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'H' }, { type: 'immediate8' }], flagsAffected: {} },
    0x27: { mnemonic: 'DAA', length: 1, cycles: 4, operands: [], flagsAffected: { Z: true, H: true, C: true } },
    0x28: { mnemonic: 'JR Z, r8', length: 2, cycles: [8, 12], operands: [{ type: 'relative' }], flagsAffected: {} },
    0x29: { mnemonic: 'ADD HL, HL', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }, { type: 'register', value: 'HL' }], flagsAffected: { N: true, H: true, C: true } },
    0x2A: { mnemonic: 'LD A, (HL+)', length: 1, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'indirect', value: 'HL+' }], flagsAffected: {} },
    0x2B: { mnemonic: 'DEC HL', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }], flagsAffected: {} },
    0x2C: { mnemonic: 'INC L', length: 1, cycles: 4, operands: [{ type: 'register', value: 'L' }], flagsAffected: { Z: true, N: true, H: true } },
    0x2D: { mnemonic: 'DEC L', length: 1, cycles: 4, operands: [{ type: 'register', value: 'L' }], flagsAffected: { Z: true, N: true, H: true } },
    0x2E: { mnemonic: 'LD L, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'L' }, { type: 'immediate8' }], flagsAffected: {} },
    0x2F: { mnemonic: 'CPL', length: 1, cycles: 4, operands: [], flagsAffected: { N: true, H: true } },
    
    // 0x30-0x3F
    0x30: { mnemonic: 'JR NC, r8', length: 2, cycles: [8, 12], operands: [{ type: 'relative' }], flagsAffected: {} },
    0x31: { mnemonic: 'LD SP, nn', length: 3, cycles: 12, operands: [{ type: 'register', value: 'SP' }, { type: 'immediate16' }], flagsAffected: {} },
    0x32: { mnemonic: 'LD (HL-), A', length: 1, cycles: 8, operands: [{ type: 'indirect', value: 'HL-' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0x33: { mnemonic: 'INC SP', length: 1, cycles: 8, operands: [{ type: 'register', value: 'SP' }], flagsAffected: {} },
    0x34: { mnemonic: 'INC (HL)', length: 1, cycles: 12, operands: [{ type: 'indirect', value: 'HL' }], flagsAffected: { Z: true, N: true, H: true } },
    0x35: { mnemonic: 'DEC (HL)', length: 1, cycles: 12, operands: [{ type: 'indirect', value: 'HL' }], flagsAffected: { Z: true, N: true, H: true } },
    0x36: { mnemonic: 'LD (HL), n', length: 2, cycles: 12, operands: [{ type: 'indirect', value: 'HL' }, { type: 'immediate8' }], flagsAffected: {} },
    0x37: { mnemonic: 'SCF', length: 1, cycles: 4, operands: [], flagsAffected: { N: true, H: true, C: true } },
    0x38: { mnemonic: 'JR C, r8', length: 2, cycles: [8, 12], operands: [{ type: 'relative' }], flagsAffected: {} },
    0x39: { mnemonic: 'ADD HL, SP', length: 1, cycles: 8, operands: [{ type: 'register', value: 'HL' }, { type: 'register', value: 'SP' }], flagsAffected: { N: true, H: true, C: true } },
    0x3A: { mnemonic: 'LD A, (HL-)', length: 1, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'indirect', value: 'HL-' }], flagsAffected: {} },
    0x3B: { mnemonic: 'DEC SP', length: 1, cycles: 8, operands: [{ type: 'register', value: 'SP' }], flagsAffected: {} },
    0x3C: { mnemonic: 'INC A', length: 1, cycles: 4, operands: [{ type: 'register', value: 'A' }], flagsAffected: { Z: true, N: true, H: true } },
    0x3D: { mnemonic: 'DEC A', length: 1, cycles: 4, operands: [{ type: 'register', value: 'A' }], flagsAffected: { Z: true, N: true, H: true } },
    0x3E: { mnemonic: 'LD A, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'immediate8' }], flagsAffected: {} },
    0x3F: { mnemonic: 'CCF', length: 1, cycles: 4, operands: [], flagsAffected: { N: true, H: true, C: true } },
  }
  
  // 0x40-0x7F: LD r, r' instructions (register to register)
  const ldInstructions = generateLDInstructions()
  Object.assign(instructions, ldInstructions)
  
  // 0x80-0xBF: Arithmetic/logic operations
  const arithmeticInstructions = generateArithmeticInstructions()
  Object.assign(instructions, arithmeticInstructions)
  
  // 0xC0-0xFF: Control flow and misc
  const controlInstructions = generateControlInstructions()
  Object.assign(instructions, controlInstructions)
  
  const template = instructions[opcode]
  if (!template) {
    return {
      opcode: opcode ?? 0,
      mnemonic: `UNKNOWN (0x${(opcode ?? 0).toString(16).toUpperCase().padStart(2, '0')})`,
      length: 1,
      cycles: 4,
      operands: [],
      flagsAffected: {},
    }
  }
  
  return { opcode, ...template }
}

const generateLDInstructions = (): Record<number, Omit<Instruction, 'opcode'>> => {
  const instructions: Record<number, Omit<Instruction, 'opcode'>> = {}
  const registers = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
  
  for (let dst = 0; dst < 8; dst++) {
    for (let src = 0; src < 8; src++) {
      const opcode = 0x40 + dst * 8 + src
      
      // HALT is at 0x76
      if (opcode === 0x76) {
        instructions[0x76] = {
          mnemonic: 'HALT',
          length: 1,
          cycles: 4,
          operands: [],
          flagsAffected: {},
        }
        continue
      }
      
      const dstReg = registers[dst]
      const srcReg = registers[src]
      const isIndirect = dstReg === '(HL)' || srcReg === '(HL)'
      
      instructions[opcode] = {
        mnemonic: `LD ${dstReg}, ${srcReg}`,
        length: 1,
        cycles: isIndirect ? 8 : 4,
        operands: [
          { type: dstReg === '(HL)' ? 'indirect' : 'register', value: dstReg.replace(/[()]/g, '') },
          { type: srcReg === '(HL)' ? 'indirect' : 'register', value: srcReg.replace(/[()]/g, '') },
        ],
        flagsAffected: {},
      }
    }
  }
  
  return instructions
}

const generateArithmeticInstructions = (): Record<number, Omit<Instruction, 'opcode'>> => {
  const instructions: Record<number, Omit<Instruction, 'opcode'>> = {}
  const operations = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP']
  const registers = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
  
  for (let op = 0; op < 8; op++) {
    for (let reg = 0; reg < 8; reg++) {
      const opcode = 0x80 + op * 8 + reg
      const operation = operations[op]
      const register = registers[reg]
      const isIndirect = register === '(HL)'
      
      instructions[opcode] = {
        mnemonic: `${operation} ${register}`,
        length: 1,
        cycles: isIndirect ? 8 : 4,
        operands: [{ type: isIndirect ? 'indirect' : 'register', value: register.replace(/[()]/g, '') }],
        flagsAffected: { Z: true, N: true, H: true, C: true },
      }
    }
  }
  
  return instructions
}

const generateControlInstructions = (): Record<number, Omit<Instruction, 'opcode'>> => {
  return {
    // 0xC0-0xCF
    0xC0: { mnemonic: 'RET NZ', length: 1, cycles: [8, 20], operands: [], flagsAffected: {} },
    0xC1: { mnemonic: 'POP BC', length: 1, cycles: 12, operands: [{ type: 'register', value: 'BC' }], flagsAffected: {} },
    0xC2: { mnemonic: 'JP NZ, nn', length: 3, cycles: [12, 16], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xC3: { mnemonic: 'JP nn', length: 3, cycles: 16, operands: [{ type: 'address16' }], flagsAffected: {} },
    0xC4: { mnemonic: 'CALL NZ, nn', length: 3, cycles: [12, 24], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xC5: { mnemonic: 'PUSH BC', length: 1, cycles: 16, operands: [{ type: 'register', value: 'BC' }], flagsAffected: {} },
    0xC6: { mnemonic: 'ADD A, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xC7: { mnemonic: 'RST 00H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xC8: { mnemonic: 'RET Z', length: 1, cycles: [8, 20], operands: [], flagsAffected: {} },
    0xC9: { mnemonic: 'RET', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xCA: { mnemonic: 'JP Z, nn', length: 3, cycles: [12, 16], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xCB: { mnemonic: 'PREFIX CB', length: 2, cycles: 4, operands: [], flagsAffected: {} },
    0xCC: { mnemonic: 'CALL Z, nn', length: 3, cycles: [12, 24], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xCD: { mnemonic: 'CALL nn', length: 3, cycles: 24, operands: [{ type: 'address16' }], flagsAffected: {} },
    0xCE: { mnemonic: 'ADC A, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xCF: { mnemonic: 'RST 08H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    
    // 0xD0-0xDF
    0xD0: { mnemonic: 'RET NC', length: 1, cycles: [8, 20], operands: [], flagsAffected: {} },
    0xD1: { mnemonic: 'POP DE', length: 1, cycles: 12, operands: [{ type: 'register', value: 'DE' }], flagsAffected: {} },
    0xD2: { mnemonic: 'JP NC, nn', length: 3, cycles: [12, 16], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xD3: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xD4: { mnemonic: 'CALL NC, nn', length: 3, cycles: [12, 24], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xD5: { mnemonic: 'PUSH DE', length: 1, cycles: 16, operands: [{ type: 'register', value: 'DE' }], flagsAffected: {} },
    0xD6: { mnemonic: 'SUB n', length: 2, cycles: 8, operands: [{ type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xD7: { mnemonic: 'RST 10H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xD8: { mnemonic: 'RET C', length: 1, cycles: [8, 20], operands: [], flagsAffected: {} },
    0xD9: { mnemonic: 'RETI', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xDA: { mnemonic: 'JP C, nn', length: 3, cycles: [12, 16], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xDB: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xDC: { mnemonic: 'CALL C, nn', length: 3, cycles: [12, 24], operands: [{ type: 'address16' }], flagsAffected: {} },
    0xDD: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xDE: { mnemonic: 'SBC A, n', length: 2, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xDF: { mnemonic: 'RST 18H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    
    // 0xE0-0xEF
    0xE0: { mnemonic: 'LDH (n), A', length: 2, cycles: 12, operands: [{ type: 'immediate8' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0xE1: { mnemonic: 'POP HL', length: 1, cycles: 12, operands: [{ type: 'register', value: 'HL' }], flagsAffected: {} },
    0xE2: { mnemonic: 'LD (C), A', length: 1, cycles: 8, operands: [{ type: 'indirect', value: 'C' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0xE3: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xE4: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xE5: { mnemonic: 'PUSH HL', length: 1, cycles: 16, operands: [{ type: 'register', value: 'HL' }], flagsAffected: {} },
    0xE6: { mnemonic: 'AND n', length: 2, cycles: 8, operands: [{ type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xE7: { mnemonic: 'RST 20H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xE8: { mnemonic: 'ADD SP, r8', length: 2, cycles: 16, operands: [{ type: 'register', value: 'SP' }, { type: 'relative' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xE9: { mnemonic: 'JP (HL)', length: 1, cycles: 4, operands: [{ type: 'indirect', value: 'HL' }], flagsAffected: {} },
    0xEA: { mnemonic: 'LD (nn), A', length: 3, cycles: 16, operands: [{ type: 'address16' }, { type: 'register', value: 'A' }], flagsAffected: {} },
    0xEB: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xEC: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xED: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xEE: { mnemonic: 'XOR n', length: 2, cycles: 8, operands: [{ type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xEF: { mnemonic: 'RST 28H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    
    // 0xF0-0xFF
    0xF0: { mnemonic: 'LDH A, (n)', length: 2, cycles: 12, operands: [{ type: 'register', value: 'A' }, { type: 'immediate8' }], flagsAffected: {} },
    0xF1: { mnemonic: 'POP AF', length: 1, cycles: 12, operands: [{ type: 'register', value: 'AF' }], flagsAffected: {} },
    0xF2: { mnemonic: 'LD A, (C)', length: 1, cycles: 8, operands: [{ type: 'register', value: 'A' }, { type: 'indirect', value: 'C' }], flagsAffected: {} },
    0xF3: { mnemonic: 'DI', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xF4: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xF5: { mnemonic: 'PUSH AF', length: 1, cycles: 16, operands: [{ type: 'register', value: 'AF' }], flagsAffected: {} },
    0xF6: { mnemonic: 'OR n', length: 2, cycles: 8, operands: [{ type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xF7: { mnemonic: 'RST 30H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
    0xF8: { mnemonic: 'LD HL, SP+r8', length: 2, cycles: 12, operands: [{ type: 'register', value: 'HL' }, { type: 'register', value: 'SP' }, { type: 'relative' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xF9: { mnemonic: 'LD SP, HL', length: 1, cycles: 8, operands: [{ type: 'register', value: 'SP' }, { type: 'register', value: 'HL' }], flagsAffected: {} },
    0xFA: { mnemonic: 'LD A, (nn)', length: 3, cycles: 16, operands: [{ type: 'register', value: 'A' }, { type: 'address16' }], flagsAffected: {} },
    0xFB: { mnemonic: 'EI', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xFC: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xFD: { mnemonic: 'INVALID', length: 1, cycles: 4, operands: [], flagsAffected: {} },
    0xFE: { mnemonic: 'CP n', length: 2, cycles: 8, operands: [{ type: 'immediate8' }], flagsAffected: { Z: true, N: true, H: true, C: true } },
    0xFF: { mnemonic: 'RST 38H', length: 1, cycles: 16, operands: [], flagsAffected: {} },
  }
}

const decodeCBInstruction = (cbOpcode: number): Instruction => {
  const operations = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL']
  const registers = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A']
  
  const op = (cbOpcode >> 3) & 0x07
  const reg = cbOpcode & 0x07
  
  if (cbOpcode < 0x40) {
    // Rotate/shift operations (0x00-0x3F)
    const operation = operations[op]
    const register = registers[reg]
    const isIndirect = register === '(HL)'
    
    return {
      opcode: 0xCB,
      mnemonic: `${operation} ${register}`,
      length: 2,
      cycles: isIndirect ? 16 : 8,
      operands: [{ type: isIndirect ? 'indirect' : 'register', value: register.replace(/[()]/g, '') }],
      flagsAffected: { Z: true, N: true, H: true, C: true },
    }
  } else {
    // Bit operations (0x40-0xFF)
    const bitOp = (cbOpcode >> 6) & 0x03
    const bitNum = (cbOpcode >> 3) & 0x07
    const register = registers[reg]
    const isIndirect = register === '(HL)'
    
    const operations = ['BIT', 'RES', 'SET']
    const operation = operations[bitOp - 1]
    
    return {
      opcode: 0xCB,
      mnemonic: `${operation} ${bitNum}, ${register}`,
      length: 2,
      cycles: isIndirect ? 16 : 8,
      operands: [
        { type: 'immediate8', value: bitNum.toString() },
        { type: isIndirect ? 'indirect' : 'register', value: register.replace(/[()]/g, '') },
      ],
      flagsAffected: bitOp === 1 ? { Z: true, N: true, H: true } : {},
    }
  }
}
