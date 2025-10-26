import { decodeInstruction } from './src/decoder/InstructionDecoder.js'

const data = new Uint8Array([0xc3, 0x50, 0x01])  // JP nn to 0x0150
const instr = decodeInstruction(data, 0)

console.log('Mnemonic:', instr.mnemonic)
console.log('Is "JP nn"?', instr.mnemonic === 'JP nn')
console.log('Operands:', JSON.stringify(instr.operands))
