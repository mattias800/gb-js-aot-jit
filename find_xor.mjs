import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'
import { buildControlFlowGraph, getReachableNodes } from './src/analyzer/ControlFlowGraph.js'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const reachable = getReachableNodes(cfg)

console.log('Searching for XOR A in reachable blocks...')
let count = 0
for (const addr of reachable) {
  const block = database.blocks.get(addr)
  if (!block) continue
  
  for (const instr of block.instructions) {
    if (instr.mnemonic === 'XOR A') {
      console.log(`  Found at 0x${addr.toString(16)}: ${instr.mnemonic}`)
      count++
      break
    }
  }
}
console.log(`Total XOR A instructions found: ${count}`)
