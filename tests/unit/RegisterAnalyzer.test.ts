import { describe, it, expect } from 'vitest'
import { RegisterAnalyzer, Register } from '../../src/analyzer/RegisterAnalyzer.js'
import { BasicBlock } from '../../src/analyzer/BasicBlockAnalyzer.js'
import type { ControlFlowGraph, CFGNode } from '../../src/analyzer/ControlFlowGraph.js'
import { decodeInstruction } from '../../src/decoder/InstructionDecoder.js'

// Mock CFG builder for testing
class MockCFG implements ControlFlowGraph {
  nodes = new Map<number, CFGNode>()
  entryPoint = 0x100
  loops = []
  dominators = new Map<number, Set<number>>()
  
  addNode(address: number, successors: number[], block?: BasicBlock): void {
    const node: CFGNode = {
      block: block || ({ startAddress: address } as BasicBlock),
      predecessors: new Set(),
      successors: new Set(successors)
    }
    this.nodes.set(address, node)
    
    // Wire up predecessors
    for (const succ of successors) {
      const succNode = this.nodes.get(succ)
      if (succNode) {
        succNode.predecessors.add(address)
      }
    }
  }
}

const createMockBlock = (startAddress: number, instructions: number[]): BasicBlock => {
  const decodedInstructions = instructions.map((opcode, i) => 
    decodeInstruction(new Uint8Array([opcode, 0, 0]), startAddress + i)
  )
  
  return {
    startAddress,
    endAddress: startAddress + instructions.length - 1,
    instructions: decodedInstructions,
    exitType: 'fallthrough',
    targets: []
  }
}

describe('RegisterAnalyzer', () => {
  it('should detect dead register writes when immediately overwritten', () => {
    // LD A, 5 then LD A, 10 - first write is dead
    const block = createMockBlock(0x100, [
      0x3E, // LD A, n
      0x3E, // LD A, n (overwrites A)
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After first LD A, register A should NOT be live (overwritten immediately)
    const liveAfterFirst = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterFirst.has(Register.A)).toBe(false)
  })

  it('should keep registers live when read by next instruction', () => {
    // LD A, 5 then ADD A, B - A is read by ADD
    const block = createMockBlock(0x100, [
      0x3E, // LD A, n
      0x80, // ADD A, B
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After LD A, register A should be live (read by ADD)
    const liveAfterLd = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterLd.has(Register.A)).toBe(true)
  })

  it('should propagate register liveness through multiple blocks', () => {
    // Block 0: LD A, 5
    // Block 1: NOP
    // Block 2: ADD A, B (reads A)
    const block0 = createMockBlock(0x100, [0x3E]) // LD A, n
    const block1 = createMockBlock(0x102, [0x00]) // NOP
    const block2 = createMockBlock(0x103, [0x80]) // ADD A, B
    
    const blocks = new Map([
      [0x100, block0],
      [0x102, block1],
      [0x103, block2]
    ])
    
    const cfg = new MockCFG()
    cfg.addNode(0x103, [])
    cfg.addNode(0x102, [0x103])
    cfg.addNode(0x100, [0x102])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // A should be live in block 0 because it's needed in block 2
    const liveAfterLd = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterLd.has(Register.A)).toBe(true)
  })

  it('should handle register pair operations', () => {
    // LD H, 0x40 then LD L, 0x00 then LD A, (HL) - both H and L are read
    const block = createMockBlock(0x100, [
      0x26, // LD H, n
      0x2E, // LD L, n
      0x7E, // LD A, (HL)
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After LD H, both H and L should be live
    const liveAfterH = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterH.has(Register.H)).toBe(true)
    expect(liveAfterH.has(Register.L)).toBe(true)
  })

  it('should detect when both registers in a pair are dead', () => {
    // LD H, 0x40 then LD L, 0x00 then overwrite both without reading
    const block = createMockBlock(0x100, [
      0x26, // LD H, n
      0x2E, // LD L, n
      0x26, // LD H, n (overwrite)
      0x2E, // LD L, n (overwrite)
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After first LD H, H should be dead (overwritten without reading)
    const liveAfterFirstH = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterFirstH.has(Register.H)).toBe(false)
  })

  it('should handle PUSH/POP register liveness', () => {
    // PUSH BC then POP BC - B and C are read by PUSH, written by POP
    const block = createMockBlock(0x100, [
      0xC5, // PUSH BC
      0xC1, // POP BC
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // Before PUSH, B and C should be live
    const liveBeforePush = analyzer.getLiveRegistersAfter(0x100, 0)
    // After PUSH, SP is modified
    expect(liveBeforePush.has(Register.SP)).toBe(true)
  })

  it('should track register usage in INC/DEC', () => {
    // INC B then DEC B - B is both read and written
    const block = createMockBlock(0x100, [
      0x04, // INC B
      0x05, // DEC B
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After INC B, B should be live (read by DEC)
    const liveAfterInc = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterInc.has(Register.B)).toBe(true)
  })

  it('should handle register usage in ALU operations', () => {
    // XOR A (clears A) then LD B, A (reads A)
    const block = createMockBlock(0x100, [
      0xAF, // XOR A
      0x47, // LD B, A
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After XOR A, A should be live (read by LD B, A)
    const liveAfterXor = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterXor.has(Register.A)).toBe(true)
  })

  it('should handle loops correctly', () => {
    // Block 0: LD B, 10
    // Block 1: DEC B (loop body, modifies B)
    // Block 1 loops back to itself
    const block0 = createMockBlock(0x100, [0x06]) // LD B, n
    const block1 = createMockBlock(0x102, [0x05]) // DEC B
    
    const blocks = new Map([
      [0x100, block0],
      [0x102, block1]
    ])
    
    const cfg = new MockCFG()
    cfg.addNode(0x102, [0x102, 0x103]) // Loop back or exit
    cfg.addNode(0x100, [0x102])
    
    const analyzer = new RegisterAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // B should be live after LD (used in loop)
    const liveAfterLd = analyzer.getLiveRegistersAfter(0x100, 0)
    expect(liveAfterLd.has(Register.B)).toBe(true)
  })
})
