import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'
import { buildControlFlowGraph } from './src/analyzer/ControlFlowGraph.js'
import { ConstantAnalyzer } from './src/analyzer/ConstantAnalyzer.js'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)
const analyzer = new ConstantAnalyzer(database.blocks, cfg)
analyzer.analyze()

// Check block at 0x28b which has XOR A
const block = database.blocks.get(0x28b)
if (block) {
  console.log('Block at 0x28b:')
  for (let i = 0; i < block.instructions.length && i < 5; i++) {
    const instr = block.instructions[i]
    console.log(`  [${i}] ${instr.mnemonic}`)
    
    const valA = analyzer.getConstantValue(0x28b, i, 'A')
    if (valA.type === 'constant') {
      console.log(`      A = ${valA.value} (constant!)`)
    }
  }
}

console.log('\n' + analyzer.getDebugInfo(0x28b))
