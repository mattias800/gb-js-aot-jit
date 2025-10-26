import { describe, it, expect } from 'vitest'
import { decodeInstruction } from '../../src/decoder/InstructionDecoder'

describe('InstructionDecoder', () => {
  it('decodes NOP correctly', () => {
    const data = new Uint8Array([0x00])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0x00)
    expect(instr.mnemonic).toBe('NOP')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(4)
    expect(instr.operands).toHaveLength(0)
  })
  
  it('decodes LD BC, nn correctly', () => {
    const data = new Uint8Array([0x01, 0x34, 0x12])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0x01)
    expect(instr.mnemonic).toBe('LD BC, nn')
    expect(instr.length).toBe(3)
    expect(instr.cycles).toBe(12)
    expect(instr.operands).toHaveLength(2)
    expect(instr.operands[0].type).toBe('register')
    expect(instr.operands[0].value).toBe('BC')
    expect(instr.operands[1].type).toBe('immediate16')
  })
  
  it('decodes LD A, n correctly', () => {
    const data = new Uint8Array([0x3E, 0x42])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0x3E)
    expect(instr.mnemonic).toBe('LD A, n')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toBe(8)
    expect(instr.operands[0].value).toBe('A')
    expect(instr.operands[1].type).toBe('immediate8')
  })
  
  it('decodes conditional jump JR NZ correctly', () => {
    const data = new Uint8Array([0x20, 0x05])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0x20)
    expect(instr.mnemonic).toBe('JR NZ, r8')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toEqual([8, 12])
    expect(instr.operands[0].type).toBe('relative')
  })
  
  it('decodes HALT correctly', () => {
    const data = new Uint8Array([0x76])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0x76)
    expect(instr.mnemonic).toBe('HALT')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(4)
  })
  
  it('decodes LD B, C correctly', () => {
    const data = new Uint8Array([0x41])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('LD B, C')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(4)
  })
  
  it('decodes LD (HL), A correctly', () => {
    const data = new Uint8Array([0x77])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('LD (HL), A')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(8)  // Indirect access takes 8 cycles
    expect(instr.operands[0].type).toBe('indirect')
    expect(instr.operands[0].value).toBe('HL')
  })
  
  it('decodes ADD A, B correctly', () => {
    const data = new Uint8Array([0x80])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('ADD A, B')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(4)
    expect(instr.flagsAffected.Z).toBe(true)
    expect(instr.flagsAffected.N).toBe(true)
    expect(instr.flagsAffected.H).toBe(true)
    expect(instr.flagsAffected.C).toBe(true)
  })
  
  it('decodes JP nn correctly', () => {
    const data = new Uint8Array([0xC3, 0x00, 0x01])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0xC3)
    expect(instr.mnemonic).toBe('JP nn')
    expect(instr.length).toBe(3)
    expect(instr.cycles).toBe(16)
  })
  
  it('decodes CALL nn correctly', () => {
    const data = new Uint8Array([0xCD, 0x50, 0x01])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0xCD)
    expect(instr.mnemonic).toBe('CALL nn')
    expect(instr.length).toBe(3)
    expect(instr.cycles).toBe(24)
  })
  
  it('decodes RET correctly', () => {
    const data = new Uint8Array([0xC9])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.opcode).toBe(0xC9)
    expect(instr.mnemonic).toBe('RET')
    expect(instr.length).toBe(1)
    expect(instr.cycles).toBe(16)
  })
  
  it('decodes CB-prefixed RLC B correctly', () => {
    const data = new Uint8Array([0xCB, 0x00])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('RLC B')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toBe(8)
    expect(instr.flagsAffected.Z).toBe(true)
  })
  
  it('decodes CB-prefixed BIT 7, A correctly', () => {
    const data = new Uint8Array([0xCB, 0x7F])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('BIT 7, A')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toBe(8)
  })
  
  it('decodes CB-prefixed SET 0, B correctly', () => {
    const data = new Uint8Array([0xCB, 0xC0])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('SET 0, B')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toBe(8)
  })
  
  it('decodes CB-prefixed RES 4, (HL) correctly', () => {
    const data = new Uint8Array([0xCB, 0xA6])
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('RES 4, (HL)')
    expect(instr.length).toBe(2)
    expect(instr.cycles).toBe(16)  // Indirect access takes 16 cycles for CB instructions
    expect(instr.operands[1].type).toBe('indirect')
  })
  
  it('decodes all 256 base opcodes without errors', () => {
    const data = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      data[0] = i
      const instr = decodeInstruction(data, 0)
      
      expect(instr).toBeDefined()
      expect(instr.opcode).toBe(i)
      expect(instr.length).toBeGreaterThan(0)
      expect(instr.mnemonic).toBeDefined()
    }
  })
  
  it('decodes all 256 CB opcodes without errors', () => {
    const data = new Uint8Array([0xCB, 0x00])
    for (let i = 0; i < 256; i++) {
      data[1] = i
      const instr = decodeInstruction(data, 0)
      
      expect(instr).toBeDefined()
      expect(instr.length).toBe(2)
      expect(instr.mnemonic).toBeDefined()
    }
  })
  
  it('sets correct cycle counts for indirect operations', () => {
    // Direct register: 4 cycles
    const directData = new Uint8Array([0x47])  // LD B, A
    const directInstr = decodeInstruction(directData, 0)
    expect(directInstr.cycles).toBe(4)
    
    // Indirect register: 8 cycles
    const indirectData = new Uint8Array([0x46])  // LD B, (HL)
    const indirectInstr = decodeInstruction(indirectData, 0)
    expect(indirectInstr.cycles).toBe(8)
  })
  
  it('identifies invalid opcodes', () => {
    const data = new Uint8Array([0xD3])  // Invalid opcode
    const instr = decodeInstruction(data, 0)
    
    expect(instr.mnemonic).toBe('INVALID')
  })
})
