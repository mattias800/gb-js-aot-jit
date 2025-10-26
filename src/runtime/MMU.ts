/**
 * Game Boy Memory Management Unit (MMU)
 * 
 * Memory map:
 * 0x0000-0x3FFF: ROM Bank 0 (fixed)
 * 0x4000-0x7FFF: ROM Bank 1-N (switchable)
 * 0x8000-0x9FFF: Video RAM (VRAM)
 * 0xA000-0xBFFF: External RAM (cartridge RAM, switchable)
 * 0xC000-0xCFFF: Work RAM Bank 0 (WRAM)
 * 0xD000-0xDFFF: Work RAM Bank 1 (WRAM)
 * 0xE000-0xFDFF: Echo RAM (mirror of C000-DDFF)
 * 0xFE00-0xFE9F: Object Attribute Memory (OAM)
 * 0xFEA0-0xFEFF: Unusable
 * 0xFF00-0xFF7F: I/O Registers
 * 0xFF80-0xFFFE: High RAM (HRAM)
 * 0xFFFF: Interrupt Enable register
 */
export class MMU {
  // ROM (up to 8MB with banking)
  private rom: Uint8Array;
  private romBank: number = 1;  // Current ROM bank (1-N)

  // RAM regions
  private vram: Uint8Array;      // 8KB Video RAM
  private wram: Uint8Array;      // 8KB Work RAM  
  private hram: Uint8Array;      // 127 bytes High RAM
  private oam: Uint8Array;       // 160 bytes OAM
  
  // External RAM (cartridge)
  private eram: Uint8Array;      // Up to 32KB
  private eramBank: number = 0;  // Current ERAM bank
  private eramEnabled: boolean = false;

  // I/O Registers
  private ioRegs: Uint8Array;    // 128 bytes

  // Interrupt enable
  private interruptEnable: number = 0;

  // Memory-mapped I/O handlers (for PPU, APU, etc.)
  private readHandlers: Map<number, () => number> = new Map();
  private writeHandlers: Map<number, (value: number) => void> = new Map();

  constructor(romData: Uint8Array) {
    this.rom = romData;

    // Allocate memory regions
    this.vram = new Uint8Array(0x2000);   // 8KB
    this.wram = new Uint8Array(0x2000);   // 8KB
    this.hram = new Uint8Array(0x7F);     // 127 bytes
    this.oam = new Uint8Array(0xA0);      // 160 bytes
    this.eram = new Uint8Array(0x8000);   // 32KB (max)
    this.ioRegs = new Uint8Array(0x80);   // 128 bytes

    this.reset();
  }

  /**
   * Reset MMU to power-on state
   */
  public reset(): void {
    this.romBank = 1;
    this.eramBank = 0;
    this.eramEnabled = false;
    this.interruptEnable = 0;

    // Clear RAM
    this.vram.fill(0);
    this.wram.fill(0);
    this.hram.fill(0);
    this.oam.fill(0);
    this.eram.fill(0);
    this.ioRegs.fill(0);

    // Set initial I/O register values
    this.ioRegs[0x05] = 0x00;  // TIMA
    this.ioRegs[0x06] = 0x00;  // TMA
    this.ioRegs[0x07] = 0x00;  // TAC
    this.ioRegs[0x10] = 0x80;  // NR10
    this.ioRegs[0x11] = 0xBF;  // NR11
    this.ioRegs[0x12] = 0xF3;  // NR12
    this.ioRegs[0x14] = 0xBF;  // NR14
    this.ioRegs[0x16] = 0x3F;  // NR21
    this.ioRegs[0x17] = 0x00;  // NR22
    this.ioRegs[0x19] = 0xBF;  // NR24
    this.ioRegs[0x1A] = 0x7F;  // NR30
    this.ioRegs[0x1B] = 0xFF;  // NR31
    this.ioRegs[0x1C] = 0x9F;  // NR32
    this.ioRegs[0x1E] = 0xBF;  // NR34
    this.ioRegs[0x20] = 0xFF;  // NR41
    this.ioRegs[0x21] = 0x00;  // NR42
    this.ioRegs[0x22] = 0x00;  // NR43
    this.ioRegs[0x23] = 0xBF;  // NR44
    this.ioRegs[0x24] = 0x77;  // NR50
    this.ioRegs[0x25] = 0xF3;  // NR51
    this.ioRegs[0x26] = 0xF1;  // NR52
    this.ioRegs[0x40] = 0x91;  // LCDC
    this.ioRegs[0x42] = 0x00;  // SCY
    this.ioRegs[0x43] = 0x00;  // SCX
    this.ioRegs[0x45] = 0x00;  // LYC
    this.ioRegs[0x47] = 0xFC;  // BGP
    this.ioRegs[0x48] = 0xFF;  // OBP0
    this.ioRegs[0x49] = 0xFF;  // OBP1
    this.ioRegs[0x4A] = 0x00;  // WY
    this.ioRegs[0x4B] = 0x00;  // WX
  }

  /**
   * Read 8-bit value from memory
   */
  public read8(address: number): number {
    address &= 0xFFFF;

    // ROM Bank 0 (0x0000-0x3FFF)
    if (address < 0x4000) {
      return this.rom[address] || 0xFF;
    }

    // ROM Bank 1-N (0x4000-0x7FFF)
    if (address < 0x8000) {
      const bankOffset = this.romBank * 0x4000;
      const index = bankOffset + (address - 0x4000);
      return this.rom[index] || 0xFF;
    }

    // VRAM (0x8000-0x9FFF)
    if (address < 0xA000) {
      return this.vram[address - 0x8000];
    }

    // External RAM (0xA000-0xBFFF)
    if (address < 0xC000) {
      if (!this.eramEnabled) return 0xFF;
      const bankOffset = this.eramBank * 0x2000;
      const index = bankOffset + (address - 0xA000);
      return this.eram[index];
    }

    // WRAM Bank 0 (0xC000-0xCFFF)
    if (address < 0xD000) {
      return this.wram[address - 0xC000];
    }

    // WRAM Bank 1 (0xD000-0xDFFF)
    if (address < 0xE000) {
      return this.wram[address - 0xC000];
    }

    // Echo RAM (0xE000-0xFDFF) - mirror of WRAM
    if (address < 0xFE00) {
      return this.wram[address - 0xE000];
    }

    // OAM (0xFE00-0xFE9F)
    if (address < 0xFEA0) {
      return this.oam[address - 0xFE00];
    }

    // Unusable (0xFEA0-0xFEFF)
    if (address < 0xFF00) {
      return 0xFF;
    }

    // I/O Registers (0xFF00-0xFF7F)
    if (address < 0xFF80) {
      const ioAddr = address - 0xFF00;
      
      // Check for custom read handler
      const handler = this.readHandlers.get(address);
      if (handler) {
        return handler();
      }

      return this.ioRegs[ioAddr];
    }

    // HRAM (0xFF80-0xFFFE)
    if (address < 0xFFFF) {
      return this.hram[address - 0xFF80];
    }

    // Interrupt Enable (0xFFFF)
    if (address === 0xFFFF) {
      return this.interruptEnable;
    }

    return 0xFF;
  }

  /**
   * Write 8-bit value to memory
   */
  public write8(address: number, value: number): void {
    address &= 0xFFFF;
    value &= 0xFF;

    // ROM Bank 0 (0x0000-0x3FFF) - MBC control
    if (address < 0x2000) {
      // RAM enable
      this.eramEnabled = (value & 0x0F) === 0x0A;
      return;
    }

    if (address < 0x4000) {
      // ROM bank select (lower 5 bits)
      const bank = value & 0x1F;
      this.romBank = bank === 0 ? 1 : bank;
      return;
    }

    // ROM Bank 1-N (0x4000-0x7FFF) - MBC control
    if (address < 0x6000) {
      // RAM bank select or ROM bank upper bits
      this.eramBank = value & 0x03;
      return;
    }

    if (address < 0x8000) {
      // Banking mode select (not implemented)
      return;
    }

    // VRAM (0x8000-0x9FFF)
    if (address < 0xA000) {
      this.vram[address - 0x8000] = value;
      return;
    }

    // External RAM (0xA000-0xBFFF)
    if (address < 0xC000) {
      if (!this.eramEnabled) return;
      const bankOffset = this.eramBank * 0x2000;
      const index = bankOffset + (address - 0xA000);
      this.eram[index] = value;
      return;
    }

    // WRAM Bank 0 (0xC000-0xCFFF)
    if (address < 0xD000) {
      this.wram[address - 0xC000] = value;
      return;
    }

    // WRAM Bank 1 (0xD000-0xDFFF)
    if (address < 0xE000) {
      this.wram[address - 0xC000] = value;
      return;
    }

    // Echo RAM (0xE000-0xFDFF) - mirror of WRAM
    if (address < 0xFE00) {
      this.wram[address - 0xE000] = value;
      return;
    }

    // OAM (0xFE00-0xFE9F)
    if (address < 0xFEA0) {
      this.oam[address - 0xFE00] = value;
      return;
    }

    // Unusable (0xFEA0-0xFEFF)
    if (address < 0xFF00) {
      return;
    }

    // I/O Registers (0xFF00-0xFF7F)
    if (address < 0xFF80) {
      const ioAddr = address - 0xFF00;

      // Check for custom write handler
      const handler = this.writeHandlers.get(address);
      if (handler) {
        handler(value);
        return;
      }

      // DMA transfer (0xFF46)
      if (address === 0xFF46) {
        this.performDMA(value);
      }

      this.ioRegs[ioAddr] = value;
      return;
    }

    // HRAM (0xFF80-0xFFFE)
    if (address < 0xFFFF) {
      this.hram[address - 0xFF80] = value;
      return;
    }

    // Interrupt Enable (0xFFFF)
    if (address === 0xFFFF) {
      this.interruptEnable = value;
      return;
    }
  }

  /**
   * Read 16-bit value (little-endian)
   */
  public read16(address: number): number {
    const low = this.read8(address);
    const high = this.read8(address + 1);
    return (high << 8) | low;
  }

  /**
   * Write 16-bit value (little-endian)
   */
  public write16(address: number, value: number): void {
    this.write8(address, value & 0xFF);
    this.write8(address + 1, (value >> 8) & 0xFF);
  }

  /**
   * Perform DMA transfer (copy 160 bytes to OAM)
   */
  private performDMA(value: number): void {
    const sourceBase = value << 8;
    for (let i = 0; i < 0xA0; i++) {
      this.oam[i] = this.read8(sourceBase + i);
    }
  }

  /**
   * Register custom read handler for memory-mapped I/O
   */
  public registerReadHandler(address: number, handler: () => number): void {
    this.readHandlers.set(address, handler);
  }

  /**
   * Register custom write handler for memory-mapped I/O
   */
  public registerWriteHandler(address: number, handler: (value: number) => void): void {
    this.writeHandlers.set(address, handler);
  }

  /**
   * Get direct access to VRAM (for PPU)
   */
  public getVRAM(): Uint8Array {
    return this.vram;
  }

  /**
   * Get direct access to OAM (for PPU)
   */
  public getOAM(): Uint8Array {
    return this.oam;
  }

  /**
   * Get direct access to I/O registers
   */
  public getIO(offset: number): number {
    return this.ioRegs[offset];
  }

  /**
   * Set I/O register directly
   */
  public setIO(offset: number, value: number): void {
    this.ioRegs[offset] = value & 0xFF;
  }
}
