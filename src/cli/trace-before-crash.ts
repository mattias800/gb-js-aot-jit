#!/usr/bin/env node
/**
 * Trace execution leading up to RST 38H crash
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const stopAt = parseInt(process.argv[3] || '1000000', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-before-crash <rom-file> [stop-at-cycle]');
    process.exit(1);
  }
  
  console.log('🔍 Tracing execution before crash\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  
  // Track recent PCs
  const recentPCs: number[] = [];
  const maxHistory = 100;
  
  // Hook into block execution
  const originalExecuteBlock = (engine as any).executeBlock.bind(engine);
  (engine as any).executeBlock = function() {
    const state = engine.getState();
    recentPCs.push(state.PC);
    if (recentPCs.length > maxHistory) {
      recentPCs.shift();
    }
    
    // Check if we hit RST 38H
    if (state.PC === 0x0038 && recentPCs.filter(pc => pc === 0x0038).length > 3) {
      console.log('\n⚠️  RST 38H trap detected!\n');
      console.log('Recent execution history (last 20 PCs):');
      const recent = recentPCs.slice(-20);
      recent.forEach((pc, i) => {
        const marker = i === recent.length - 1 ? ' <-- CRASH' : '';
        console.log(`  [${(i - recent.length + 1).toString().padStart(3)}] 0x${pc.toString(16).padStart(4, '0')}${marker}`);
      });
      
      console.log('\nCPU State at crash:');
      console.log(`  A=${state.A.toString(16).padStart(2, '0')} BC=${state.B.toString(16).padStart(2, '0')}${state.C.toString(16).padStart(2, '0')} DE=${state.D.toString(16).padStart(2, '0')}${state.E.toString(16).padStart(2, '0')} HL=${state.H.toString(16).padStart(2, '0')}${state.L.toString(16).padStart(2, '0')}`);
      console.log(`  SP=${state.SP.toString(16).padStart(4, '0')} PC=${state.PC.toString(16).padStart(4, '0')} F=${state.F.toString(16).padStart(2, '0')}`);
      console.log(`  Flags: Z=${state.getZ() ? 1 : 0} N=${state.getN() ? 1 : 0} H=${state.getH() ? 1 : 0} C=${state.getC() ? 1 : 0}`);
      
      // Check what was on the stack
      const mmu = engine.getMMU();
      console.log('\nStack (top 8 entries):');
      for (let i = 0; i < 8; i++) {
        const addr = (state.SP + i * 2) & 0xFFFF;
        const value = mmu.read16(addr);
        console.log(`  [SP+${(i * 2).toString().padStart(2)}] 0x${addr.toString(16).padStart(4, '0')}: 0x${value.toString(16).padStart(4, '0')}`);
      }
      
      process.exit(0);
    }
    
    return originalExecuteBlock();
  };
  
  try {
    engine.run(stopAt);
    console.log(`\n✓ No crash detected after ${stopAt} cycles`);
    console.log(`Final PC: 0x${engine.getState().PC.toString(16).padStart(4, '0')}`);
  } catch (error) {
    console.error('\nError during execution:', error);
  }
};

main();
