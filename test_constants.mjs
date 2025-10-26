import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'
import { buildControlFlowGraph } from './src/analyzer/ControlFlowGraph.js'
import { ConstantAnalyzer } from './src/analyzer/ConstantAnalyzer.js'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const analyzer = new ConstantAnalyzer(database.blocks, cfg)
analyzer.analyze()

// Find blocks with XOR A (which sets A=0)
for (const [addr, block] of database.blocks) {
  for (let i = 0; i < block.instructions.length; i++) {
    const instr = block.instructions[i]
    if (instr.mnemonic === 'XOR A') {
      console.log(`\nFound XOR A at block 0x${addr.toString(16)}, instr ${i}`)
      console.log(analyzer.getDebugInfo(addr))
      break
    }
  }
  if (Math.random() < 0.02) break // Sample a few blocks
}
