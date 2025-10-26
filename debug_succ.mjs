import { loadROM } from './src/loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph } from './src/analyzer/ControlFlowGraph'
import { FlagAnalyzer } from './src/analyzer/FlagAnalyzer'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const flagAnalyzer = new FlagAnalyzer(database.blocks, cfg)
flagAnalyzer.analyze()

// Check block 0x293 and its successors
const blockAddr = 0x293
const node = cfg.nodes.get(blockAddr)

console.log(`Block 0x${blockAddr.toString(16)} and successors:\n`)
console.log(flagAnalyzer.getDebugInfo(blockAddr))

if (node) {
  for (const succ of node.successors) {
    console.log(`\n--- Successor 0x${succ.toString(16)} ---`)
    console.log(flagAnalyzer.getDebugInfo(succ))
  }
}
