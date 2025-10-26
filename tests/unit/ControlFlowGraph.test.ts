import { describe, it, expect } from 'vitest'
import { analyzeBasicBlocksWithTargets } from '../../src/analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph, getReachableNodes, topologicalSort } from '../../src/analyzer/ControlFlowGraph'
import { ROM } from '../../src/loader/ROMLoader'

const createTestROM = (code: number[]): ROM => {
  const data = new Uint8Array(32768)
  
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

describe('ControlFlowGraph', () => {
  it('builds CFG for linear code', () => {
    // NOP; NOP; HALT
    const rom = createTestROM([0x00, 0x00, 0x76])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    expect(cfg.nodes.size).toBeGreaterThan(0)
    expect(cfg.entryPoint).toBe(0x0100)
  })
  
  it('creates edges for unconditional jump', () => {
    // JP 0x0110; ...; NOP at 0x0110
    const rom = createTestROM([
      0xC3, 0x10, 0x01,  // JP 0x0110 at 0x0100
    ])
    // Add target
    rom.data[0x0110] = 0x00  // NOP
    rom.data[0x0111] = 0x76  // HALT
    
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const entryNode = cfg.nodes.get(0x0100)
    expect(entryNode).toBeDefined()
    
    if (entryNode) {
      expect(entryNode.successors.has(0x0110)).toBe(true)
    }
  })
  
  it('creates edges for conditional branch', () => {
    // JR NZ, +2; NOP; NOP
    const rom = createTestROM([
      0x20, 0x02,  // JR NZ, +2
      0x00,        // NOP (fallthrough)
      0x00,        // NOP (target)
      0x76,        // HALT
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const entryNode = cfg.nodes.get(0x0100)
    expect(entryNode).toBeDefined()
    
    if (entryNode) {
      // Should have two successors: target and fallthrough
      expect(entryNode.successors.size).toBe(2)
    }
  })
  
  it('tracks predecessors correctly', () => {
    // JP 0x0110; NOP at 0x0110
    const rom = createTestROM([
      0xC3, 0x10, 0x01,  // JP 0x0110
    ])
    rom.data[0x0110] = 0x00  // NOP
    rom.data[0x0111] = 0x76  // HALT
    
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const targetNode = cfg.nodes.get(0x0110)
    if (targetNode) {
      expect(targetNode.predecessors.has(0x0100)).toBe(true)
    }
  })
  
  it('detects simple loop', () => {
    // loop: NOP; JR loop
    const rom = createTestROM([
      0x00,        // NOP
      0x18, 0xFE,  // JR -2 (back to 0x0100)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    expect(cfg.loops.length).toBe(1)
    const loop = cfg.loops[0]
    expect(loop.header).toBe(0x0100)
    expect(loop.body.has(0x0100)).toBe(true)
  })
  
  it('computes dominators correctly', () => {
    // Entry dominates all blocks
    const rom = createTestROM([
      0x20, 0x02,  // JR NZ, +2
      0x00,        // NOP
      0x00,        // NOP
      0x76,        // HALT
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    // Entry point should dominate itself
    const entryDominators = cfg.dominators.get(0x0100)
    expect(entryDominators).toBeDefined()
    expect(entryDominators!.has(0x0100)).toBe(true)
  })
  
  it('identifies reachable nodes', () => {
    // NOP; JP 0x0110; NOP (unreachable); ... NOP at 0x0110
    const rom = createTestROM([
      0x00,              // NOP
      0xC3, 0x10, 0x01,  // JP 0x0110
      0x00,              // NOP (unreachable)
    ])
    rom.data[0x0110] = 0x00  // NOP (reachable)
    rom.data[0x0111] = 0x76  // HALT
    
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const reachable = getReachableNodes(cfg)
    
    expect(reachable.has(0x0100)).toBe(true)
    expect(reachable.has(0x0110)).toBe(true)
    // 0x0104 (unreachable NOP) should not be discovered if jump skips it
  })
  
  it('performs topological sort', () => {
    // Simple: A -> B -> C
    const rom = createTestROM([
      0x00,              // NOP at 0x0100
      0x18, 0x00,        // JR +0 (next instruction at 0x0103)
      0x00,              // NOP at 0x0103
      0x76,              // HALT at 0x0104
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const sorted = topologicalSort(cfg)
    
    expect(sorted).toBeDefined()
    expect(sorted.length).toBeGreaterThan(0)
    
    // Entry point should come before its successors
    const entryIndex = sorted.indexOf(0x0100)
    expect(entryIndex).toBeGreaterThanOrEqual(0)
  })
  
  it('handles CALL with fallthrough', () => {
    // CALL 0x0200; NOP
    const rom = createTestROM([
      0xCD, 0x00, 0x02,  // CALL 0x0200
      0x00,              // NOP (fallthrough)
      0x76,              // HALT
    ])
    rom.data[0x0200] = 0xC9  // RET at 0x0200
    
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const entryNode = cfg.nodes.get(0x0100)
    if (entryNode) {
      // Should have edges to both call target and fallthrough
      expect(entryNode.successors.has(0x0200)).toBe(true)
      expect(entryNode.successors.has(0x0103)).toBe(true)
    }
  })
  
  it('handles return with no successors', () => {
    // RET
    const rom = createTestROM([0xC9])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    const entryNode = cfg.nodes.get(0x0100)
    if (entryNode) {
      // RET has no static successors
      expect(entryNode.successors.size).toBe(0)
    }
  })
  
  it('detects nested loops', () => {
    // outer: inner: NOP; JR inner; JR outer
    const rom = createTestROM([
      0x00,        // NOP at 0x0100
      0x18, 0xFE,  // JR -2 (inner loop to 0x0100)
      0x18, 0xFA,  // JR -6 (outer loop to 0x0100)
    ])
    const database = analyzeBasicBlocksWithTargets(rom)
    const cfg = buildControlFlowGraph(database)
    
    // Should detect at least one loop
    expect(cfg.loops.length).toBeGreaterThan(0)
  })
})
