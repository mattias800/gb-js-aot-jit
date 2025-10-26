#!/usr/bin/env node
import { loadROM, getCartridgeTypeName, getROMSizeInBytes, getRAMSizeInBytes } from '../loader/ROMLoader'
import { analyzeBasicBlocksWithTargets } from '../analyzer/BasicBlockAnalyzer'
import { buildControlFlowGraph, getReachableNodes } from '../analyzer/ControlFlowGraph'
import { transpileInstruction } from '../recompiler/InstructionTranspiler'
import { decodeInstruction } from '../decoder/InstructionDecoder'
import { FlagAnalyzer } from '../analyzer/FlagAnalyzer'
import { RegisterAnalyzer } from '../analyzer/RegisterAnalyzer'
import { ConstantAnalyzer } from '../analyzer/ConstantAnalyzer'

const main = (): void => {
  const romPath = process.argv[2]
  
  if (!romPath) {
    console.error('Usage: npm run analyze <rom-file>')
    process.exit(1)
  }
  
  console.log('🎮 Game Boy Dynamic Recompiler - ROM Analyzer\n')
  console.log(`Loading ROM: ${romPath}`)
  
  try {
    const rom = loadROM(romPath)
    
    console.log('\n📋 ROM Header:')
    console.log(`  Title: ${rom.header.title}`)
    console.log(`  Cartridge Type: ${getCartridgeTypeName(rom.header.cartridgeType)}`)
    console.log(`  ROM Size: ${getROMSizeInBytes(rom.header.romSize)} bytes`)
    console.log(`  RAM Size: ${getRAMSizeInBytes(rom.header.ramSize)} bytes`)
    console.log(`  Checksum Valid: ${rom.isValid ? '✓' : '✗'}`)
    
    console.log('\n🔍 Analyzing basic blocks...')
    const database = analyzeBasicBlocksWithTargets(rom)
    
    console.log(`  Blocks discovered: ${database.blocks.size}`)
    console.log(`  Jump targets: ${database.jumpTargets.size}`)
    console.log(`  Call targets: ${database.callTargets.size}`)
    console.log(`  Entry points: ${database.entryPoints.size}`)
    
    console.log('\n📊 Building control flow graph...')
    const cfg = buildControlFlowGraph(database)
    
    const reachable = getReachableNodes(cfg)
    console.log(`  CFG nodes: ${cfg.nodes.size}`)
    console.log(`  Reachable from entry: ${reachable.size}`)
    console.log(`  Loops detected: ${cfg.loops.length}`)
    
    console.log('\n🚩 Analyzing flag liveness...')
    const flagAnalyzer = new FlagAnalyzer(database.blocks, cfg)
    flagAnalyzer.analyze()
    console.log(`  Flag analysis complete`)
    
    console.log('\n📝 Analyzing register liveness...')
    const registerAnalyzer = new RegisterAnalyzer(database.blocks, cfg)
    registerAnalyzer.analyze()
    console.log(`  Register analysis complete`)
    
    console.log('\n🔢 Analyzing constants...')
    const constantAnalyzer = new ConstantAnalyzer(database.blocks, cfg)
    constantAnalyzer.analyze()
    console.log(`  Constant analysis complete`)
    
    // Show entry point block
    const entryBlock = database.blocks.get(0x0100)
    if (entryBlock) {
      console.log('\n📦 Entry Point Block (0x0100):')
      console.log(`  Instructions: ${entryBlock.instructions.length}`)
      console.log(`  Exit type: ${entryBlock.exitType}`)
      console.log(`  Targets: [${entryBlock.targets.map(t => `0x${t.toString(16).toUpperCase()}`).join(', ')}]`)
      console.log('\n  Disassembly:')
      
      let addr = entryBlock.startAddress
      for (const instr of entryBlock.instructions) {
        console.log(`    0x${addr.toString(16).toUpperCase().padStart(4, '0')}: ${instr.mnemonic}`)
        addr += instr.length
      }
    }
    
    // Transpile first few blocks with flag optimization
    console.log('\n🔧 Transpiling sample blocks (with flag optimization)...')
    let count = 0
    for (const [address, block] of database.blocks) {
      if (count >= 3) break
      if (!reachable.has(address)) continue
      
      console.log(`\n  Block at 0x${address.toString(16).toUpperCase()}:`)
      
      let pc = block.startAddress
      const jsLines: string[] = []
      
      for (let instrIdx = 0; instrIdx < block.instructions.length; instrIdx++) {
        const instr = block.instructions[instrIdx]
        
        // Get instruction bytes for transpilation
        const instrBytes = new Uint8Array(3)
        for (let i = 0; i < instr.length && pc + i < rom.data.length; i++) {
          instrBytes[i] = rom.data[pc + i]
        }
        
        // Transpile with all analysis context
        const transpiled = transpileInstruction(instr, pc, instrBytes, {
          blockId: block.id,
          instructionIndex: instrIdx,
          flagAnalyzer,
          registerAnalyzer,
          constantAnalyzer
        })
        
        // Show live flags, registers, and constants for this instruction
        const liveFlags = flagAnalyzer.getLiveFlagsAfter(block.id, instrIdx)
        const liveRegs = registerAnalyzer.getLiveRegistersAfter(block.id, instrIdx)
        const flagStr = liveFlags.size > 0 ? `F:[${Array.from(liveFlags).join(',')}]` : 'F:[]'
        const regStr = liveRegs.size > 0 ? `R:[${Array.from(liveRegs).join(',')}]` : 'R:[]'
        
        // Show constant values
        const constants = []
        for (const reg of ['A', 'B', 'C', 'D', 'E', 'H', 'L'] as const) {
          const val = constantAnalyzer.getConstantValue(block.id, instrIdx, reg)
          if (val.type === 'constant') {
            constants.push(`${reg}=${val.value}`)
          }
        }
        const constStr = constants.length > 0 ? `K:[${constants.join(',')}]` : ''
        
        // Show original and transpiled
        const info = `${flagStr} ${regStr} ${constStr}`.trim()
        console.log(`    ${instr.mnemonic.padEnd(20)} → ${transpiled.code.split('\\n')[0].substring(0, 35)} ${info}`)
        
        jsLines.push(`  // ${instr.mnemonic}`)
        transpiled.code.split('\\n').forEach(line => {
          if (line.trim()) jsLines.push(`  ${line}`)
        })
        
        pc += instr.length
      }
      
      count++
    }
    
    // Show some statistics
    console.log('\n📈 Statistics:')
    const instructionCounts = new Map<string, number>()
    for (const block of database.blocks.values()) {
      for (const instr of block.instructions) {
        const base = instr.mnemonic.split(' ')[0]
        instructionCounts.set(base, (instructionCounts.get(base) || 0) + 1)
      }
    }
    
    const topInstructions = Array.from(instructionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    console.log('\n  Top 10 instructions:')
    for (const [instr, count] of topInstructions) {
      console.log(`    ${instr.padEnd(10)} ${count} times`)
    }
    
    // Show flag optimization statistics
    console.log('\n🚩 Flag Optimization Impact:')
    let totalFlagWrites = 0
    let deadFlagWrites = 0
    
    for (const block of database.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i]
        const mnemonic = instr.mnemonic.toUpperCase()
        
        // Check if this instruction writes flags
        const writesFlags = 
          mnemonic.startsWith('ADD') || mnemonic.startsWith('SUB') ||
          mnemonic.startsWith('AND') || mnemonic.startsWith('XOR') ||
          mnemonic.startsWith('OR') || mnemonic.startsWith('CP') ||
          mnemonic.startsWith('INC') || mnemonic.startsWith('DEC') ||
          mnemonic.startsWith('RL') || mnemonic.startsWith('RR') ||
          mnemonic.startsWith('SLA') || mnemonic.startsWith('SRA') ||
          mnemonic === 'CCF' || mnemonic === 'SCF'
        
        if (writesFlags) {
          totalFlagWrites++
          const liveFlags = flagAnalyzer.getLiveFlagsAfter(block.id, i)
          if (liveFlags.size === 0) {
            deadFlagWrites++
          }
        }
      }
    }
    
    if (totalFlagWrites > 0) {
      const percentSaved = ((deadFlagWrites / totalFlagWrites) * 100).toFixed(1)
      console.log(`  Total flag-writing instructions: ${totalFlagWrites}`)
      console.log(`  Dead flag writes eliminated: ${deadFlagWrites} (${percentSaved}%)`)
    }
    
    // Show register optimization statistics
    console.log('\n📝 Register Optimization Impact:')
    let totalRegWrites = 0
    let deadRegWrites = 0
    
    for (const block of database.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i]
        const mnemonic = instr.mnemonic.toUpperCase()
        
        // Check if this is a register write instruction
        if (mnemonic.startsWith('LD ') || mnemonic.startsWith('INC ') || mnemonic.startsWith('DEC ') ||
            mnemonic.startsWith('ADD') || mnemonic.startsWith('SUB') ||
            mnemonic.startsWith('AND') || mnemonic.startsWith('XOR') || mnemonic.startsWith('OR') ||
            mnemonic.startsWith('POP')) {
          totalRegWrites++
          const liveRegs = registerAnalyzer.getLiveRegistersAfter(block.id, i)
          
          // Check if any written register is dead
          // This is a simplified check - in reality we'd need to know which specific registers are written
          if (liveRegs.size === 0) {
            deadRegWrites++
          }
        }
      }
    }
    
    if (totalRegWrites > 0) {
      const percentSaved = ((deadRegWrites / totalRegWrites) * 100).toFixed(1)
      console.log(`  Total register-writing instructions: ${totalRegWrites}`)
      console.log(`  Dead register writes eliminated: ${deadRegWrites} (${percentSaved}%)`)
    }
    
    console.log('\n✅ Analysis complete!')
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
