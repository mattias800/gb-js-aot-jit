import { describe, it, expect } from 'vitest'
import { analyzeBasicBlocksWithTargets, extractTargetAddress } from '../../src/analyzer/BasicBlockAnalyzer'
import { ROM } from '../../src/loader/ROMLoader'
import { decodeInstruction } from '../../src/decoder/InstructionDecoder'

const createTestROM = (code: number[]): ROM => {
  const data = new Uint8Array(32768)
  
  // Place code at entry point
  for (let i = 0; i < code.length; i++) {
    data[0x0100 + i] = code[i]
  }
  
  return {
    data,
    header: {
      title: 'TEST',
      cgbFlag: 0,
      cartridgeType: 0,
      romSize: 0,
      ramSize: 0,
      headerChecksum: 0,
      globalChecksum: 0,
    },
    isValid: true,
  }
}

describe('BasicBlockAnalyzer', () => {
  it('identifies single linear block', () => {
    // NOP NOP NOP HALT
    const rom = createTestROM([0x00, 0x00, 0x00, 0x76])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    expect(database.blocks.size).toBeGreaterThan(0)
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('halt')
  })
  
  it('splits on unconditional jump', () => {
    // NOP; JP 0x0150; NOP (unreachable)
    const rom = createTestROM([
      0x00,              // NOP
      0xC3, 0x50, 0x01,  // JP 0x0150
      0x00,              // NOP (unreachable)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('jump')
    expect(entryBlock!.targets).toContain(0x0150)
  })
  
  it('splits on conditional jump', () => {
    // JR NZ, +5; NOP; NOP; target: NOP
    const rom = createTestROM([
      0x20, 0x05,  // JR NZ, +5
      0x00,        // NOP
      0x00,        // NOP
      0x00,        // NOP (fallthrough)
      0x00,        // NOP
      0x00,        // NOP
      0x00,        // NOP
      0x00,        // NOP (target at PC+7 = 0x0109)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('branch')
    
    // Should have both target and fallthrough blocks
    const target = entryBlock!.targets[0]
    expect(target).toBeDefined()
    
    const fallthrough = 0x0102
    expect(database.blocks.has(fallthrough)).toBe(true)
  })
  
  it('handles CALL instructions', () => {
    // CALL 0x0200; NOP; RET
    const rom = createTestROM([
      0xCD, 0x00, 0x02,  // CALL 0x0200
      0x00,              // NOP
      0xC9,              // RET
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('call')
    expect(entryBlock!.targets).toContain(0x0200)
    
    expect(database.callTargets.has(0x0200)).toBe(true)
  })
  
  it('handles RST instructions', () => {
    // RST 08H
    const rom = createTestROM([0xCF])  // RST 08H
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('call')
    expect(entryBlock!.targets).toContain(0x0008)
  })
  
  it('handles RET instructions', () => {
    // NOP; RET
    const rom = createTestROM([0x00, 0xC9])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('return')
    expect(entryBlock!.targets).toHaveLength(0)
  })
  
  it('handles JP (HL) indirect jump', () => {
    // LD HL, 0x0200; JP (HL)
    const rom = createTestROM([
      0x21, 0x00, 0x02,  // LD HL, 0x0200
      0xE9,              // JP (HL)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('indirect')
  })
  
  it('identifies jump targets correctly', () => {
    // JR +2; NOP; target: NOP
    const rom = createTestROM([
      0x18, 0x02,  // JR +2
      0x00,        // NOP (skipped)
      0x00,        // NOP (target at 0x0104)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    expect(database.jumpTargets.has(0x0104)).toBe(true)
  })
  
  it('extracts absolute jump targets', () => {
    const data = new Uint8Array([0xC3, 0x50, 0x01])  // JP 0x0150
    const instr = decodeInstruction(data, 0)
    const target = extractTargetAddress(data, 0, instr)
    
    expect(target).toBe(0x0150)
  })
  
  it('extracts relative jump targets', () => {
    const data = new Uint8Array([0x18, 0x05])  // JR +5
    const instr = decodeInstruction(data, 0)
    const target = extractTargetAddress(data, 0, instr)
    
    // JR offset is relative to PC after instruction
    // PC after = 0 + 2 = 2, target = 2 + 5 = 7
    expect(target).toBe(7)
  })
  
  it('extracts negative relative jump targets', () => {
    const data = new Uint8Array([0x18, 0xFE])  // JR -2
    const instr = decodeInstruction(data, 0x0100)
    const target = extractTargetAddress(data, 0x0100, instr)
    
    // PC after = 0x0100 + 2 = 0x0102, target = 0x0102 + (-2) = 0x0100
    expect(target).toBe(0x0100)
  })
  
  it('handles conditional call with fallthrough', () => {
    // CALL Z, 0x0200; NOP
    const rom = createTestROM([
      0xCC, 0x00, 0x02,  // CALL Z, 0x0200
      0x00,              // NOP (fallthrough)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    expect(entryBlock!.exitType).toBe('call')
    expect(entryBlock!.targets).toContain(0x0200)
    
    // Should have fallthrough block
    expect(database.blocks.has(0x0103)).toBe(true)
  })
  
  it('detects multiple entry points from interrupt vectors', () => {
    const rom = createTestROM([])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    // Should include entry point and interrupt vectors
    expect(database.entryPoints.has(0x0100)).toBe(true)
    expect(database.entryPoints.has(0x0040)).toBe(true)  // VBlank
    expect(database.entryPoints.has(0x0048)).toBe(true)  // STAT
  })
  
  it('handles loop with back edge', () => {
    // loop: NOP; JR loop
    const rom = createTestROM([
      0x00,        // NOP at 0x0100
      0x18, 0xFE,  // JR -2 (jumps back to 0x0100)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    
    const entryBlock = database.blocks.get(0x0100)
    expect(entryBlock).toBeDefined()
    
    // Should detect the loop target
    const loopTarget = entryBlock!.targets[0]
    expect(loopTarget).toBe(0x0100)
    expect(database.jumpTargets.has(0x0100)).toBe(true)
  })
})
