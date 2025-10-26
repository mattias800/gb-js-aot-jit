import { loadROM } from './src/loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph, getReachableNodes } from './src/analyzer/ControlFlowGraph'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const reachable = getReachableNodes(cfg)

console.log('Total blocks:', database.blocks.size)
console.log('Reachable:', reachable.size)

// Check first few reachable blocks
let count = 0
for (const addr of Array.from(reachable).sort((a, b) => a - b)) {
  if (count++ > 10) break
  
  const block = database.blocks.get(addr)
  const node = cfg.nodes.get(addr)
  
  console.log(`\nBlock 0x${addr.toString(16)}:`)
  console.log(`  Instructions: ${block.instructions.length}`)
  console.log(`  Exit type: ${block.exitType}`)
  console.log(`  Targets: [${block.targets.map(t => `0x${t.toString(16)}`).join(', ')}]`)
  if (node) {
    console.log(`  Successors: [${Array.from(node.successors).map(s => `0x${s.toString(16)}`).join(', ')}]`)
    console.log(`  Predecessors: [${Array.from(node.predecessors).map(p => `0x${p.toString(16)}`).join(', ')}]`)
  }
  
  // Show first few instructions
  let pc = block.startAddress
  for (let i = 0; i < Math.min(5, block.instructions.length); i++) {
    const instr = block.instructions[i]
    console.log(`    0x${pc.toString(16)}: ${instr.mnemonic}`)
    pc += instr.length
  }
}
