import { decodeInstruction } from './src/decoder/InstructionDecoder'

// Test JR NZ instruction
const jr_nz = new Uint8Array([0x20, 0xFC])  // JR NZ, -4
const instr = decodeInstruction(jr_nz, 0)

console.log('Instruction:', instr.mnemonic)
console.log('Operands:', instr.operands)

// Manually check patterns
const mnemonic = instr.mnemonic.toUpperCase()
console.log('\nPattern checks:')
console.log('  includes(" NZ"):', mnemonic.includes(' NZ'))
console.log('  endsWith("NZ"):', mnemonic.endsWith('NZ'))
console.log('  includes(" Z,"):', mnemonic.includes(' Z,'))
console.log('  includes(" Z"):', mnemonic.includes(' Z'))

// Another test: DEC B
const dec_b = new Uint8Array([0x05])
const instr2 = decodeInstruction(dec_b, 0)
console.log('\n\nInstruction:', instr2.mnemonic)
console.log('Operands:', instr2.operands)
