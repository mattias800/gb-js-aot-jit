import { loadROM } from './src/loader/ROMLoader.js'
import { decodeInstruction } from './src/decoder/InstructionDecoder.js'
import { extractTargetAddress } from './src/analyzer/BasicBlockAnalyzer.js'

const rom = loadROM('tetris.gb')

// Check JP at 0x101
const instr = decodeInstruction(rom.data, 0x101)
console.log('Instruction at 0x101:', instr.mnemonic)
console.log('Bytes:', Array.from(rom.data.slice(0x101, 0x104)).map(b => '0x' + b.toString(16)))

const target = extractTargetAddress(rom.data, 0x101, instr)
console.log('Extracted target:', target ? '0x' + target.toString(16) : 'null')
