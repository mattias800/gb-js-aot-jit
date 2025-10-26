import { CPUState } from './CPUState';
import { MMU } from './MMU';
import { decodeInstruction } from '../decoder/InstructionDecoder';

/**
 * Interpreter for executing single Game Boy instructions
 * Used as fallback when JIT compilation isn't available
 */
export class Interpreter {
  /**
   * Execute a single instruction at the current PC
   * Returns the number of cycles consumed
   */
  public static executeInstruction(state: CPUState, mmu: MMU): number {
    const pc = state.PC;
    
    // Read instruction bytes directly from MMU (more efficient)
    const opcode = mmu.read8(pc);
    const imm8 = mmu.read8(pc + 1);
    const imm16 = imm8 | (mmu.read8(pc + 2) << 8);
    const relative = imm8 > 127 ? imm8 - 256 : imm8;
    
    // Decode for instruction length and cycles
    const instrBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      instrBytes[i] = mmu.read8(pc + i);
    }
    const instr = decodeInstruction(instrBytes, 0);
    
    // Execute instruction
    let cycles = Array.isArray(instr.cycles) ? instr.cycles[0] : instr.cycles;
    
    // NOP
    if (opcode === 0x00) {
      // Do nothing
    }
    // LD BC, nn
    else if (opcode === 0x01) {
      state.B = (imm16 >> 8) & 0xFF;
      state.C = imm16 & 0xFF;
    }
    // LD (BC), A
    else if (opcode === 0x02) {
      mmu.write8((state.B << 8) | state.C, state.A);
    }
    // INC BC
    else if (opcode === 0x03) {
      const val = ((state.B << 8) | state.C) + 1;
      state.B = (val >> 8) & 0xFF;
      state.C = val & 0xFF;
    }
    // INC B
    else if (opcode === 0x04) {
      state.B = (state.B + 1) & 0xFF;
      state.setZ(state.B === 0);
      state.setN(false);
      state.setH((state.B & 0xF) === 0);
    }
    // DEC B
    else if (opcode === 0x05) {
      state.B = (state.B - 1) & 0xFF;
      state.setZ(state.B === 0);
      state.setN(true);
      state.setH((state.B & 0xF) === 0xF);
    }
    // LD B, n
    else if (opcode === 0x06) {
      state.B = imm8;
    }
    // RLCA
    else if (opcode === 0x07) {
      const carry = (state.A >> 7) & 1;
      state.A = ((state.A << 1) | carry) & 0xFF;
      state.setZ(false);
      state.setN(false);
      state.setH(false);
      state.setC(carry === 1);
    }
    // LD (nn), SP
    else if (opcode === 0x08) {
      mmu.write16(imm16, state.SP);
    }
    // ADD HL, BC
    else if (opcode === 0x09) {
      const hl = (state.H << 8) | state.L;
      const bc = (state.B << 8) | state.C;
      const result = hl + bc;
      state.setN(false);
      state.setH((hl & 0xFFF) + (bc & 0xFFF) > 0xFFF);
      state.setC(result > 0xFFFF);
      state.H = (result >> 8) & 0xFF;
      state.L = result & 0xFF;
    }
    // LD A, (BC)
    else if (opcode === 0x0A) {
      state.A = mmu.read8((state.B << 8) | state.C);
    }
    // DEC BC
    else if (opcode === 0x0B) {
      const val = (((state.B << 8) | state.C) - 1) & 0xFFFF;
      state.B = (val >> 8) & 0xFF;
      state.C = val & 0xFF;
    }
    // INC C
    else if (opcode === 0x0C) {
      state.C = (state.C + 1) & 0xFF;
      state.setZ(state.C === 0);
      state.setN(false);
      state.setH((state.C & 0xF) === 0);
    }
    // DEC C
    else if (opcode === 0x0D) {
      state.C = (state.C - 1) & 0xFF;
      state.setZ(state.C === 0);
      state.setN(true);
      state.setH((state.C & 0xF) === 0xF);
    }
    // LD C, n
    else if (opcode === 0x0E) {
      state.C = imm8;
    }
    // RRCA (0x0F)
    else if (opcode === 0x0F) {
      const carry = state.A & 1;
      state.A = (state.A >> 1) | (carry << 7);
      state.setZ(false);
      state.setN(false);
      state.setH(false);
      state.setC(carry === 1);
    }
    // STOP (0x10)
    else if (opcode === 0x10) {
      // STOP - for now, treat as NOP
    }
    // LD DE, nn
    else if (opcode === 0x11) {
      state.D = (imm16 >> 8) & 0xFF;
      state.E = imm16 & 0xFF;
    }
    // LD (DE), A
    else if (opcode === 0x12) {
      mmu.write8((state.D << 8) | state.E, state.A);
    }
    // INC DE
    else if (opcode === 0x13) {
      const val = ((state.D << 8) | state.E) + 1;
      state.D = (val >> 8) & 0xFF;
      state.E = val & 0xFF;
    }
    // INC D
    else if (opcode === 0x14) {
      state.D = (state.D + 1) & 0xFF;
      state.setZ(state.D === 0);
      state.setN(false);
      state.setH((state.D & 0xF) === 0);
    }
    // DEC D
    else if (opcode === 0x15) {
      state.D = (state.D - 1) & 0xFF;
      state.setZ(state.D === 0);
      state.setN(true);
      state.setH((state.D & 0xF) === 0xF);
    }
    // LD D, n
    else if (opcode === 0x16) {
      state.D = imm8;
    }
    // RLA (0x17)
    else if (opcode === 0x17) {
      const carry = state.getC() ? 1 : 0;
      const newCarry = (state.A >> 7) & 1;
      state.A = ((state.A << 1) | carry) & 0xFF;
      state.setZ(false);
      state.setN(false);
      state.setH(false);
      state.setC(newCarry === 1);
    }
    // JR r8
    else if (opcode === 0x18) {
      state.PC = (pc + 2 + relative) & 0xFFFF;
      return cycles;
    }
    // ADD HL, DE
    else if (opcode === 0x19) {
      const hl = (state.H << 8) | state.L;
      const de = (state.D << 8) | state.E;
      const result = hl + de;
      state.setN(false);
      state.setH((hl & 0xFFF) + (de & 0xFFF) > 0xFFF);
      state.setC(result > 0xFFFF);
      state.H = (result >> 8) & 0xFF;
      state.L = result & 0xFF;
    }
    // LD A, (DE)
    else if (opcode === 0x1A) {
      state.A = mmu.read8((state.D << 8) | state.E);
    }
    // DEC DE
    else if (opcode === 0x1B) {
      const val = (((state.D << 8) | state.E) - 1) & 0xFFFF;
      state.D = (val >> 8) & 0xFF;
      state.E = val & 0xFF;
    }
    // INC E
    else if (opcode === 0x1C) {
      state.E = (state.E + 1) & 0xFF;
      state.setZ(state.E === 0);
      state.setN(false);
      state.setH((state.E & 0xF) === 0);
    }
    // DEC E
    else if (opcode === 0x1D) {
      state.E = (state.E - 1) & 0xFF;
      state.setZ(state.E === 0);
      state.setN(true);
      state.setH((state.E & 0xF) === 0xF);
    }
    // LD E, n
    else if (opcode === 0x1E) {
      state.E = imm8;
    }
    // RRA (0x1F)
    else if (opcode === 0x1F) {
      const carry = state.getC() ? 1 : 0;
      const newCarry = state.A & 1;
      state.A = (state.A >> 1) | (carry << 7);
      state.setZ(false);
      state.setN(false);
      state.setH(false);
      state.setC(newCarry === 1);
    }
    // JR NZ, r8
    else if (opcode === 0x20) {
      if (!state.getZ()) {
        state.PC = (pc + 2 + relative) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : cycles;
        return cycles;
      }
    }
    // LD HL, nn
    else if (opcode === 0x21) {
      state.H = (imm16 >> 8) & 0xFF;
      state.L = imm16 & 0xFF;
    }
    // LD (HL+), A
    else if (opcode === 0x22) {
      mmu.write8((state.H << 8) | state.L, state.A);
      const hl = ((state.H << 8) | state.L) + 1;
      state.H = (hl >> 8) & 0xFF;
      state.L = hl & 0xFF;
    }
    // INC HL
    else if (opcode === 0x23) {
      const val = ((state.H << 8) | state.L) + 1;
      state.H = (val >> 8) & 0xFF;
      state.L = val & 0xFF;
    }
    // INC H
    else if (opcode === 0x24) {
      state.H = (state.H + 1) & 0xFF;
      state.setZ(state.H === 0);
      state.setN(false);
      state.setH((state.H & 0xF) === 0);
    }
    // DEC H
    else if (opcode === 0x25) {
      state.H = (state.H - 1) & 0xFF;
      state.setZ(state.H === 0);
      state.setN(true);
      state.setH((state.H & 0xF) === 0xF);
    }
    // LD H, n
    else if (opcode === 0x26) {
      state.H = imm8;
    }
    // DAA (0x27)
    else if (opcode === 0x27) {
      let a = state.A;
      if (!state.getN()) {
        if (state.getC() || a > 0x99) {
          a += 0x60;
          state.setC(true);
        }
        if (state.getH() || (a & 0x0F) > 0x09) {
          a += 0x06;
        }
      } else {
        if (state.getC()) a -= 0x60;
        if (state.getH()) a -= 0x06;
      }
      a &= 0xFF;
      state.A = a;
      state.setZ(a === 0);
      state.setH(false);
    }
    // JR Z, r8
    else if (opcode === 0x28) {
      if (state.getZ()) {
        state.PC = (pc + 2 + relative) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : cycles;
        return cycles;
      }
    }
    // ADD HL, HL
    else if (opcode === 0x29) {
      const hl = (state.H << 8) | state.L;
      const result = hl + hl;
      state.setN(false);
      state.setH((hl & 0xFFF) + (hl & 0xFFF) > 0xFFF);
      state.setC(result > 0xFFFF);
      state.H = (result >> 8) & 0xFF;
      state.L = result & 0xFF;
    }
    // LD A, (HL+)
    else if (opcode === 0x2A) {
      state.A = mmu.read8((state.H << 8) | state.L);
      const hl = ((state.H << 8) | state.L) + 1;
      state.H = (hl >> 8) & 0xFF;
      state.L = hl & 0xFF;
    }
    // DEC HL
    else if (opcode === 0x2B) {
      const val = (((state.H << 8) | state.L) - 1) & 0xFFFF;
      state.H = (val >> 8) & 0xFF;
      state.L = val & 0xFF;
    }
    // INC L
    else if (opcode === 0x2C) {
      state.L = (state.L + 1) & 0xFF;
      state.setZ(state.L === 0);
      state.setN(false);
      state.setH((state.L & 0xF) === 0);
    }
    // DEC L
    else if (opcode === 0x2D) {
      state.L = (state.L - 1) & 0xFF;
      state.setZ(state.L === 0);
      state.setN(true);
      state.setH((state.L & 0xF) === 0xF);
    }
    // LD L, n
    else if (opcode === 0x2E) {
      state.L = imm8;
    }
    // CPL (0x2F) - Complement A
    else if (opcode === 0x2F) {
      state.A = (~state.A) & 0xFF;
      state.setN(true);
      state.setH(true);
    }
    // JR NC, r8
    else if (opcode === 0x30) {
      if (!state.getC()) {
        state.PC = (pc + 2 + relative) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : cycles;
        return cycles;
      }
    }
    // LD SP, nn
    else if (opcode === 0x31) {
      state.SP = imm16;
    }
    // LD (HL-), A
    else if (opcode === 0x32) {
      mmu.write8((state.H << 8) | state.L, state.A);
      const hl = ((state.H << 8) | state.L) - 1;
      state.H = (hl >> 8) & 0xFF;
      state.L = hl & 0xFF;
    }
    // INC SP
    else if (opcode === 0x33) {
      state.SP = (state.SP + 1) & 0xFFFF;
    }
    // INC (HL)
    else if (opcode === 0x34) {
      const addr = (state.H << 8) | state.L;
      let val = mmu.read8(addr);
      val = (val + 1) & 0xFF;
      mmu.write8(addr, val);
      state.setZ(val === 0);
      state.setN(false);
      state.setH((val & 0xF) === 0);
    }
    // DEC (HL)
    else if (opcode === 0x35) {
      const addr = (state.H << 8) | state.L;
      let val = mmu.read8(addr);
      val = (val - 1) & 0xFF;
      mmu.write8(addr, val);
      state.setZ(val === 0);
      state.setN(true);
      state.setH((val & 0xF) === 0xF);
    }
    // LD (HL), n
    else if (opcode === 0x36) {
      mmu.write8((state.H << 8) | state.L, imm8);
    }
    // SCF (0x37) - Set Carry Flag
    else if (opcode === 0x37) {
      state.setN(false);
      state.setH(false);
      state.setC(true);
    }
    // JR C, r8
    else if (opcode === 0x38) {
      if (state.getC()) {
        state.PC = (pc + 2 + relative) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : cycles;
        return cycles;
      }
    }
    // ADD HL, SP
    else if (opcode === 0x39) {
      const hl = (state.H << 8) | state.L;
      const result = hl + state.SP;
      state.setN(false);
      state.setH((hl & 0xFFF) + (state.SP & 0xFFF) > 0xFFF);
      state.setC(result > 0xFFFF);
      state.H = (result >> 8) & 0xFF;
      state.L = result & 0xFF;
    }
    // LD A, (HL-)
    else if (opcode === 0x3A) {
      state.A = mmu.read8((state.H << 8) | state.L);
      const hl = ((state.H << 8) | state.L) - 1;
      state.H = (hl >> 8) & 0xFF;
      state.L = hl & 0xFF;
    }
    // DEC SP
    else if (opcode === 0x3B) {
      state.SP = (state.SP - 1) & 0xFFFF;
    }
    // INC A
    else if (opcode === 0x3C) {
      state.A = (state.A + 1) & 0xFF;
      state.setZ(state.A === 0);
      state.setN(false);
      state.setH((state.A & 0xF) === 0);
    }
    // DEC A
    else if (opcode === 0x3D) {
      state.A = (state.A - 1) & 0xFF;
      state.setZ(state.A === 0);
      state.setN(true);
      state.setH((state.A & 0xF) === 0xF);
    }
    // LD A, n
    else if (opcode === 0x3E) {
      state.A = imm8;
    }
    // CCF (0x3F) - Complement Carry Flag
    else if (opcode === 0x3F) {
      state.setN(false);
      state.setH(false);
      state.setC(!state.getC());
    }
    // LD B, B through LD A, A (register copies)
    else if (opcode >= 0x40 && opcode <= 0x7F && opcode !== 0x76) {
      const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      const dst = (opcode >> 3) & 7;
      const src = opcode & 7;
      
      let value: number;
      if (src === 6) { // (HL)
        value = mmu.read8((state.H << 8) | state.L);
      } else {
        const srcReg = regs[src] as keyof CPUState;
        value = state[srcReg] as number;
      }
      
      if (dst === 6) { // (HL)
        mmu.write8((state.H << 8) | state.L, value);
      } else {
        const dstReg = regs[dst] as keyof CPUState;
        (state as any)[dstReg] = value;
      }
    }
    // HALT
    else if (opcode === 0x76) {
      state.halted = true;
    }
    // Arithmetic/logic operations (0x80-0xBF)
    else if (opcode >= 0x80 && opcode <= 0xBF) {
      const op = (opcode >> 3) & 7;
      const reg = opcode & 7;
      const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      
      let value: number;
      if (reg === 6) { // (HL)
        value = mmu.read8((state.H << 8) | state.L);
      } else {
        const regName = regs[reg] as keyof CPUState;
        value = state[regName] as number;
      }
      
      // ADD A, r
      if (op === 0) {
        const result = state.A + value;
        state.setZ((result & 0xFF) === 0);
        state.setN(false);
        state.setH((state.A & 0xF) + (value & 0xF) > 0xF);
        state.setC(result > 0xFF);
        state.A = result & 0xFF;
      }
      // ADC A, r
      else if (op === 1) {
        const carry = state.getC() ? 1 : 0;
        const result = state.A + value + carry;
        state.setZ((result & 0xFF) === 0);
        state.setN(false);
        state.setH((state.A & 0xF) + (value & 0xF) + carry > 0xF);
        state.setC(result > 0xFF);
        state.A = result & 0xFF;
      }
      // SUB r
      else if (op === 2) {
        const result = state.A - value;
        state.setZ((result & 0xFF) === 0);
        state.setN(true);
        state.setH((state.A & 0xF) < (value & 0xF));
        state.setC(state.A < value);
        state.A = result & 0xFF;
      }
      // SBC A, r
      else if (op === 3) {
        const carry = state.getC() ? 1 : 0;
        const result = state.A - value - carry;
        state.setZ((result & 0xFF) === 0);
        state.setN(true);
        state.setH((state.A & 0xF) < (value & 0xF) + carry);
        state.setC(state.A < value + carry);
        state.A = result & 0xFF;
      }
      // AND r
      else if (op === 4) {
        state.A = state.A & value;
        state.setZ(state.A === 0);
        state.setN(false);
        state.setH(true);
        state.setC(false);
      }
      // XOR r
      else if (op === 5) {
        state.A = state.A ^ value;
        state.setZ(state.A === 0);
        state.setN(false);
        state.setH(false);
        state.setC(false);
      }
      // OR r
      else if (op === 6) {
        state.A = state.A | value;
        state.setZ(state.A === 0);
        state.setN(false);
        state.setH(false);
        state.setC(false);
      }
      // CP r
      else if (op === 7) {
        const result = state.A - value;
        state.setZ((result & 0xFF) === 0);
        state.setN(true);
        state.setH((state.A & 0xF) < (value & 0xF));
        state.setC(state.A < value);
      }
    }
    // CALL nn
    else if (opcode === 0xCD) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 3);
      state.PC = imm16;
      return cycles;
    }
    // RET
    else if (opcode === 0xC9) {
      state.PC = mmu.read16(state.SP);
      state.SP = (state.SP + 2) & 0xFFFF;
      return cycles;
    }
    // RET Z (0xC8)
    else if (opcode === 0xC8) {
      if (state.getZ()) {
        state.PC = mmu.read16(state.SP);
        state.SP = (state.SP + 2) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 20;
        return cycles;
      }
    }
    // RET NZ (0xC0)
    else if (opcode === 0xC0) {
      if (!state.getZ()) {
        state.PC = mmu.read16(state.SP);
        state.SP = (state.SP + 2) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 20;
        return cycles;
      }
    }
    // RET C (0xD8)
    else if (opcode === 0xD8) {
      if (state.getC()) {
        state.PC = mmu.read16(state.SP);
        state.SP = (state.SP + 2) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 20;
        return cycles;
      }
    }
    // RET NC (0xD0)
    else if (opcode === 0xD0) {
      if (!state.getC()) {
        state.PC = mmu.read16(state.SP);
        state.SP = (state.SP + 2) & 0xFFFF;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 20;
        return cycles;
      }
    }
    // PUSH BC/DE/HL/AF
    else if (opcode === 0xC5) { // PUSH BC
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, (state.B << 8) | state.C);
    }
    else if (opcode === 0xD5) { // PUSH DE
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, (state.D << 8) | state.E);
    }
    else if (opcode === 0xE5) { // PUSH HL
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, (state.H << 8) | state.L);
    }
    else if (opcode === 0xF5) { // PUSH AF
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, (state.A << 8) | state.F);
    }
    // POP BC/DE/HL/AF
    else if (opcode === 0xC1) { // POP BC
      const val = mmu.read16(state.SP);
      state.B = (val >> 8) & 0xFF;
      state.C = val & 0xFF;
      state.SP = (state.SP + 2) & 0xFFFF;
    }
    else if (opcode === 0xD1) { // POP DE
      const val = mmu.read16(state.SP);
      state.D = (val >> 8) & 0xFF;
      state.E = val & 0xFF;
      state.SP = (state.SP + 2) & 0xFFFF;
    }
    else if (opcode === 0xE1) { // POP HL
      const val = mmu.read16(state.SP);
      state.H = (val >> 8) & 0xFF;
      state.L = val & 0xFF;
      state.SP = (state.SP + 2) & 0xFFFF;
    }
    else if (opcode === 0xF1) { // POP AF
      const val = mmu.read16(state.SP);
      state.A = (val >> 8) & 0xFF;
      state.F = val & 0xF0;
      state.SP = (state.SP + 2) & 0xFFFF;
    }
    // LDH (n), A
    else if (opcode === 0xE0) {
      mmu.write8(0xFF00 + imm8, state.A);
    }
    // LDH A, (n)
    else if (opcode === 0xF0) {
      state.A = mmu.read8(0xFF00 + imm8);
    }
    // JP nn
    else if (opcode === 0xC3) {
      state.PC = imm16;
      return cycles;
    }
    // LD (nn), A (0xEA)
    else if (opcode === 0xEA) {
      mmu.write8(imm16, state.A);
    }
    // LD A, (nn) (0xFA)
    else if (opcode === 0xFA) {
      state.A = mmu.read8(imm16);
    }
    // CP n
    else if (opcode === 0xFE) {
      const result = state.A - imm8;
      state.setZ((result & 0xFF) === 0);
      state.setN(true);
      state.setH((state.A & 0xF) < (imm8 & 0xF));
      state.setC(state.A < imm8);
    }
    // DI
    else if (opcode === 0xF3) {
      state.IME = false;
    }
    // EI
    else if (opcode === 0xFB) {
      state.enableIMEAfterNext = true;
    }
    // JP NZ, nn (0xC2)
    else if (opcode === 0xC2) {
      if (!state.getZ()) {
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 16;
        return cycles;
      }
    }
    // CALL NZ, nn (0xC4)
    else if (opcode === 0xC4) {
      if (!state.getZ()) {
        state.SP = (state.SP - 2) & 0xFFFF;
        mmu.write16(state.SP, pc + 3);
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 24;
        return cycles;
      }
    }
    // ADD A, n (0xC6)
    else if (opcode === 0xC6) {
      const result = state.A + imm8;
      state.setZ((result & 0xFF) === 0);
      state.setN(false);
      state.setH((state.A & 0xF) + (imm8 & 0xF) > 0xF);
      state.setC(result > 0xFF);
      state.A = result & 0xFF;
    }
    // RST 00H (0xC7)
    else if (opcode === 0xC7) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x00;
      return cycles;
    }
    // JP Z, nn (0xCA)
    else if (opcode === 0xCA) {
      if (state.getZ()) {
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 16;
        return cycles;
      }
    }
    // CB prefix (0xCB) - Handle CB-prefixed instructions
    else if (opcode === 0xCB) {
      const cbOp = mmu.read8(pc + 1);
      cycles = this.executeCBInstruction(state, mmu, cbOp, pc);
      state.PC = (pc + 2) & 0xFFFF;
      return cycles;
    }
    // CALL Z, nn (0xCC)
    else if (opcode === 0xCC) {
      if (state.getZ()) {
        state.SP = (state.SP - 2) & 0xFFFF;
        mmu.write16(state.SP, pc + 3);
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 24;
        return cycles;
      }
    }
    // ADC A, n (0xCE)
    else if (opcode === 0xCE) {
      const carry = state.getC() ? 1 : 0;
      const result = state.A + imm8 + carry;
      state.setZ((result & 0xFF) === 0);
      state.setN(false);
      state.setH((state.A & 0xF) + (imm8 & 0xF) + carry > 0xF);
      state.setC(result > 0xFF);
      state.A = result & 0xFF;
    }
    // RST 08H (0xCF)
    else if (opcode === 0xCF) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x08;
      return cycles;
    }
    // JP NC, nn (0xD2)
    else if (opcode === 0xD2) {
      if (!state.getC()) {
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 16;
        return cycles;
      }
    }
    // CALL NC, nn (0xD4)
    else if (opcode === 0xD4) {
      if (!state.getC()) {
        state.SP = (state.SP - 2) & 0xFFFF;
        mmu.write16(state.SP, pc + 3);
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 24;
        return cycles;
      }
    }
    // SUB n (0xD6)
    else if (opcode === 0xD6) {
      const result = state.A - imm8;
      state.setZ((result & 0xFF) === 0);
      state.setN(true);
      state.setH((state.A & 0xF) < (imm8 & 0xF));
      state.setC(state.A < imm8);
      state.A = result & 0xFF;
    }
    // RST 10H (0xD7)
    else if (opcode === 0xD7) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x10;
      return cycles;
    }
    // RETI (0xD9)
    else if (opcode === 0xD9) {
      state.PC = mmu.read16(state.SP);
      state.SP = (state.SP + 2) & 0xFFFF;
      state.IME = true;  // Enable interrupts immediately
      return cycles;
    }
    // JP C, nn (0xDA)
    else if (opcode === 0xDA) {
      if (state.getC()) {
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 16;
        return cycles;
      }
    }
    // CALL C, nn (0xDC)
    else if (opcode === 0xDC) {
      if (state.getC()) {
        state.SP = (state.SP - 2) & 0xFFFF;
        mmu.write16(state.SP, pc + 3);
        state.PC = imm16;
        cycles = Array.isArray(instr.cycles) ? instr.cycles[1] : 24;
        return cycles;
      }
    }
    // SBC A, n (0xDE)
    else if (opcode === 0xDE) {
      const carry = state.getC() ? 1 : 0;
      const result = state.A - imm8 - carry;
      state.setZ((result & 0xFF) === 0);
      state.setN(true);
      state.setH((state.A & 0xF) < (imm8 & 0xF) + carry);
      state.setC(state.A < imm8 + carry);
      state.A = result & 0xFF;
    }
    // RST 18H (0xDF)
    else if (opcode === 0xDF) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x18;
      return cycles;
    }
    // LD (C), A / LD (0xFF00+C), A (0xE2)
    else if (opcode === 0xE2) {
      mmu.write8(0xFF00 + state.C, state.A);
    }
    // LD A, (C) / LD A, (0xFF00+C) (0xF2)
    else if (opcode === 0xF2) {
      state.A = mmu.read8(0xFF00 + state.C);
    }
    // AND n (0xE6)
    else if (opcode === 0xE6) {
      state.A = state.A & imm8;
      state.setZ(state.A === 0);
      state.setN(false);
      state.setH(true);
      state.setC(false);
    }
    // RST 20H (0xE7)
    else if (opcode === 0xE7) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x20;
      return cycles;
    }
    // ADD SP, r8 (0xE8)
    else if (opcode === 0xE8) {
      const offset = relative;
      const result = state.SP + offset;
      state.setZ(false);
      state.setN(false);
      state.setH((state.SP & 0xF) + (offset & 0xF) > 0xF);
      state.setC((state.SP & 0xFF) + (offset & 0xFF) > 0xFF);
      state.SP = result & 0xFFFF;
    }
    // JP (HL) (0xE9)
    else if (opcode === 0xE9) {
      state.PC = (state.H << 8) | state.L;
      return cycles;
    }
    // XOR n (0xEE)
    else if (opcode === 0xEE) {
      state.A = state.A ^ imm8;
      state.setZ(state.A === 0);
      state.setN(false);
      state.setH(false);
      state.setC(false);
    }
    // RST 28H (0xEF)
    else if (opcode === 0xEF) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x28;
      return cycles;
    }
    // LD HL, SP+r8 (0xF8)
    else if (opcode === 0xF8) {
      const offset = relative;
      const result = state.SP + offset;
      state.setZ(false);
      state.setN(false);
      state.setH((state.SP & 0xF) + (offset & 0xF) > 0xF);
      state.setC((state.SP & 0xFF) + (offset & 0xFF) > 0xFF);
      state.H = (result >> 8) & 0xFF;
      state.L = result & 0xFF;
    }
    // LD SP, HL (0xF9)
    else if (opcode === 0xF9) {
      state.SP = (state.H << 8) | state.L;
    }
    // OR n (0xF6)
    else if (opcode === 0xF6) {
      state.A = state.A | imm8;
      state.setZ(state.A === 0);
      state.setN(false);
      state.setH(false);
      state.setC(false);
    }
    // RST 30H (0xF7)
    else if (opcode === 0xF7) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x30;
      return cycles;
    }
    // RST 38H (0xFF)
    else if (opcode === 0xFF) {
      state.SP = (state.SP - 2) & 0xFFFF;
      mmu.write16(state.SP, pc + 1);
      state.PC = 0x38;
      return cycles;
    }
    // Default: skip unknown instruction
    else {
      console.warn(`Interpreter: Unknown opcode 0x${opcode.toString(16).padStart(2, '0')} at 0x${pc.toString(16)}`);
    }
    
    // Advance PC by instruction length
    state.PC = (state.PC + instr.length) & 0xFFFF;
    return cycles;
  }
  
  /**
   * Execute CB-prefixed instructions (bit operations)
   */
  private static executeCBInstruction(state: CPUState, mmu: MMU, cbOp: number, pc: number): number {
    const reg = cbOp & 0x07;
    const bit = (cbOp >> 3) & 0x07;
    const op = (cbOp >> 6) & 0x03;
    
    const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    
    // Get value
    let value: number;
    if (reg === 6) { // (HL)
      value = mmu.read8((state.H << 8) | state.L);
    } else {
      const regName = regs[reg] as keyof CPUState;
      value = state[regName] as number;
    }
    
    let result = value;
    let cycles = reg === 6 ? 16 : 8; // (HL) operations take longer
    
    // Determine operation type
    if (cbOp < 0x40) {
      // Rotate/shift operations (0x00-0x3F)
      const rotOp = (cbOp >> 3) & 0x07;
      
      switch (rotOp) {
        case 0: // RLC
          result = ((value << 1) | (value >> 7)) & 0xFF;
          state.setC((value & 0x80) !== 0);
          break;
        case 1: // RRC
          result = ((value >> 1) | (value << 7)) & 0xFF;
          state.setC((value & 0x01) !== 0);
          break;
        case 2: // RL
          result = ((value << 1) | (state.getC() ? 1 : 0)) & 0xFF;
          state.setC((value & 0x80) !== 0);
          break;
        case 3: // RR
          result = ((value >> 1) | (state.getC() ? 0x80 : 0)) & 0xFF;
          state.setC((value & 0x01) !== 0);
          break;
        case 4: // SLA
          result = (value << 1) & 0xFF;
          state.setC((value & 0x80) !== 0);
          break;
        case 5: // SRA
          result = ((value >> 1) | (value & 0x80)) & 0xFF;
          state.setC((value & 0x01) !== 0);
          break;
        case 6: // SWAP
          result = ((value & 0x0F) << 4) | ((value & 0xF0) >> 4);
          state.setC(false);
          break;
        case 7: // SRL
          result = (value >> 1) & 0xFF;
          state.setC((value & 0x01) !== 0);
          break;
      }
      
      state.setZ(result === 0);
      state.setN(false);
      state.setH(false);
      
    } else if (cbOp < 0x80) {
      // BIT operations (0x40-0x7F) - test bit
      state.setZ((value & (1 << bit)) === 0);
      state.setN(false);
      state.setH(true);
      // Don't modify value for BIT
      result = value;
      cycles = reg === 6 ? 12 : 8;
      
    } else if (cbOp < 0xC0) {
      // RES operations (0x80-0xBF) - reset bit
      result = value & ~(1 << bit);
      // Flags not affected
      
    } else {
      // SET operations (0xC0-0xFF) - set bit
      result = value | (1 << bit);
      // Flags not affected
    }
    
    // Write back result (except for BIT which only tests)
    if (cbOp < 0x40 || cbOp >= 0x80) {
      if (reg === 6) { // (HL)
        mmu.write8((state.H << 8) | state.L, result);
      } else {
        const regName = regs[reg] as keyof CPUState;
        (state as any)[regName] = result;
      }
    }
    
    return cycles;
  }
}
