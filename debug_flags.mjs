import { loadROM } from './src/loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph, getReachableNodes } from './src/analyzer/ControlFlowGraph'
import { FlagAnalyzer } from './src/analyzer/FlagAnalyzer'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const reachable = getReachableNodes(cfg)

const flagAnalyzer = new FlagAnalyzer(database.blocks, cfg)
flagAnalyzer.analyze()

// Find blocks with conditional branches
console.log('Looking for blocks with conditional branches...\n')

let found = 0
for (const addr of reachable) {
  const block = database.blocks.get(addr)
  if (!block) continue
  
  // Check for conditional instructions
  for (let i = 0; i < block.instructions.length; i++) {
    const instr = block.instructions[i]
    const mnemonic = instr.mnemonic.toUpperCase()
    
    if (mnemonic.includes(' NZ') || mnemonic.includes(' Z,') || 
        mnemonic.includes(' NC') || mnemonic.includes(' C,') ||
        (mnemonic.startsWith('JR ') && mnemonic.includes(','))) {
      
      if (found++ < 5) {
        console.log(`Block 0x${addr.toString(16)}:`)
        console.log(flagAnalyzer.getDebugInfo(addr))
        console.log()
      }
      break
    }
  }
}

console.log(`\nTotal blocks with conditional branches: ${found}`)
