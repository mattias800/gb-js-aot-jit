import { loadROM } from './src/loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph } from './src/analyzer/ControlFlowGraph'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)

// Check block 0x293 which has DEC B ; JR NZ
const blockAddr = 0x293
const block = database.blocks.get(blockAddr)
const node = cfg.nodes.get(blockAddr)

console.log(`\nBlock 0x${blockAddr.toString(16)}:`)
console.log(`  Start: 0x${block.startAddress.toString(16)}`)
console.log(`  End: 0x${block.endAddress.toString(16)}`)
console.log(`  Exit type: ${block.exitType}`)
console.log(`  Targets: [${block.targets.map(t => `0x${t.toString(16)}`).join(', ')}]`)
console.log(`  Instructions:`)

let pc = block.startAddress
for (const instr of block.instructions) {
  const bytes = []
  for (let i = 0; i < instr.length; i++) {
    bytes.push(rom.data[pc + i].toString(16).padStart(2, '0'))
  }
  console.log(`    0x${pc.toString(16)}: ${instr.mnemonic.padEnd(15)} [${bytes.join(' ')}]`)
  pc += instr.length
}

console.log(`\nCFG Node:`)
if (node) {
  console.log(`  Successors: [${Array.from(node.successors).map(s => `0x${s.toString(16)}`).join(', ')}]`)
  console.log(`  Predecessors: [${Array.from(node.predecessors).map(p => `0x${p.toString(16)}`).join(', ')}]`)
} else {
  console.log(`  No CFG node found!`)
}

// Check if target blocks exist
console.log(`\nTarget blocks:`)
for (const target of block.targets) {
  const targetBlock = database.blocks.get(target)
  if (targetBlock) {
    console.log(`  0x${target.toString(16)}: exists (${targetBlock.instructions.length} instructions)`)
  } else {
    console.log(`  0x${target.toString(16)}: MISSING!`)
  }
}

// Check fallthrough
const fallthrough = block.endAddress + 1
const fallthroughBlock = database.blocks.get(fallthrough)
console.log(`\nFallthrough address: 0x${fallthrough.toString(16)}`)
if (fallthroughBlock) {
  console.log(`  Block exists (${fallthroughBlock.instructions.length} instructions)`)
} else {
  console.log(`  Block MISSING!`)
}
