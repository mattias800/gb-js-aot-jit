import { loadROM } from './src/loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer'
import { decodeInstruction } from './src/decoder/InstructionDecoder'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)

// Check block 0x293
const block = database.blocks.get(0x293)

console.log('Block 0x293 instructions:\n')

let pc = block.startAddress
for (let i = 0; i < block.instructions.length; i++) {
  const instr = block.instructions[i]
  console.log(`[${i}] 0x${pc.toString(16)}: ${instr.mnemonic}`)
  console.log(`    address: ${instr.address}`)
  
  pc += instr.length
}

console.log('\nNote: instruction addresses might not match actual ROM addresses!')
