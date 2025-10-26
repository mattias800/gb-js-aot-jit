import { loadROM } from './src/loader/ROMLoader.js'
import { decodeInstruction } from './src/decoder/InstructionDecoder.js'

const ENTRY_POINT = 0x0100
const INTERRUPT_VECTORS = [0x0000, 0x0008, 0x0010, 0x0018, 0x0020, 0x0028, 0x0030, 0x0038, 0x0040, 0x0048, 0x0050, 0x0058, 0x0060]

const rom = loadROM('tetris.gb')

const database = {
  jumpTargets: new Set(),
  entryPoints: new Set([ENTRY_POINT])
}

for (const vector of INTERRUPT_VECTORS) {
  if (vector < rom.data.length) {
    database.entryPoints.add(vector)
  }
}

const worklist = Array.from(database.entryPoints)
const visited = new Set()

console.log('Starting Pass 1')
console.log('Entry points:', Array.from(database.entryPoints).map(e => '0x' + e.toString(16)))

let iterations = 0
while (worklist.length > 0 && iterations < 5) {
  iterations++
  const address = worklist.shift()
  
  console.log(`\nIteration ${iterations}: Processing 0x${address.toString(16)}`)
  
  if (visited.has(address)) {
    console.log('  Already visited, skipping')
    continue
  }
  visited.add(address)
  
  let currentAddress = address
  let instrCount = 0
  
  while (currentAddress < rom.data.length && instrCount < 10) {
    const instr = decodeInstruction(rom.data, currentAddress)
    const nextAddress = currentAddress + instr.length
    
    console.log(`  0x${currentAddress.toString(16)}: ${instr.mnemonic}`)
    instrCount++
    
    // Check termination
    const mnemonic = instr.mnemonic
    const isTerminator = mnemonic === 'JP nn' || mnemonic === 'JR r8' || 
                        mnemonic.startsWith('RET') || mnemonic === 'HALT' ||
                        (mnemonic.startsWith('JP ') && mnemonic.includes(',')) ||
                        (mnemonic.startsWith('JR ') && mnemonic.includes(','))
    
    if (isTerminator) {
      console.log(`    -> Terminator! Breaking.`)
      break
    }
    
    currentAddress = nextAddress
  }
}
