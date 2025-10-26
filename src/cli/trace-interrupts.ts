#!/usr/bin/env node
/**
 * Trace interrupt enable and flags
 */
import { loadROM } from '../loader/ROMLoader';
import { RecompilerEngine } from '../runtime/RecompilerEngine';

const main = (): void => {
  const romPath = process.argv[2];
  const checkInterval = parseInt(process.argv[3] || '100000', 10);
  const numChecks = parseInt(process.argv[4] || '10', 10);
  
  if (!romPath) {
    console.error('Usage: npm run trace-interrupts <rom-file> [check-interval] [num-checks]');
    process.exit(1);
  }
  
  console.log('🔍 Tracing Interrupt State\n');
  
  const rom = loadROM(romPath);
  const engine = new RecompilerEngine(rom);
  const mmu = engine.getMMU();
  
  const decodeInterrupts = (val: number): string[] => {
    const bits: string[] = [];
    if (val & 0x01) bits.push('VBlank');
    if (val & 0x02) bits.push('LCD');
    if (val & 0x04) bits.push('Timer');
    if (val & 0x08) bits.push('Serial');
    if (val & 0x10) bits.push('Joypad');
    return bits;
  };
  
  for (let i = 0; i < numChecks; i++) {
    engine.run(checkInterval);
    const state = engine.getState();
    
    // Read interrupt registers
    const IE = mmu.read8(0xFFFF);  // Interrupt Enable
    const IF = mmu.read8(0xFF0F);  // Interrupt Flag
    const IME = state.IME;          // Master interrupt enable
    
    console.log(`Check ${i.toString().padStart(2)}: Cycle ${state.cycles.toString().padStart(10)}`);
    const ieStr = decodeInterrupts(IE).join(', ') || 'none';
    const ifStr = decodeInterrupts(IF).join(', ') || 'none';
    console.log(`  IME: ${IME ? 'ON ' : 'OFF'} | IE: 0x${IE.toString(16).padStart(2, '0')} (${ieStr}) | IF: 0x${IF.toString(16).padStart(2, '0')} (${ifStr})`);
  }
  
  console.log('\n📊 Interrupt Summary:');
  const finalIE = mmu.read8(0xFFFF);
  const finalIF = mmu.read8(0xFF0F);
  const finalIME = engine.getState().IME;
  
  console.log(`  Master Enable (IME): ${finalIME ? 'ON' : 'OFF'}`);
  console.log(`  Enabled Interrupts (IE): ${decodeInterrupts(finalIE).join(', ') || 'none'}`);
  console.log(`  Pending Interrupts (IF): ${decodeInterrupts(finalIF).join(', ') || 'none'}`);
  
  
  if (finalIME && (finalIE & finalIF)) {
    console.log('  ⚠️  Interrupts are enabled but not being serviced!');
  } else if (!finalIME) {
    console.log('  ⚠️  Master interrupt enable (IME) is OFF');
  } else if (finalIE === 0) {
    console.log('  ⚠️  No interrupts are enabled (IE = 0)');
  }
};

main();
