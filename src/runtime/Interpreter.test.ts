import { describe, it, expect, beforeEach } from 'vitest';
import { Interpreter } from './Interpreter';
import { CPUState } from './CPUState';
import { MMU } from './MMU';

describe('Interpreter - Arithmetic Operations', () => {
  let state: CPUState;
  let mmu: MMU;

  beforeEach(() => {
    state = new CPUState();
    const rom = new Uint8Array(0x8000);
    mmu = new MMU(rom);
  });

  it('ADD A, n should add immediate to A and set flags', () => {
    // Arrange: LD A, 0x0F; ADD A, 0x01
    state.A = 0x0F;
    mmu.write8(0x0100, 0xC6); // ADD A, n
    mmu.write8(0x0101, 0x01);
    state.PC = 0x0100;

    // Act
    Interpreter.executeInstruction(state, mmu);

    // Assert
    expect(state.A).toBe(0x10);
    expect(state.getZ()).toBe(false);
    expect(state.getN()).toBe(false);
    expect(state.getH()).toBe(true);  // Half carry from bit 3
    expect(state.getC()).toBe(false);
  });

  it('ADD A, n with carry should set carry flag', () => {
    state.A = 0xFF;
    mmu.write8(0x0100, 0xC6); // ADD A, n
    mmu.write8(0x0101, 0x02);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x01);
    expect(state.getZ()).toBe(false);
    expect(state.getC()).toBe(true);  // Carry
  });

  it('SUB n should subtract and set flags', () => {
    state.A = 0x10;
    mmu.write8(0x0100, 0xD6); // SUB n
    mmu.write8(0x0101, 0x01);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x0F);
    expect(state.getN()).toBe(true);
    expect(state.getC()).toBe(false);
  });

  it('CP n should compare without modifying A', () => {
    state.A = 0x42;
    mmu.write8(0x0100, 0xFE); // CP n
    mmu.write8(0x0101, 0x42);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x42);  // Not modified
    expect(state.getZ()).toBe(true);  // Equal
    expect(state.getN()).toBe(true);
  });
});

describe('Interpreter - Logical Operations', () => {
  let state: CPUState;
  let mmu: MMU;

  beforeEach(() => {
    state = new CPUState();
    const rom = new Uint8Array(0x8000);
    mmu = new MMU(rom);
  });

  it('AND n should perform bitwise AND', () => {
    state.A = 0xFF;
    mmu.write8(0x0100, 0xE6); // AND n
    mmu.write8(0x0101, 0x0F);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x0F);
    expect(state.getZ()).toBe(false);
    expect(state.getH()).toBe(true);
    expect(state.getC()).toBe(false);
  });

  it('XOR n should perform bitwise XOR', () => {
    state.A = 0xFF;
    mmu.write8(0x0100, 0xEE); // XOR n
    mmu.write8(0x0101, 0xFF);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x00);
    expect(state.getZ()).toBe(true);
  });

  it('OR n should perform bitwise OR', () => {
    state.A = 0xF0;
    mmu.write8(0x0100, 0xF6); // OR n
    mmu.write8(0x0101, 0x0F);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0xFF);
    expect(state.getZ()).toBe(false);
  });
});

describe('Interpreter - CB Bit Operations', () => {
  let state: CPUState;
  let mmu: MMU;

  beforeEach(() => {
    state = new CPUState();
    const rom = new Uint8Array(0x8000);
    mmu = new MMU(rom);
  });

  it('BIT 7, A should test bit 7', () => {
    state.A = 0x80;
    mmu.write8(0x0100, 0xCB); // CB prefix
    mmu.write8(0x0101, 0x7F); // BIT 7, A
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x80);  // Not modified
    expect(state.getZ()).toBe(false);  // Bit is set
    expect(state.getH()).toBe(true);
  });

  it('SET 0, B should set bit 0', () => {
    state.B = 0x00;
    mmu.write8(0x0100, 0xCB); // CB prefix
    mmu.write8(0x0101, 0xC0); // SET 0, B
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.B).toBe(0x01);
  });

  it('RES 7, C should reset bit 7', () => {
    state.C = 0xFF;
    mmu.write8(0x0100, 0xCB); // CB prefix
    mmu.write8(0x0101, 0xB9); // RES 7, C
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.C).toBe(0x7F);
  });

  it('RLC A should rotate left circular', () => {
    state.A = 0x85; // 10000101
    mmu.write8(0x0100, 0xCB); // CB prefix
    mmu.write8(0x0101, 0x07); // RLC A
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.A).toBe(0x0B); // 00001011
    expect(state.getC()).toBe(true);  // Bit 7 was set
  });

  it('SLA D should shift left arithmetic', () => {
    state.D = 0x80;
    mmu.write8(0x0100, 0xCB); // CB prefix
    mmu.write8(0x0101, 0x22); // SLA D
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.D).toBe(0x00);
    expect(state.getC()).toBe(true);
    expect(state.getZ()).toBe(true);
  });
});

describe('Interpreter - Control Flow', () => {
  let state: CPUState;
  let mmu: MMU;

  beforeEach(() => {
    state = new CPUState();
    const rom = new Uint8Array(0x8000);
    mmu = new MMU(rom);
  });

  it('JP NZ, nn should jump when Z flag is clear', () => {
    state.setZ(false);
    mmu.write8(0x0100, 0xC2); // JP NZ, nn
    mmu.write8(0x0101, 0x50);
    mmu.write8(0x0102, 0x01); // Address 0x0150
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.PC).toBe(0x0150);
  });

  it('JP NZ, nn should not jump when Z flag is set', () => {
    state.setZ(true);
    mmu.write8(0x0100, 0xC2); // JP NZ, nn
    mmu.write8(0x0101, 0x50);
    mmu.write8(0x0102, 0x01);
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.PC).toBe(0x0103);  // Advanced past instruction
  });

  it('RET Z should return when Z flag is set', () => {
    state.setZ(true);
    state.SP = 0xFFFE;
    mmu.write16(0xFFFE, 0x0200);  // Return address
    mmu.write8(0x0100, 0xC8); // RET Z
    state.PC = 0x0100;

    Interpreter.executeInstruction(state, mmu);

    expect(state.PC).toBe(0x0200);
    expect(state.SP).toBe(0x0000);  // SP increased
  });
});
