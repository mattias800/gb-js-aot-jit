import { MMU } from './MMU';

/**
 * Picture Processing Unit (PPU)
 * 
 * Renders graphics for the Game Boy LCD display.
 * Screen: 160x144 pixels, 4 shades of gray
 */
export class PPU {
  // LCD dimensions
  public static readonly SCREEN_WIDTH = 160;
  public static readonly SCREEN_HEIGHT = 144;
  
  // Frame buffer: RGBA format (160x144x4 bytes)
  private frameBuffer: Uint8ClampedArray;
  
  // PPU state
  private scanline: number = 0;
  private scanlineCycles: number = 0;
  private mode: number = 2; // OAM scan
  
  // LCD control flags (LCDC at 0xFF40)
  private lcdEnabled: boolean = true;
  private windowTileMap: number = 0x9800;
  private windowEnabled: boolean = false;
  private bgWindowTileData: number = 0x8000;
  private bgTileMap: number = 0x9800;
  private objSize: number = 8; // 8x8 or 8x16
  private objEnabled: boolean = false;
  private bgEnabled: boolean = true;
  
  // Scroll registers
  private scrollY: number = 0;
  private scrollX: number = 0;
  private windowY: number = 0;
  private windowX: number = 0;
  
  // Palettes (BGP, OBP0, OBP1)
  private bgPalette: number[] = [255, 192, 96, 0]; // White to black
  private objPalette0: number[] = [255, 192, 96, 0];
  private objPalette1: number[] = [255, 192, 96, 0];
  
  constructor(private mmu: MMU) {
    this.frameBuffer = new Uint8ClampedArray(PPU.SCREEN_WIDTH * PPU.SCREEN_HEIGHT * 4);
    
    // Initialize to white
    for (let i = 0; i < this.frameBuffer.length; i += 4) {
      this.frameBuffer[i] = 255;     // R
      this.frameBuffer[i + 1] = 255; // G
      this.frameBuffer[i + 2] = 255; // B
      this.frameBuffer[i + 3] = 255; // A
    }
    
    // Register I/O handlers for PPU registers
    this.setupIOHandlers();
  }
  
  /**
   * Step PPU by given number of cycles
   */
  public step(cycles: number): boolean {
    if (!this.lcdEnabled) return false;
    
    this.scanlineCycles += cycles;
    
    // One scanline = 456 dots (cycles)
    if (this.scanlineCycles >= 456) {
      this.scanlineCycles -= 456;
      this.scanline++;
      
      // Check LYC=LY coincidence
      const lyc = this.mmu.getIO(0x45);
      if (this.scanline === lyc) {
        const stat = this.mmu.getIO(0x41);
        this.mmu.setIO(0x41, stat | 0x04); // Set coincidence flag
      }
      
      if (this.scanline < 144) {
        // Visible scanlines - render
        this.renderScanline();
        this.mode = 2; // OAM scan for next line
      } else if (this.scanline === 144) {
        // Enter VBlank
        this.mode = 1;
        // Request VBlank interrupt
        const IF = this.mmu.getIO(0x0F);
        this.mmu.setIO(0x0F, IF | 0x01);
        return true; // Frame complete
      } else if (this.scanline > 153) {
        // Reset to line 0
        this.scanline = 0;
        this.mode = 2;
      }
    }
    
    return false;
  }
  
  /**
   * Render a single scanline
   */
  private renderScanline(): void {
    // Render background
    if (this.bgEnabled) {
      this.renderBackground();
    }
    
    // Render window (if enabled)
    if (this.windowEnabled && this.scanline >= this.windowY) {
      this.renderWindow();
    }
    
    // Render sprites (if enabled)
    if (this.objEnabled) {
      this.renderSprites();
    }
  }
  
  /**
   * Render background for current scanline
   */
  private renderBackground(): void {
    const y = (this.scanline + this.scrollY) & 0xFF;
    const tileRow = (y >> 3) & 31; // Which row of tiles (0-31)
    const tileY = y & 7;           // Which row of pixels in tile (0-7)
    
    for (let x = 0; x < PPU.SCREEN_WIDTH; x++) {
      const scrolledX = (x + this.scrollX) & 0xFF;
      const tileCol = (scrolledX >> 3) & 31; // Which column of tiles (0-31)
      const tileX = scrolledX & 7;           // Which column of pixels in tile (0-7)
      
      // Get tile number from tile map
      const tileMapAddr = this.bgTileMap + tileRow * 32 + tileCol;
      const tileNum = this.mmu.getVRAM()[tileMapAddr - 0x8000];
      
      // Get tile data address
      let tileDataAddr: number;
      if (this.bgWindowTileData === 0x8000) {
        // Unsigned addressing: 0x8000 + tileNum * 16
        tileDataAddr = 0x8000 + tileNum * 16;
      } else {
        // Signed addressing: 0x9000 + signed(tileNum) * 16
        const signed = tileNum < 128 ? tileNum : tileNum - 256;
        tileDataAddr = 0x9000 + signed * 16;
      }
      
      // Get pixel from tile data
      const line = tileY * 2; // Each line is 2 bytes
      const byte1 = this.mmu.getVRAM()[tileDataAddr - 0x8000 + line];
      const byte2 = this.mmu.getVRAM()[tileDataAddr - 0x8000 + line + 1];
      
      // Extract 2-bit color for this pixel
      const bit = 7 - tileX;
      const colorBit = ((byte2 >> bit) & 1) << 1 | ((byte1 >> bit) & 1);
      const color = this.bgPalette[colorBit];
      
      // Set pixel in frame buffer
      const offset = (this.scanline * PPU.SCREEN_WIDTH + x) * 4;
      this.frameBuffer[offset] = color;     // R
      this.frameBuffer[offset + 1] = color; // G
      this.frameBuffer[offset + 2] = color; // B
      this.frameBuffer[offset + 3] = 255;   // A
    }
  }
  
  /**
   * Render window for current scanline
   */
  private renderWindow(): void {
    // Window rendering similar to background
    // Simplified for now - full implementation would handle window position
  }
  
  /**
   * Render sprites for current scanline
   */
  private renderSprites(): void {
    const oam = this.mmu.getOAM();
    const spriteHeight = this.objSize;
    
    // Scan all 40 sprites
    for (let sprite = 0; sprite < 40; sprite++) {
      const oamAddr = sprite * 4;
      const spriteY = oam[oamAddr] - 16;
      const spriteX = oam[oamAddr + 1] - 8;
      const tileNum = oam[oamAddr + 2];
      const attributes = oam[oamAddr + 3];
      
      // Check if sprite is on this scanline
      if (this.scanline < spriteY || this.scanline >= spriteY + spriteHeight) {
        continue;
      }
      
      // Get sprite attributes
      const palette = (attributes & 0x10) ? this.objPalette1 : this.objPalette0;
      const xFlip = (attributes & 0x20) !== 0;
      const yFlip = (attributes & 0x40) !== 0;
      const priority = (attributes & 0x80) !== 0; // 0 = above BG, 1 = behind BG colors 1-3
      
      // Calculate tile line
      let tileLine = this.scanline - spriteY;
      if (yFlip) {
        tileLine = spriteHeight - 1 - tileLine;
      }
      
      // Get tile data
      const tileDataAddr = 0x8000 + tileNum * 16 + tileLine * 2;
      const byte1 = this.mmu.getVRAM()[tileDataAddr - 0x8000];
      const byte2 = this.mmu.getVRAM()[tileDataAddr - 0x8000 + 1];
      
      // Draw sprite pixels
      for (let x = 0; x < 8; x++) {
        const pixelX = spriteX + x;
        if (pixelX < 0 || pixelX >= PPU.SCREEN_WIDTH) continue;
        
        const bit = xFlip ? x : 7 - x;
        const colorBit = ((byte2 >> bit) & 1) << 1 | ((byte1 >> bit) & 1);
        
        // Color 0 is transparent for sprites
        if (colorBit === 0) continue;
        
        const color = palette[colorBit];
        
        // Set pixel (respecting priority)
        const offset = (this.scanline * PPU.SCREEN_WIDTH + pixelX) * 4;
        
        // Simple priority: if priority flag set and BG is not color 0, skip
        if (priority) {
          const bgColor = this.frameBuffer[offset];
          if (bgColor !== this.bgPalette[0]) continue;
        }
        
        this.frameBuffer[offset] = color;
        this.frameBuffer[offset + 1] = color;
        this.frameBuffer[offset + 2] = color;
        this.frameBuffer[offset + 3] = 255;
      }
    }
  }
  
  /**
   * Setup I/O register handlers
   */
  private setupIOHandlers(): void {
    // LCDC (0xFF40)
    this.mmu.registerReadHandler(0xFF40, () => {
      let value = 0;
      if (this.lcdEnabled) value |= 0x80;
      if (this.windowTileMap === 0x9C00) value |= 0x40;
      if (this.windowEnabled) value |= 0x20;
      if (this.bgWindowTileData === 0x8000) value |= 0x10;
      if (this.bgTileMap === 0x9C00) value |= 0x08;
      if (this.objSize === 16) value |= 0x04;
      if (this.objEnabled) value |= 0x02;
      if (this.bgEnabled) value |= 0x01;
      return value;
    });
    
    this.mmu.registerWriteHandler(0xFF40, (value) => {
      this.lcdEnabled = (value & 0x80) !== 0;
      this.windowTileMap = (value & 0x40) ? 0x9C00 : 0x9800;
      this.windowEnabled = (value & 0x20) !== 0;
      this.bgWindowTileData = (value & 0x10) ? 0x8000 : 0x8800;
      this.bgTileMap = (value & 0x08) ? 0x9C00 : 0x9800;
      this.objSize = (value & 0x04) ? 16 : 8;
      this.objEnabled = (value & 0x02) !== 0;
      this.bgEnabled = (value & 0x01) !== 0;
    });
    
    // Scroll registers
    this.mmu.registerReadHandler(0xFF42, () => this.scrollY);
    this.mmu.registerWriteHandler(0xFF42, (value) => { this.scrollY = value; });
    this.mmu.registerReadHandler(0xFF43, () => this.scrollX);
    this.mmu.registerWriteHandler(0xFF43, (value) => { this.scrollX = value; });
    
    // Window position
    this.mmu.registerReadHandler(0xFF4A, () => this.windowY);
    this.mmu.registerWriteHandler(0xFF4A, (value) => { this.windowY = value; });
    this.mmu.registerReadHandler(0xFF4B, () => this.windowX);
    this.mmu.registerWriteHandler(0xFF4B, (value) => { this.windowX = value; });
    
    // LY register (0xFF44) - read-only scanline position
    this.mmu.registerReadHandler(0xFF44, () => this.scanline);
    
    // Palettes
    this.mmu.registerReadHandler(0xFF47, () => this.encodePalette(this.bgPalette));
    this.mmu.registerWriteHandler(0xFF47, (value) => { this.bgPalette = this.decodePalette(value); });
    this.mmu.registerReadHandler(0xFF48, () => this.encodePalette(this.objPalette0));
    this.mmu.registerWriteHandler(0xFF48, (value) => { this.objPalette0 = this.decodePalette(value); });
    this.mmu.registerReadHandler(0xFF49, () => this.encodePalette(this.objPalette1));
    this.mmu.registerWriteHandler(0xFF49, (value) => { this.objPalette1 = this.decodePalette(value); });
  }
  
  /**
   * Decode palette byte to color array
   */
  private decodePalette(byte: number): number[] {
    const colors = [255, 192, 96, 0]; // White, light gray, dark gray, black
    return [
      colors[(byte >> 0) & 3],
      colors[(byte >> 2) & 3],
      colors[(byte >> 4) & 3],
      colors[(byte >> 6) & 3],
    ];
  }
  
  /**
   * Encode color array to palette byte
   */
  private encodePalette(palette: number[]): number {
    const colorToValue = (c: number) => {
      if (c >= 224) return 0; // White
      if (c >= 160) return 1; // Light gray
      if (c >= 64) return 2;  // Dark gray
      return 3;               // Black
    };
    
    return (colorToValue(palette[0]) << 0) |
           (colorToValue(palette[1]) << 2) |
           (colorToValue(palette[2]) << 4) |
           (colorToValue(palette[3]) << 6);
  }
  
  /**
   * Get frame buffer for rendering
   */
  public getFrameBuffer(): Uint8ClampedArray {
    return this.frameBuffer;
  }
  
  /**
   * Reset PPU state
   */
  public reset(): void {
    this.scanline = 0;
    this.scanlineCycles = 0;
    this.mode = 2;
    
    // Clear frame buffer
    for (let i = 0; i < this.frameBuffer.length; i += 4) {
      this.frameBuffer[i] = 255;
      this.frameBuffer[i + 1] = 255;
      this.frameBuffer[i + 2] = 255;
      this.frameBuffer[i + 3] = 255;
    }
  }
}
