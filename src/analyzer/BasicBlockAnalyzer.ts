import { decodeInstruction, Instruction } from '../decoder/InstructionDecoder'
import { ROM } from '../loader/ROMLoader'

export interface BasicBlock {
  id: number  // Unique block ID (start address)
  startAddress: number
  endAddress: number
  instructions: Instruction[]
  exitType: 'jump' | 'call' | 'branch' | 'return' | 'fallthrough' | 'halt' | 'indirect'
  targets: number[]  // jump/branch/call targets
}

export interface CodeDatabase {
  blocks: Map<number, BasicBlock>
  jumpTargets: Set<number>
  callTargets: Set<number>
  entryPoints: Set<number>
}

// Known entry points and interrupt vectors
const INTERRUPT_VECTORS = [
  0x0000, // RST 00 / Start
  0x0008, // RST 08
  0x0010, // RST 10
  0x0018, // RST 18
  0x0020, // RST 20
  0x0028, // RST 28
  0x0030, // RST 30
  0x0038, // RST 38
  0x0040, // VBlank interrupt
  0x0048, // STAT interrupt
  0x0050, // Timer interrupt
  0x0058, // Serial interrupt
  0x0060, // Joypad interrupt
]

const ENTRY_POINT = 0x0100

export const analyzeBasicBlocks = (rom: ROM): CodeDatabase => {
  const database: CodeDatabase = {
    blocks: new Map(),
    jumpTargets: new Set(),
    callTargets: new Set(),
    entryPoints: new Set([ENTRY_POINT]),
  }
  
  // Add interrupt vectors as potential entry points
  for (const vector of INTERRUPT_VECTORS) {
    if (vector < rom.data.length) {
      database.entryPoints.add(vector)
    }
  }
  
  // Worklist algorithm: process each entry point
  const worklist: number[] = Array.from(database.entryPoints)
  const visited = new Set<number>()
  
  while (worklist.length > 0) {
    const address = worklist.shift()!
    
    // Skip if already processed
    if (visited.has(address) || database.blocks.has(address)) {
      continue
    }
    
    const block = analyzeBlockAt(rom.data, address)
    if (block) {
      block.id = address
      database.blocks.set(address, block)
      visited.add(address)
      
      // Add targets to worklist
      for (const target of block.targets) {
        if (!visited.has(target) && !database.blocks.has(target)) {
          worklist.push(target)
        }
      }
      
      // Track jump and call targets
      if (block.exitType === 'jump' || block.exitType === 'branch') {
        block.targets.forEach(t => database.jumpTargets.add(t))
      } else if (block.exitType === 'call') {
        block.targets.forEach(t => database.callTargets.add(t))
      }
      
      // Add fallthrough address if applicable
      if (block.exitType === 'fallthrough' || block.exitType === 'branch' || block.exitType === 'call') {
        const nextAddress = block.endAddress + 1
        if (nextAddress < rom.data.length && !visited.has(nextAddress)) {
          worklist.push(nextAddress)
        }
      }
    }
  }
  
  return database
}

const analyzeBlockAt = (data: Uint8Array, startAddress: number): BasicBlock | null => {
  if (startAddress >= data.length) {
    return null
  }
  
  const instructions: Instruction[] = []
  let currentAddress = startAddress
  let exitType: BasicBlock['exitType'] = 'fallthrough'
  const targets: number[] = []
  
  while (currentAddress < data.length) {
    const instr = decodeInstruction(data, currentAddress)
    instructions.push(instr)
    
    const endAddress = currentAddress + instr.length - 1
    
    // Determine if this instruction ends the block
    const blockEnd = isBlockTerminator(instr)
    
    if (blockEnd) {
      exitType = blockEnd.exitType
      targets.push(...blockEnd.targets)
      
      return {
        id: startAddress,
        startAddress,
        endAddress,
        instructions,
        exitType,
        targets,
      }
    }
    
    // Continue to next instruction
    currentAddress += instr.length
  }
  
  // End of ROM
  return {
    id: startAddress,
    startAddress,
    endAddress: currentAddress - 1,
    instructions,
    exitType: 'fallthrough',
    targets: [],
  }
}

interface BlockTermination {
  exitType: BasicBlock['exitType']
  targets: number[]
}

const isBlockTerminator = (instr: Instruction): BlockTermination | null => {
  const mnemonic = instr.mnemonic
  
  // Unconditional jumps
  if (mnemonic === 'JP nn') {
    // Target will be extracted separately - just mark as terminator
    return { exitType: 'jump', targets: [] }
  }
  
  // Indirect jump (JP (HL))
  if (mnemonic === 'JP (HL)') {
    return { exitType: 'indirect', targets: [] }
  }
  
  // Relative jumps (unconditional)
  if (mnemonic === 'JR r8') {
    // Target will be extracted separately
    return { exitType: 'jump', targets: [] }
  }
  
  // Conditional jumps (branch)
  if (mnemonic.startsWith('JP ') && mnemonic.includes(',')) {
    // Target will be extracted separately
    return { exitType: 'branch', targets: [] }
  }
  
  // Conditional relative jumps
  if (mnemonic.startsWith('JR ') && mnemonic.includes(',')) {
    // Target will be extracted separately
    return { exitType: 'branch', targets: [] }
  }
  
  // Calls
  if (mnemonic.startsWith('CALL')) {
    // Target will be extracted separately
    return { exitType: 'call', targets: [] }
  }
  
  // RST instructions (call to fixed address)
  if (mnemonic.startsWith('RST ')) {
    const rstAddress = getRSTTarget(mnemonic)
    return rstAddress !== null ? { exitType: 'call', targets: [rstAddress] } : null
  }
  
  // Returns
  if (mnemonic === 'RET' || mnemonic === 'RETI' || mnemonic.startsWith('RET ')) {
    return { exitType: 'return', targets: [] }
  }
  
  // HALT
  if (mnemonic === 'HALT') {
    return { exitType: 'halt', targets: [] }
  }
  
  return null
}


const getRSTTarget = (mnemonic: string): number | null => {
  const match = mnemonic.match(/RST (\w+)/)
  if (!match) return null
  
  const rstMap: Record<string, number> = {
    '00H': 0x0000,
    '08H': 0x0008,
    '10H': 0x0010,
    '18H': 0x0018,
    '20H': 0x0020,
    '28H': 0x0028,
    '30H': 0x0030,
    '38H': 0x0038,
  }
  
  return rstMap[match[1]] ?? null
}

// Helper to actually extract target addresses from instruction bytes
export const extractTargetAddress = (data: Uint8Array, address: number, instr: Instruction): number | null => {
  const mnemonic = instr.mnemonic
  
  // Absolute jumps and calls: 16-bit address in bytes 1-2 (little-endian)
  if (mnemonic.includes('nn') || mnemonic.startsWith('CALL') || (mnemonic.startsWith('JP ') && !mnemonic.includes('(HL)'))) {
    if (address + 2 < data.length) {
      return data[address + 1] | (data[address + 2] << 8)
    }
  }
  
  // Relative jumps: signed 8-bit offset in byte 1
  if (mnemonic.includes('r8') || (mnemonic.startsWith('JR ') && !mnemonic.includes('nn'))) {
    if (address + 1 < data.length) {
      const offset = data[address + 1]
      const signedOffset = offset > 127 ? offset - 256 : offset
      // Target is PC after instruction (address + length) + offset
      return address + instr.length + signedOffset
    }
  }
  
  return null
}

// Improved version that extracts actual targets
export const analyzeBasicBlocksWithTargets = (rom: ROM): CodeDatabase => {
  const database: CodeDatabase = {
    blocks: new Map(),
    jumpTargets: new Set(),
    callTargets: new Set(),
    entryPoints: new Set([ENTRY_POINT]),
  }
  
  // Add interrupt vectors
  for (const vector of INTERRUPT_VECTORS) {
    if (vector < rom.data.length) {
      database.entryPoints.add(vector)
    }
  }
  
  // Pass 1: Discover all jump targets
  const worklist: number[] = Array.from(database.entryPoints)
  const visited = new Set<number>()
  
  while (worklist.length > 0) {
    const address = worklist.shift()!
    
    if (visited.has(address)) {
      continue
    }
    visited.add(address)
    
    let currentAddress = address
    
    // Scan until block terminator
    while (currentAddress < rom.data.length) {
      const instr = decodeInstruction(rom.data, currentAddress)
      const nextAddress = currentAddress + instr.length
      
      // Stop if we hit a known jump target (but not the start of this scan)
      if (nextAddress !== address && database.jumpTargets.has(nextAddress)) {
        // Add fallthrough
        if (!visited.has(nextAddress)) {
          worklist.push(nextAddress)
        }
        break
      }
      
      const termination = isBlockTerminator(instr)
      
      if (termination) {
        // Extract targets from instruction bytes
        const extractedTarget = extractTargetAddress(rom.data, currentAddress, instr)
        
        if (extractedTarget !== null) {
          // Add to appropriate target set
          if (termination.exitType === 'jump' || termination.exitType === 'branch') {
            database.jumpTargets.add(extractedTarget)
          } else if (termination.exitType === 'call') {
            database.callTargets.add(extractedTarget)
          }
          
          // Add to worklist if not visited
          if (!visited.has(extractedTarget)) {
            worklist.push(extractedTarget)
          }
        }
        
        // Also add RST targets (which come from mnemonic, not bytes)
        for (const t of termination.targets) {
          if (termination.exitType === 'call') {
            database.callTargets.add(t)
          } else {
            database.jumpTargets.add(t)
          }
          if (!visited.has(t)) {
            worklist.push(t)
          }
        }
        
        // Add fallthrough for branch and call
        if (termination.exitType === 'branch' || termination.exitType === 'call') {
          const fallthrough = nextAddress
          if (fallthrough < rom.data.length && !visited.has(fallthrough)) {
            worklist.push(fallthrough)
          }
        }
        
        break
      }
      
      currentAddress = nextAddress
    }
  }
  
  // Pass 2: Build basic blocks with known targets
  const worklist2: number[] = Array.from(database.entryPoints)
  const visited2 = new Set<number>()
  
  while (worklist2.length > 0) {
    const address = worklist2.shift()!
    
    if (visited2.has(address) || database.blocks.has(address)) {
      continue
    }
    
    const block = analyzeBlockWithTargetsAt(rom.data, address, database.jumpTargets)
    if (block) {
      block.id = address
      database.blocks.set(address, block)
      visited2.add(address)
      
      // Add targets to worklist
      for (const target of block.targets) {
        if (!visited2.has(target) && !database.blocks.has(target)) {
          worklist2.push(target)
        }
      }
      
      // Add fallthrough
      if (block.exitType === 'fallthrough' || block.exitType === 'branch' || block.exitType === 'call') {
        const nextAddress = block.endAddress + 1
        if (nextAddress < rom.data.length && !visited2.has(nextAddress)) {
          worklist2.push(nextAddress)
        }
      }
    }
  }
  
  return database
}

export const analyzeBlockWithTargetsAt = (data: Uint8Array, startAddress: number, knownTargets: Set<number>): BasicBlock | null => {
  if (startAddress >= data.length) {
    return null
  }
  
  const instructions: Instruction[] = []
  let currentAddress = startAddress
  let exitType: BasicBlock['exitType'] = 'fallthrough'
  const targets: number[] = []
  
  while (currentAddress < data.length) {
    const instr = decodeInstruction(data, currentAddress)
    instructions.push(instr)
    
    const endAddress = currentAddress + instr.length - 1
    
    // Check for block terminator
    const termination = isBlockTerminator(instr)
    
    if (termination) {
      exitType = termination.exitType
      
      // Extract actual target addresses
      if (termination.targets.length === 0 && (exitType === 'jump' || exitType === 'branch' || exitType === 'call')) {
        const target = extractTargetAddress(data, currentAddress, instr)
        if (target !== null) {
          targets.push(target)
        }
      } else {
        targets.push(...termination.targets)
      }
      
      return {
        id: startAddress,
        startAddress,
        endAddress: currentAddress + instr.length - 1,
        instructions,
        exitType,
        targets,
      }
    }
    
    // Check if next address is a known jump target (splits block)
    const nextAddress = currentAddress + instr.length
    if (nextAddress !== startAddress && knownTargets.has(nextAddress)) {
      return {
        id: startAddress,
        startAddress,
        endAddress,
        instructions,
        exitType: 'fallthrough',
        targets: [nextAddress],
      }
    }
    
    currentAddress += instr.length
  }
  
  return {
    id: startAddress,
    startAddress,
    endAddress: currentAddress - 1,
    instructions,
    exitType: 'fallthrough',
    targets: [],
  }
}
