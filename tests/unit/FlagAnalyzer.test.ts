import { describe, it, expect } from 'vitest'
import { FlagAnalyzer, Flag } from '../../src/analyzer/FlagAnalyzer.js'
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
  
  getNode(address: number): CFGNode | undefined {
    return this.nodes.get(address)
  }
  
  topologicalSort(): number[] {
    // Simple DFS-based topological sort
    const visited = new Set<number>()
    const result: number[] = []
    
    const visit = (addr: number) => {
      if (visited.has(addr)) return
      visited.add(addr)
      const node = this.nodes.get(addr)
      if (node) {
        for (const succ of node.successors) {
          visit(succ)
        }
      }
      result.push(addr)
    }
    
    for (const addr of this.nodes.keys()) {
      visit(addr)
    }
    
    return result
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

describe('FlagAnalyzer', () => {
  it('should detect dead flag writes when immediately overwritten', () => {
    // INC A (sets Z,N,H) then DEC A (sets Z,N,H again)
    // First flag write is dead
    const block = createMockBlock(0x100, [
      0x3C, // INC A
      0x3D, // DEC A
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After INC A, flags should NOT be live (overwritten by DEC A)
    const liveAfterInc = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterInc.size).toBe(0)
  })

  it('should keep flags live when read by conditional jump', () => {
    // INC A (sets Z), then JR Z, target
    const block = createMockBlock(0x100, [
      0x3C, // INC A
      0x28, // JR Z, r8
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [0x200, 0x300]) // Branch to two targets
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After INC A, Z flag should be live (read by JR Z)
    const liveAfterInc = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterInc.has(Flag.Z)).toBe(true)
  })

  it('should propagate flag liveness through multiple blocks', () => {
    // Block 0: INC A
    // Block 1: (empty fallthrough)
    // Block 2: JR Z, target
    const block0 = createMockBlock(0x100, [0x3C]) // INC A
    const block1 = createMockBlock(0x101, [0x00]) // NOP
    const block2 = createMockBlock(0x102, [0x28]) // JR Z
    
    const blocks = new Map([
      [0x100, block0],
      [0x101, block1],
      [0x102, block2]
    ])
    
    const cfg = new MockCFG()
    cfg.addNode(0x102, [])
    cfg.addNode(0x101, [0x102])
    cfg.addNode(0x100, [0x101])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // Z flag should be live in block 0 because it's needed in block 2
    const liveAfterInc = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterInc.has(Flag.Z)).toBe(true)
  })

  it('should detect live carry flag for ADC instruction', () => {
    // ADD A, B (sets C) then ADC A, C (reads C)
    const block = createMockBlock(0x100, [
      0x80, // ADD A, B
      0x89, // ADC A, C
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After ADD A, B, carry flag should be live (read by ADC)
    const liveAfterAdd = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterAdd.has(Flag.C)).toBe(true)
  })

  it('should mark all flags dead when overwritten without reads', () => {
    // XOR A (sets all flags) then AND A (sets all flags again)
    const block = createMockBlock(0x100, [
      0xAF, // XOR A
      0xA7, // AND A
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After XOR A, all flags should be dead (overwritten by AND A)
    const liveAfterXor = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterXor.size).toBe(0)
  })

  it('should handle flag reads in conditional calls', () => {
    // CP n (sets Z) then CALL Z, nn (reads Z)
    const block = createMockBlock(0x100, [
      0xFE, // CP n
      0xCC, // CALL Z, nn
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After CP, Z flag should be live (read by CALL Z)
    const liveAfterCp = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterCp.has(Flag.Z)).toBe(true)
  })

  it('should handle partial flag overwrites', () => {
    // SCF (sets C, clears N,H) then RLA (reads C, sets all flags)
    const block = createMockBlock(0x100, [
      0x37, // SCF
      0x17, // RLA
    ])
    
    const blocks = new Map([[0x100, block]])
    const cfg = new MockCFG()
    cfg.addNode(0x100, [])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // After SCF, carry flag should be live (read by RLA)
    const liveAfterScf = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterScf.has(Flag.C)).toBe(true)
    
    // N and H should be dead (overwritten by RLA)
    expect(liveAfterScf.has(Flag.N)).toBe(false)
    expect(liveAfterScf.has(Flag.H)).toBe(false)
  })

  it('should handle loops correctly', () => {
    // Block 0: DEC B (sets Z)
    // Block 1: JR NZ, back to block 0 (reads Z)
    const block0 = createMockBlock(0x100, [0x05]) // DEC B
    const block1 = createMockBlock(0x101, [0x20]) // JR NZ
    
    const blocks = new Map([
      [0x100, block0],
      [0x101, block1]
    ])
    
    const cfg = new MockCFG()
    cfg.addNode(0x102, [])
    cfg.addNode(0x101, [0x100, 0x102]) // Loop back or exit
    cfg.addNode(0x100, [0x101])
    
    const analyzer = new FlagAnalyzer(blocks, cfg)
    analyzer.analyze()
    
    // Z flag should be live after DEC (read by JR NZ in next block)
    const liveAfterDec = analyzer.getLiveFlagsAfter(0x100, 0)
    expect(liveAfterDec.has(Flag.Z)).toBe(true)
  })
})
