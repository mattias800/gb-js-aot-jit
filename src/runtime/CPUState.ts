/**
 * Game Boy CPU State
 * 
 * Represents the complete state of the CPU including:
 * - 8 8-bit registers: A, B, C, D, E, F, H, L
 * - 16-bit stack pointer: SP
 * - 16-bit program counter: PC
 * - Interrupt Master Enable flag
 * - Halt/Stop state
 */
export class CPUState {
  // 8-bit registers
  public A: number = 0;
  public B: number = 0;
  public C: number = 0;
  public D: number = 0;
  public E: number = 0;
  public F: number = 0;  // Flags register
  public H: number = 0;
  public L: number = 0;

  // 16-bit registers
  public SP: number = 0;
  public PC: number = 0;

  // Interrupt handling
  public IME: boolean = false;  // Interrupt Master Enable
  public enableIMEAfterNext: boolean = false;  // EI delay

  // CPU state
  public halted: boolean = false;
  public stopped: boolean = false;

  // Cycle counter
  public cycles: number = 0;

  constructor() {
    this.reset();
  }

  /**
   * Reset CPU to power-on state
   */
  public reset(): void {
    // Game Boy initial register values after boot ROM
    this.A = 0x01;
    this.F = 0xB0;
    this.B = 0x00;
    this.C = 0x13;
    this.D = 0x00;
    this.E = 0xD8;
    this.H = 0x01;
    this.L = 0x4D;
    this.SP = 0xFFFE;
    this.PC = 0x0100;

    this.IME = false;
    this.enableIMEAfterNext = false;
    this.halted = false;
    this.stopped = false;
    this.cycles = 0;
  }

  // ========== Flag Register Operations ==========
  // F register layout: Z N H C 0 0 0 0
  // Z (bit 7): Zero flag
  // N (bit 6): Subtract flag
  // H (bit 5): Half-carry flag
  // C (bit 4): Carry flag

  public getZ(): boolean {
    return (this.F & 0x80) !== 0;
  }

  public setZ(value: boolean): void {
    if (value) {
      this.F |= 0x80;
    } else {
      this.F &= 0x7F;
    }
  }

  public getN(): boolean {
    return (this.F & 0x40) !== 0;
  }

  public setN(value: boolean): void {
    if (value) {
      this.F |= 0x40;
    } else {
      this.F &= 0xBF;
    }
  }

  public getH(): boolean {
    return (this.F & 0x20) !== 0;
  }

  public setH(value: boolean): void {
    if (value) {
      this.F |= 0x20;
    } else {
      this.F &= 0xDF;
    }
  }

  public getC(): boolean {
    return (this.F & 0x10) !== 0;
  }

  public setC(value: boolean): void {
    if (value) {
      this.F |= 0x10;
    } else {
      this.F &= 0xEF;
    }
  }

  // ========== 16-bit Register Pairs ==========

  public getAF(): number {
    return (this.A << 8) | (this.F & 0xF0);  // Lower 4 bits of F are always 0
  }

  public setAF(value: number): void {
    this.A = (value >> 8) & 0xFF;
    this.F = value & 0xF0;  // Only upper 4 bits are used
  }

  public getBC(): number {
    return (this.B << 8) | this.C;
  }

  public setBC(value: number): void {
    this.B = (value >> 8) & 0xFF;
    this.C = value & 0xFF;
  }

  public getDE(): number {
    return (this.D << 8) | this.E;
  }

  public setDE(value: number): void {
    this.D = (value >> 8) & 0xFF;
    this.E = value & 0xFF;
  }

  public getHL(): number {
    return (this.H << 8) | this.L;
  }

  public setHL(value: number): void {
    this.H = (value >> 8) & 0xFF;
    this.L = value & 0xFF;
  }

  // ========== Debug ==========

  public toString(): string {
    return [
      `A:${this.A.toString(16).padStart(2, '0')} F:${this.F.toString(16).padStart(2, '0')}`,
      `B:${this.B.toString(16).padStart(2, '0')} C:${this.C.toString(16).padStart(2, '0')}`,
      `D:${this.D.toString(16).padStart(2, '0')} E:${this.E.toString(16).padStart(2, '0')}`,
      `H:${this.H.toString(16).padStart(2, '0')} L:${this.L.toString(16).padStart(2, '0')}`,
      `SP:${this.SP.toString(16).padStart(4, '0')} PC:${this.PC.toString(16).padStart(4, '0')}`,
      `Flags: ${this.getZ() ? 'Z' : '-'}${this.getN() ? 'N' : '-'}${this.getH() ? 'H' : '-'}${this.getC() ? 'C' : '-'}`,
      `IME:${this.IME} Halted:${this.halted}`,
    ].join(' ');
  }

  public getFlags(): string {
    return `${this.getZ() ? 'Z' : '-'}${this.getN() ? 'N' : '-'}${this.getH() ? 'H' : '-'}${this.getC() ? 'C' : '-'}`;
  }
}
