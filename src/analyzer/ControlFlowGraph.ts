import { BasicBlock, CodeDatabase } from './BasicBlockAnalyzer'

export interface CFGNode {
  block: BasicBlock
  predecessors: Set<number>  // addresses of predecessor blocks
  successors: Set<number>    // addresses of successor blocks
}

export interface Loop {
  header: number  // address of loop header
  body: Set<number>  // addresses of blocks in loop body
  backEdges: [number, number][]  // [from, to] pairs
}

export interface ControlFlowGraph {
  nodes: Map<number, CFGNode>
  entryPoint: number
  loops: Loop[]
  dominators: Map<number, Set<number>>  // address -> set of dominator addresses
}

export const buildControlFlowGraph = (database: CodeDatabase): ControlFlowGraph => {
  const nodes = new Map<number, CFGNode>()
  
  // Create nodes for each basic block
  for (const [address, block] of database.blocks) {
    nodes.set(address, {
      block,
      predecessors: new Set(),
      successors: new Set(),
    })
  }
  
  // Build edges
  for (const [address, block] of database.blocks) {
    const node = nodes.get(address)!
    
    // Add edges based on block exit type
    switch (block.exitType) {
      case 'jump':
        // Unconditional jump: single successor
        for (const target of block.targets) {
          if (nodes.has(target)) {
            node.successors.add(target)
            nodes.get(target)!.predecessors.add(address)
          }
        }
        break
        
      case 'branch':
        // Conditional branch: two successors (target and fallthrough)
        for (const target of block.targets) {
          if (nodes.has(target)) {
            node.successors.add(target)
            nodes.get(target)!.predecessors.add(address)
          }
        }
        // Fallthrough
        const fallthrough = block.endAddress + 1
        if (nodes.has(fallthrough)) {
          node.successors.add(fallthrough)
          nodes.get(fallthrough)!.predecessors.add(address)
        }
        break
        
      case 'call':
        // Call: successor is the call target AND fallthrough
        for (const target of block.targets) {
          if (nodes.has(target)) {
            node.successors.add(target)
            nodes.get(target)!.predecessors.add(address)
          }
        }
        // Fallthrough after call returns
        const callFallthrough = block.endAddress + 1
        if (nodes.has(callFallthrough)) {
          node.successors.add(callFallthrough)
          nodes.get(callFallthrough)!.predecessors.add(address)
        }
        break
        
      case 'fallthrough':
        // Sequential execution: single successor
        for (const target of block.targets) {
          if (nodes.has(target)) {
            node.successors.add(target)
            nodes.get(target)!.predecessors.add(address)
          }
        }
        break
        
      case 'return':
      case 'halt':
      case 'indirect':
        // No static successors
        break
    }
  }
  
  const entryPoint = Array.from(database.entryPoints)[0] || 0x0100
  
  // Compute dominators
  const dominators = computeDominators(nodes, entryPoint)
  
  // Detect loops
  const loops = detectLoops(nodes, dominators)
  
  return {
    nodes,
    entryPoint,
    loops,
    dominators,
  }
}

// Compute dominator sets for each node
// A node D dominates node N if every path from entry to N must go through D
const computeDominators = (nodes: Map<number, CFGNode>, entryPoint: number): Map<number, Set<number>> => {
  const dominators = new Map<number, Set<number>>()
  const allNodes = new Set(nodes.keys())
  
  // Initialize: entry dominates itself, all others dominated by everything
  for (const address of allNodes) {
    if (address === entryPoint) {
      dominators.set(address, new Set([address]))
    } else {
      dominators.set(address, new Set(allNodes))
    }
  }
  
  // Iterative algorithm
  let changed = true
  while (changed) {
    changed = false
    
    for (const address of allNodes) {
      if (address === entryPoint) continue
      
      const node = nodes.get(address)!
      
      // New dominators = {address} ∪ (intersection of predecessor dominators)
      let newDoms: Set<number> | null = null
      
      for (const pred of node.predecessors) {
        const predDoms = dominators.get(pred)!
        if (newDoms === null) {
          newDoms = new Set(predDoms)
        } else {
          newDoms = intersection(newDoms, predDoms)
        }
      }
      
      if (newDoms === null) {
        newDoms = new Set()
      }
      
      newDoms.add(address)
      
      // Check if changed
      const oldDoms = dominators.get(address)!
      if (!setsEqual(oldDoms, newDoms)) {
        dominators.set(address, newDoms)
        changed = true
      }
    }
  }
  
  return dominators
}

// Detect loops using dominator analysis
// A loop is identified by a back edge: an edge from N to H where H dominates N
const detectLoops = (nodes: Map<number, CFGNode>, dominators: Map<number, Set<number>>): Loop[] => {
  const loops: Loop[] = []
  const backEdges: [number, number][] = []
  
  // Find back edges
  for (const [address, node] of nodes) {
    for (const successor of node.successors) {
      const sucDoms = dominators.get(address)
      if (sucDoms && sucDoms.has(successor)) {
        // successor dominates address, so this is a back edge
        backEdges.push([address, successor])
      }
    }
  }
  
  // Group back edges by header
  const headerToBackEdges = new Map<number, [number, number][]>()
  for (const edge of backEdges) {
    const header = edge[1]
    if (!headerToBackEdges.has(header)) {
      headerToBackEdges.set(header, [])
    }
    headerToBackEdges.get(header)!.push(edge)
  }
  
  // For each loop header, find all nodes in loop body
  for (const [header, edges] of headerToBackEdges) {
    const body = new Set<number>()
    body.add(header)
    
    // Add all nodes reachable backward from back edge sources
    const worklist = edges.map(e => e[0])
    const visited = new Set<number>([header])
    
    while (worklist.length > 0) {
      const current = worklist.shift()!
      if (visited.has(current)) continue
      
      visited.add(current)
      body.add(current)
      
      const node = nodes.get(current)
      if (node) {
        for (const pred of node.predecessors) {
          if (!visited.has(pred)) {
            worklist.push(pred)
          }
        }
      }
    }
    
    loops.push({
      header,
      body,
      backEdges: edges,
    })
  }
  
  return loops
}

// Helper: set intersection
const intersection = <T>(a: Set<T>, b: Set<T>): Set<T> => {
  const result = new Set<T>()
  for (const item of a) {
    if (b.has(item)) {
      result.add(item)
    }
  }
  return result
}

// Helper: set equality
const setsEqual = <T>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

// Find all reachable nodes from entry point
export const getReachableNodes = (cfg: ControlFlowGraph): Set<number> => {
  const reachable = new Set<number>()
  const worklist = [cfg.entryPoint]
  
  while (worklist.length > 0) {
    const current = worklist.shift()!
    if (reachable.has(current)) continue
    
    reachable.add(current)
    
    const node = cfg.nodes.get(current)
    if (node) {
      for (const successor of node.successors) {
        if (!reachable.has(successor)) {
          worklist.push(successor)
        }
      }
    }
  }
  
  return reachable
}

// Get all nodes that can reach a given node
export const getNodesReaching = (cfg: ControlFlowGraph, target: number): Set<number> => {
  const reaching = new Set<number>()
  const worklist = [target]
  
  while (worklist.length > 0) {
    const current = worklist.shift()!
    if (reaching.has(current)) continue
    
    reaching.add(current)
    
    const node = cfg.nodes.get(current)
    if (node) {
      for (const predecessor of node.predecessors) {
        if (!reaching.has(predecessor)) {
          worklist.push(predecessor)
        }
      }
    }
  }
  
  return reaching
}

// Topological sort of CFG nodes (useful for code generation)
export const topologicalSort = (cfg: ControlFlowGraph): number[] => {
  const sorted: number[] = []
  const visited = new Set<number>()
  const stack = new Set<number>()
  
  const visit = (address: number): void => {
    if (visited.has(address)) return
    if (stack.has(address)) {
      // Cycle detected, skip (handled by loop detection)
      return
    }
    
    stack.add(address)
    
    const node = cfg.nodes.get(address)
    if (node) {
      for (const successor of node.successors) {
        visit(successor)
      }
    }
    
    stack.delete(address)
    visited.add(address)
    sorted.unshift(address)
  }
  
  // Start from entry point
  visit(cfg.entryPoint)
  
  // Visit any remaining unvisited nodes
  for (const address of cfg.nodes.keys()) {
    if (!visited.has(address)) {
      visit(address)
    }
  }
  
  return sorted
}
