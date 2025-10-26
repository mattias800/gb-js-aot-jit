import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'
import { decodeInstruction } from './src/decoder/InstructionDecoder.js'

const rom = loadROM('tetris.gb')

console.log('Bytes at 0x100:',  Array.from(rom.data.slice(0x100, 0x110)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '))

console.log('\nDisassembly at 0x100:')
let addr = 0x100
for (let i = 0; i < 10 && addr < rom.data.length; i++) {
  const instr = decodeInstruction(rom.data, addr)
  console.log(`0x${addr.toString(16).padStart(4, '0')}: ${instr.mnemonic} (len=${instr.length})`)
  addr += instr.length
}

const database = analyzeBasicBlocksWithTargets(rom)
const block = database.blocks.get(0x100)
if (block) {
  console.log('\nBlock at 0x100:')
  console.log('  Exit type:', block.exitType)
  console.log('  Targets:', block.targets.map(t => '0x' + t.toString(16)))
  console.log('  Instructions:')
  for (const instr of block.instructions) {
    console.log('    ' + instr.mnemonic)
  }
}
