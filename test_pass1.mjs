import { loadROM } from './src/loader/ROMLoader.js'

const rom = loadROM('tetris.gb')
console.log('ROM size:', rom.data.length)
console.log('Byte at 0x100:', '0x' + rom.data[0x100].toString(16))
console.log('Byte at 0x101:', '0x' + rom.data[0x101].toString(16))

// Manually simulate Pass 1
console.log('\nSimulating Pass 1 from 0x100...')

import { decodeInstruction } from './src/decoder/InstructionDecoder.js'

let addr = 0x100
for (let i = 0; i < 5; i++) {
  const instr = decodeInstruction(rom.data, addr)
  console.log(`  0x${addr.toString(16)}: ${instr.mnemonic}`)
  
  // Check if it's a terminator
  const mnemonic = instr.mnemonic
  if (mnemonic === 'JP nn' || mnemonic.startsWith('JP ') || mnemonic.startsWith('JR ') || 
      mnemonic.startsWith('RET') || mnemonic === 'HALT') {
    console.log(`    -> Terminator detected!`)
    break
  }
  
  addr += instr.length
}
