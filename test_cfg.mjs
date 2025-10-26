import { loadROM } from './src/loader/ROMLoader.js'
import { analyzeBasicBlocksWithTargets } from './src/analyzer/BasicBlockAnalyzer.js'
import { buildControlFlowGraph, getReachableNodes } from './src/analyzer/ControlFlowGraph.js'

const rom = loadROM('tetris.gb')
const database = analyzeBasicBlocksWithTargets(rom)
const cfg = buildControlFlowGraph(database)

console.log('Entry point:', '0x' + cfg.entryPoint.toString(16))
console.log('Total blocks:', database.blocks.size)
console.log('CFG nodes:', cfg.nodes.size)

// Check if entry point has a node
const entryNode = cfg.nodes.get(cfg.entryPoint)
console.log('Entry node exists:', !!entryNode)
if (entryNode) {
  console.log('Entry successors:', Array.from(entryNode.successors).map(s => '0x' + s.toString(16)))
  console.log('Entry block exit type:', entryNode.block.exitType)
  console.log('Entry block targets:', entryNode.block.targets.map(t => '0x' + t.toString(16)))
}

const reachable = getReachableNodes(cfg)
console.log('Reachable from entry:', reachable.size)
console.log('First 10 reachable:', Array.from(reachable).slice(0, 10).map(a => '0x' + a.toString(16)))
