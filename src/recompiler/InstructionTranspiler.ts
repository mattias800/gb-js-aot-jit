import { Instruction } from '../decoder/InstructionDecoder'
import { FlagAnalyzer, Flag } from '../analyzer/FlagAnalyzer.js'
import { RegisterAnalyzer, Register } from '../analyzer/RegisterAnalyzer.js'
import { ConstantAnalyzer } from '../analyzer/ConstantAnalyzer.js'

export interface TranspiledInstruction {
  code: string
  cycles: number | string  // Fixed number or expression like "taken ? 12 : 8"
}

export interface TranspilerContext {
  blockId: number
  instructionIndex: number
  flagAnalyzer?: FlagAnalyzer
  registerAnalyzer?: RegisterAnalyzer
  constantAnalyzer?: ConstantAnalyzer
}

export const transpileInstruction = (
  instr: Instruction,
  address: number,
  immediateBytes: Uint8Array,
  context?: TranspilerContext
): TranspiledInstruction => {
  const opcode = instr.opcode
  const mnemonic = instr.mnemonic
  
  // Get immediate values from bytes
  const imm8 = immediateBytes[1]
  const imm16 = immediateBytes[1] | (immediateBytes[2] << 8)
  const relative = immediateBytes[1] > 127 ? immediateBytes[1] - 256 : immediateBytes[1]
  
  // Handle CB-prefixed instructions
  if (opcode === 0xCB) {
    return transpileCBInstruction(mnemonic, Array.isArray(instr.cycles) ? instr.cycles[0] : instr.cycles, context)
  }
  
  // Generate code based on opcode
  const code = generateInstructionCode(opcode, mnemonic, imm8, imm16, relative, address, context)
  const cycles = Array.isArray(instr.cycles) ? instr.cycles[0] : instr.cycles
  
  return { code, cycles }
}

/**
 * Helper to check if a flag needs to be computed
 */
const shouldComputeFlag = (flag: Flag, context?: TranspilerContext): boolean => {
  if (!context?.flagAnalyzer) return true // Conservative: compute if no analysis
  return context.flagAnalyzer.isFlagWriteLive(context.blockId, context.instructionIndex, flag)
}

/**
 * Helper to check if a register write is live (needed)
 */
const shouldWriteRegister = (register: Register, context?: TranspilerContext): boolean => {
  if (!context?.registerAnalyzer) return true // Conservative: write if no analysis
  return context.registerAnalyzer.isRegisterWriteLive(context.blockId, context.instructionIndex, register)
}

/**
 * Helper to get flag suffix for ALU operations (only compute live flags)
 */
const getFlagSuffix = (context?: TranspilerContext): string => {
  // Disabled for now - always compute all flags
  return ''
}

const generateInstructionCode = (
  opcode: number,
  mnemonic: string,
  imm8: number,
  imm16: number,
  relative: number,
  address: number,
  context?: TranspilerContext
): string => {
  // NOP
  if (opcode === 0x00) return '// NOP'
  
  // LD rr, nn (16-bit load immediate) - MUST come before 8-bit check!
  if (mnemonic.includes(', nn')) {
    const reg = mnemonic.split(' ')[1].replace(',', '')
    if (reg === 'BC' || reg === 'DE' || reg === 'HL' || reg === 'SP') {
      const hi = (imm16 >> 8) & 0xFF
      const lo = imm16 & 0xFF
      if (reg === 'SP') {
        return `state.SP = 0x${imm16.toString(16).toUpperCase()}`
      }
      return `state.${reg[0]} = 0x${hi.toString(16).toUpperCase()}\nstate.${reg[1]} = 0x${lo.toString(16).toUpperCase()}`
    }
  }
  
  // LD (HL), n (store immediate to memory) - MUST come before general LD r, n
  if (mnemonic === 'LD (HL), n') {
    return `mmu.write8((state.H << 8) | state.L, 0x${imm8.toString(16).toUpperCase()})`
  }
  
  // LD r, n (8-bit load immediate)
  if (mnemonic.startsWith('LD ') && mnemonic.includes(', n')) {
    const reg = mnemonic.split(' ')[1].replace(',', '')
    const regEnum = reg as Register
    if (!shouldWriteRegister(regEnum, context)) {
      return `// Dead write to ${reg} eliminated`
    }
    return `state.${reg} = 0x${imm8.toString(16).toUpperCase()}`
  }
  
  // LD r, r' (register to register)
  if (mnemonic.startsWith('LD ') && !mnemonic.includes('nn') && !mnemonic.includes('n,') && !mnemonic.includes('(')) {
    const parts = mnemonic.split(', ')
    const dst = parts[0].split(' ')[1]
    const src = parts[1]
    const dstEnum = dst as Register
    if (!shouldWriteRegister(dstEnum, context)) {
      return `// Dead write to ${dst} eliminated`
    }
    return `state.${dst} = state.${src}`
  }
  
  // LD r, (HL) (load from memory)
  if (mnemonic.includes(', (HL)')) {
    const reg = mnemonic.split(', ')[0].split(' ')[1]
    const regEnum = reg as Register
    if (!shouldWriteRegister(regEnum, context)) {
      return `// Dead write to ${reg} eliminated (but memory read side-effect preserved)\nmmu.read8((state.H << 8) | state.L)`
    }
    return `state.${reg} = mmu.read8((state.H << 8) | state.L)`
  }
  
  // LD (HL), r (store to memory)
  if (mnemonic.startsWith('LD (HL),')) {
    const reg = mnemonic.split(', ')[1]
    return `mmu.write8((state.H << 8) | state.L, state.${reg})`
  }
  
  // LD (HL+), A and LD (HL-), A
  if (mnemonic === 'LD (HL+), A') {
    return `mmu.write8((state.H << 8) | state.L, state.A)\nlet hlTemp = ((state.H << 8) | state.L) + 1\nstate.H = (hlTemp >> 8) & 0xFF\nstate.L = hlTemp & 0xFF`
  }
  if (mnemonic === 'LD (HL-), A') {
    return `mmu.write8((state.H << 8) | state.L, state.A)\nlet hlTemp = ((state.H << 8) | state.L) - 1\nstate.H = (hlTemp >> 8) & 0xFF\nstate.L = hlTemp & 0xFF`
  }
  
  // LD A, (HL+) and LD A, (HL-)
  if (mnemonic === 'LD A, (HL+)') {
    return `state.A = mmu.read8((state.H << 8) | state.L)\nlet hlTemp = ((state.H << 8) | state.L) + 1\nstate.H = (hlTemp >> 8) & 0xFF\nstate.L = hlTemp & 0xFF`
  }
  if (mnemonic === 'LD A, (HL-)') {
    return `state.A = mmu.read8((state.H << 8) | state.L)\nlet hlTemp = ((state.H << 8) | state.L) - 1\nstate.H = (hlTemp >> 8) & 0xFF\nstate.L = hlTemp & 0xFF`
  }
  
  // LD (BC), A / LD (DE), A
  if (mnemonic === 'LD (BC), A') {
    return `mmu.write8((state.B << 8) | state.C, state.A)`
  }
  if (mnemonic === 'LD (DE), A') {
    return `mmu.write8((state.D << 8) | state.E, state.A)`
  }
  
  // LD A, (BC) / LD A, (DE)
  if (mnemonic === 'LD A, (BC)') {
    return `state.A = mmu.read8((state.B << 8) | state.C)`
  }
  if (mnemonic === 'LD A, (DE)') {
    return `state.A = mmu.read8((state.D << 8) | state.E)`
  }
  
  // LD (nn), A / LD A, (nn)
  if (mnemonic === 'LD (nn), A') {
    return `mmu.write8(0x${imm16.toString(16).toUpperCase()}, state.A)`
  }
  if (mnemonic === 'LD A, (nn)') {
    return `state.A = mmu.read8(0x${imm16.toString(16).toUpperCase()})`
  }
  
  // LDH (n), A / LDH A, (n)
  if (mnemonic === 'LDH (n), A') {
    return `mmu.write8(0xFF00 + 0x${imm8.toString(16).toUpperCase()}, state.A)`
  }
  if (mnemonic === 'LDH A, (n)') {
    return `state.A = mmu.read8(0xFF00 + 0x${imm8.toString(16).toUpperCase()})`
  }
  
  // LD (C), A / LD A, (C)
  if (mnemonic === 'LD (C), A') {
    return `mmu.write8(0xFF00 + state.C, state.A)`
  }
  if (mnemonic === 'LD A, (C)') {
    return `state.A = mmu.read8(0xFF00 + state.C)`
  }
  
  // INC r (8-bit increment)
  if (mnemonic.startsWith('INC ') && !mnemonic.includes('(')) {
    const reg = mnemonic.split(' ')[1]
    if (reg === 'BC' || reg === 'DE' || reg === 'HL' || reg === 'SP') {
      // 16-bit increment (no flags)
      if (reg === 'SP') {
        return `state.SP = (state.SP + 1) & 0xFFFF`
      }
      return `const val = ((state.${reg[0]} << 8) | state.${reg[1]}) + 1\nstate.${reg[0]} = (val >> 8) & 0xFF\nstate.${reg[1]} = val & 0xFF`
    }
    const suffix = getFlagSuffix(context)
    return `state.${reg} = inc8${suffix}(state, state.${reg})`
  }
  
  // INC (HL)
  if (mnemonic === 'INC (HL)') {
    const suffix = getFlagSuffix(context)
    return `const addr = (state.H << 8) | state.L\nconst val = mmu.read8(addr)\nmmu.write8(addr, inc8${suffix}(state, val))`
  }
  
  // DEC r (8-bit decrement)
  if (mnemonic.startsWith('DEC ') && !mnemonic.includes('(')) {
    const reg = mnemonic.split(' ')[1]
    if (reg === 'BC' || reg === 'DE' || reg === 'HL' || reg === 'SP') {
      // 16-bit decrement (no flags)
      if (reg === 'SP') {
        return `state.SP = (state.SP - 1) & 0xFFFF`
      }
      return `const val = ((state.${reg[0]} << 8) | state.${reg[1]}) - 1\nstate.${reg[0]} = (val >> 8) & 0xFF\nstate.${reg[1]} = val & 0xFF`
    }
    const suffix = getFlagSuffix(context)
    return `state.${reg} = dec8${suffix}(state, state.${reg})`
  }
  
  // DEC (HL)
  if (mnemonic === 'DEC (HL)') {
    const suffix = getFlagSuffix(context)
    return `const addr = (state.H << 8) | state.L\nconst val = mmu.read8(addr)\nmmu.write8(addr, dec8${suffix}(state, val))`
  }
  
  // ADD A, r / ADD A, n
  if (mnemonic.startsWith('ADD A,')) {
    const src = mnemonic.split(', ')[1]
    const suffix = getFlagSuffix(context)
    
    // Constant folding: if both operands are constant, compute at compile time
    if (context?.constantAnalyzer && src !== 'n' && src !== '(HL)') {
      const valA = context.constantAnalyzer.getConstantValue(context.blockId, context.instructionIndex, 'A' as Register)
      const valSrc = context.constantAnalyzer.getConstantValue(context.blockId, context.instructionIndex, src as Register)
      
      if (valA.type === 'constant' && valSrc.type === 'constant') {
        const result = (valA.value + valSrc.value) & 0xFF
        return `// Constant folded: ${valA.value} + ${valSrc.value}\nstate.A = ${result}\nstate.setZ(${result === 0})\nstate.setN(false)\nstate.setH(${(valA.value & 0xF) + (valSrc.value & 0xF) > 0xF})\nstate.setC(${valA.value + valSrc.value > 0xFF})`
      }
    }
    
    if (src === 'n') {
      return `state.A = add8${suffix}(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = add8${suffix}(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = add8${suffix}(state, state.A, state.${src})`
    }
  }
  
  // ADC A, r / ADC A, n
  if (mnemonic.startsWith('ADC A,')) {
    const src = mnemonic.split(', ')[1]
    if (src === 'n') {
      return `state.A = adc8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = adc8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = adc8(state, state.A, state.${src})`
    }
  }
  
  // SUB r / SUB n
  if (mnemonic.startsWith('SUB ')) {
    const src = mnemonic.split(' ')[1]
    if (src === 'n') {
      return `state.A = sub8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = sub8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = sub8(state, state.A, state.${src})`
    }
  }
  
  // SBC A, r / SBC A, n
  if (mnemonic.startsWith('SBC A,')) {
    const src = mnemonic.split(', ')[1]
    if (src === 'n') {
      return `state.A = sbc8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = sbc8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = sbc8(state, state.A, state.${src})`
    }
  }
  
  // AND r / AND n
  if (mnemonic.startsWith('AND ')) {
    const src = mnemonic.split(' ')[1]
    if (src === 'n') {
      return `state.A = and8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = and8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = and8(state, state.A, state.${src})`
    }
  }
  
  // XOR r / XOR n
  if (mnemonic.startsWith('XOR ')) {
    const src = mnemonic.split(' ')[1]
    
    // Special case: XOR A, A always results in 0
    if (src === 'A') {
      return `state.A = 0\nstate.setZ(true)\nstate.setN(false)\nstate.setH(false)\nstate.setC(false)`
    }
    
    if (src === 'n') {
      return `state.A = xor8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = xor8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = xor8(state, state.A, state.${src})`
    }
  }
  
  // OR r / OR n
  if (mnemonic.startsWith('OR ')) {
    const src = mnemonic.split(' ')[1]
    if (src === 'n') {
      return `state.A = or8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `state.A = or8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `state.A = or8(state, state.A, state.${src})`
    }
  }
  
  // CP r / CP n
  if (mnemonic.startsWith('CP ')) {
    const src = mnemonic.split(' ')[1]
    if (src === 'n') {
      return `cp8(state, state.A, 0x${imm8.toString(16).toUpperCase()})`
    } else if (src === '(HL)') {
      return `cp8(state, state.A, mmu.read8((state.H << 8) | state.L))`
    } else {
      return `cp8(state, state.A, state.${src})`
    }
  }
  
  // PUSH rr
  if (mnemonic.startsWith('PUSH ')) {
    const reg = mnemonic.split(' ')[1]
    if (reg === 'AF') {
      return `state.SP = (state.SP - 2) & 0xFFFF\nmmu.write16(state.SP, (state.A << 8) | state.F)`
    } else {
      return `state.SP = (state.SP - 2) & 0xFFFF\nmmu.write16(state.SP, (state.${reg[0]} << 8) | state.${reg[1]})`
    }
  }
  
  // POP rr
  if (mnemonic.startsWith('POP ')) {
    const reg = mnemonic.split(' ')[1]
    if (reg === 'AF') {
      return `const val = mmu.read16(state.SP)\nstate.A = (val >> 8) & 0xFF\nstate.F = val & 0xF0\nstate.SP = (state.SP + 2) & 0xFFFF`
    } else {
      return `const val = mmu.read16(state.SP)\nstate.${reg[0]} = (val >> 8) & 0xFF\nstate.${reg[1]} = val & 0xFF\nstate.SP = (state.SP + 2) & 0xFFFF`
    }
  }
  
  // ADD HL, rr
  if (mnemonic.startsWith('ADD HL,')) {
    const src = mnemonic.split(', ')[1]
    if (src === 'SP') {
      return `const hl = (state.H << 8) | state.L\nconst result = addHL(state, hl, state.SP)\nstate.H = (result >> 8) & 0xFF\nstate.L = result & 0xFF`
    } else {
      return `const hl = (state.H << 8) | state.L\nconst src = (state.${src[0]} << 8) | state.${src[1]}\nconst result = addHL(state, hl, src)\nstate.H = (result >> 8) & 0xFF\nstate.L = result & 0xFF`
    }
  }
  
  // JP nn
  if (mnemonic === 'JP nn') {
    const target = imm16
    return `cycles += 16\nreturn { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles }`
  }
  
  // JP cc, nn (conditional)
  if (mnemonic.startsWith('JP ') && mnemonic.includes(',')) {
    const condition = mnemonic.split(' ')[1].replace(',', '')
    const target = imm16
    const check = getConditionCheck(condition)
    return `if (${check}) {\n  return { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles: cycles + 16 }\n}\ncycles += 12`
  }
  
  // JR r8
  if (mnemonic === 'JR r8') {
    const target = address + 2 + relative
    return `cycles += 12\nreturn { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles }`
  }
  
  // JR cc, r8 (conditional)
  if (mnemonic.startsWith('JR ') && mnemonic.includes(',')) {
    const condition = mnemonic.split(' ')[1].replace(',', '')
    const target = address + 2 + relative
    const check = getConditionCheck(condition)
    return `if (${check}) {\n  return { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles: cycles + 12 }\n}\ncycles += 8`
  }
  
  // JP (HL)
  if (mnemonic === 'JP (HL)') {
    return `cycles += 4\nreturn { nextBlock: (state.H << 8) | state.L, cycles }`
  }
  
  // CALL nn
  if (mnemonic === 'CALL nn') {
    const target = imm16
    const returnAddr = address + 3
    return `cycles += 24\nstate.SP = (state.SP - 2) & 0xFFFF\nmmu.write16(state.SP, 0x${returnAddr.toString(16).toUpperCase()})\nreturn { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles }`
  }
  
  // CALL cc, nn (conditional)
  if (mnemonic.startsWith('CALL ') && mnemonic.includes(',')) {
    const condition = mnemonic.split(' ')[1].replace(',', '')
    const target = imm16
    const returnAddr = address + 3
    const check = getConditionCheck(condition)
    return `if (${check}) {\n  state.SP = (state.SP - 2) & 0xFFFF\n  mmu.write16(state.SP, 0x${returnAddr.toString(16).toUpperCase()})\n  return { nextBlock: 0x${target.toString(16).toUpperCase()}, cycles: cycles + 24 }\n}\ncycles += 12`
  }
  
  // RST
  if (mnemonic.startsWith('RST ')) {
    const rstAddr = getRSTAddress(mnemonic)
    const returnAddr = address + 1
    return `cycles += 16\nstate.SP = (state.SP - 2) & 0xFFFF\nmmu.write16(state.SP, 0x${returnAddr.toString(16).toUpperCase()})\nreturn { nextBlock: 0x${rstAddr.toString(16).toUpperCase()}, cycles }`
  }
  
  // RET
  if (mnemonic === 'RET') {
    return `cycles += 16\nconst addr = mmu.read16(state.SP)\nstate.SP = (state.SP + 2) & 0xFFFF\nreturn { nextBlock: addr, cycles }`
  }
  
  // RET cc (conditional)
  if (mnemonic.startsWith('RET ') && mnemonic !== 'RETI') {
    const condition = mnemonic.split(' ')[1]
    const check = getConditionCheck(condition)
    return `if (${check}) {\n  const addr = mmu.read16(state.SP)\n  state.SP = (state.SP + 2) & 0xFFFF\n  return { nextBlock: addr, cycles: cycles + 20 }\n}\ncycles += 8`
  }
  
  // RETI
  if (mnemonic === 'RETI') {
    return `cycles += 16\nconst addr = mmu.read16(state.SP)\nstate.SP = (state.SP + 2) & 0xFFFF\nstate.IME = true\nreturn { nextBlock: addr, cycles }`
  }
  
  // HALT
  if (mnemonic === 'HALT') {
    return `cycles += 4\nstate.halted = true\nreturn { nextBlock: 0x${(address + 1).toString(16).toUpperCase()}, cycles }`
  }
  
  // DI / EI
  if (mnemonic === 'DI') {
    return `state.IME = false`
  }
  if (mnemonic === 'EI') {
    return `state.enableIMEAfterNext = true`
  }
  
  // DAA
  if (mnemonic === 'DAA') {
    return `daa(state)`
  }
  
  // CPL
  if (mnemonic === 'CPL') {
    const parts = [`state.A = (~state.A) & 0xFF`]
    if (shouldComputeFlag(Flag.N, context)) parts.push(`state.setN(true)`)
    if (shouldComputeFlag(Flag.H, context)) parts.push(`state.setH(true)`)
    return parts.join('\n')
  }
  
  // CCF
  if (mnemonic === 'CCF') {
    const parts = []
    if (shouldComputeFlag(Flag.C, context)) parts.push(`state.setC(!state.getC())`)
    if (shouldComputeFlag(Flag.N, context)) parts.push(`state.setN(false)`)
    if (shouldComputeFlag(Flag.H, context)) parts.push(`state.setH(false)`)
    return parts.length > 0 ? parts.join('\n') : '// Flags not live'
  }
  
  // SCF
  if (mnemonic === 'SCF') {
    const parts = []
    if (shouldComputeFlag(Flag.C, context)) parts.push(`state.setC(true)`)
    if (shouldComputeFlag(Flag.N, context)) parts.push(`state.setN(false)`)
    if (shouldComputeFlag(Flag.H, context)) parts.push(`state.setH(false)`)
    return parts.length > 0 ? parts.join('\n') : '// Flags not live'
  }
  
  // RLCA (Rotate A left, carry bit)
  if (mnemonic === 'RLCA') {
    return `const carry = (state.A >> 7) & 1\nstate.A = ((state.A << 1) | carry) & 0xFF\nstate.setZ(false)\nstate.setN(false)\nstate.setH(false)\nstate.setC(carry === 1)`
  }
  
  // RLA (Rotate A left through carry)
  if (mnemonic === 'RLA') {
    return `const carry = state.getC() ? 1 : 0\nconst newCarry = (state.A >> 7) & 1\nstate.A = ((state.A << 1) | carry) & 0xFF\nstate.setZ(false)\nstate.setN(false)\nstate.setH(false)\nstate.setC(newCarry === 1)`
  }
  
  // RRCA (Rotate A right, carry bit)
  if (mnemonic === 'RRCA') {
    return `const carry = state.A & 1\nstate.A = ((state.A >> 1) | (carry << 7)) & 0xFF\nstate.setZ(false)\nstate.setN(false)\nstate.setH(false)\nstate.setC(carry === 1)`
  }
  
  // RRA (Rotate A right through carry)
  if (mnemonic === 'RRA') {
    return `const carry = state.getC() ? 1 : 0\nconst newCarry = state.A & 1\nstate.A = ((state.A >> 1) | (carry << 7)) & 0xFF\nstate.setZ(false)\nstate.setN(false)\nstate.setH(false)\nstate.setC(newCarry === 1)`
  }
  
  // LD (nn), SP
  if (mnemonic === 'LD (nn), SP') {
    return `mmu.write16(0x${imm16.toString(16).toUpperCase()}, state.SP)`
  }
  
  // STOP
  if (mnemonic === 'STOP') {
    return `state.stopped = true\ncycles += 4`
  }
  
  // Fallback for unimplemented
  return `// TODO: ${mnemonic}`
}

const transpileCBInstruction = (mnemonic: string, cycles: number, context?: TranspilerContext): TranspiledInstruction => {
  // RLC, RRC, RL, RR, SLA, SRA, SWAP, SRL
  const rotateShift = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL']
  
  for (const op of rotateShift) {
    if (mnemonic.startsWith(op + ' ')) {
      const reg = mnemonic.split(' ')[1]
      const suffix = getFlagSuffix(context)
      if (reg === '(HL)') {
        return {
          code: `const addr = (state.H << 8) | state.L\nconst val = mmu.read8(addr)\nmmu.write8(addr, ${op.toLowerCase()}${suffix}(state, val))`,
          cycles
        }
      } else {
        return {
          code: `state.${reg} = ${op.toLowerCase()}${suffix}(state, state.${reg})`,
          cycles
        }
      }
    }
  }
  
  // BIT b, r
  if (mnemonic.startsWith('BIT ')) {
    const parts = mnemonic.split(', ')
    const bit = parts[0].split(' ')[1]
    const reg = parts[1]
    if (reg === '(HL)') {
      return {
        code: `bit(state, ${bit}, mmu.read8((state.H << 8) | state.L))`,
        cycles
      }
    } else {
      return {
        code: `bit(state, ${bit}, state.${reg})`,
        cycles
      }
    }
  }
  
  // SET b, r
  if (mnemonic.startsWith('SET ')) {
    const parts = mnemonic.split(', ')
    const bit = parts[0].split(' ')[1]
    const reg = parts[1]
    if (reg === '(HL)') {
      return {
        code: `const addr = (state.H << 8) | state.L\nconst val = mmu.read8(addr)\nmmu.write8(addr, val | (1 << ${bit}))`,
        cycles
      }
    } else {
      return {
        code: `state.${reg} = state.${reg} | (1 << ${bit})`,
        cycles
      }
    }
  }
  
  // RES b, r
  if (mnemonic.startsWith('RES ')) {
    const parts = mnemonic.split(', ')
    const bit = parts[0].split(' ')[1]
    const reg = parts[1]
    if (reg === '(HL)') {
      return {
        code: `const addr = (state.H << 8) | state.L\nconst val = mmu.read8(addr)\nmmu.write8(addr, val & ~(1 << ${bit}))`,
        cycles
      }
    } else {
      return {
        code: `state.${reg} = state.${reg} & ~(1 << ${bit})`,
        cycles
      }
    }
  }
  
  return { code: `// TODO: ${mnemonic}`, cycles }
}

const getConditionCheck = (condition: string): string => {
  switch (condition) {
    case 'NZ': return '!state.getZ()'
    case 'Z': return 'state.getZ()'
    case 'NC': return '!state.getC()'
    case 'C': return 'state.getC()'
    default: return 'true'
  }
}

const getRSTAddress = (mnemonic: string): number => {
  const match = mnemonic.match(/RST (\w+)/)
  if (!match) return 0
  
  const rstMap: Record<string, number> = {
    '00H': 0x0000,
    '08H': 0x0008,
    '10H': 0x0010,
    '18H': 0x0018,
    '20H': 0x0020,
    '28H': 0x0028,
    '30H': 0x0030,
    '38H': 0x0038,
  }
  
  return rstMap[match[1]] ?? 0
}
