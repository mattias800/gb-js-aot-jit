import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)

console.log('Jump targets around 0x100-0x120:')
for (let addr = 0x100; addr <= 0x120; addr++) {
  if (database.jumpTargets.has(addr)) {
    console.log('  0x' + addr.toString(16))
  }
}

console.log('\nAll blocks:')
for (const [addr, block] of database.blocks) {
  if (addr >= 0x100 && addr <= 0x160) {
    console.log(`  0x${addr.toString(16)}: ${block.instructions.length} instrs, exit=${block.exitType}, targets=[${block.targets.map(t => '0x'+t.toString(16)).join(',')}]`)
  }
}
