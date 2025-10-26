import { describe, it, expect } from 'vitest'
import { loadROM, getROMSizeInBytes, getRAMSizeInBytes, getCartridgeTypeName } from '../../src/loader/ROMLoader'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// Create a minimal valid ROM for testing
const createTestROM = (): Uint8Array => {
  const rom = new Uint8Array(32768) // 32KB minimum
  
  // Entry point: JP 0x0150
  rom[0x0100] = 0xC3
  rom[0x0101] = 0x50
  rom[0x0102] = 0x01
  rom[0x0103] = 0x00
  
  // Nintendo logo (required for valid checksum)
  const nintendoLogo = [
    0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
    0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
    0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E
  ]
  for (let i = 0; i < nintendoLogo.length; i++) {
    rom[0x0104 + i] = nintendoLogo[i]
  }
  
  // Title
  const title = 'TEST ROM'
  for (let i = 0; i < title.length; i++) {
    rom[0x0134 + i] = title.charCodeAt(i)
  }
  
  // CGB flag
  rom[0x0143] = 0x00
  
  // Cartridge type (0x00 = ROM ONLY)
  rom[0x0147] = 0x00
  
  // ROM size (0 = 32KB)
  rom[0x0148] = 0x00
  
  // RAM size (0 = None)
  rom[0x0149] = 0x00
  
  // Calculate and set header checksum
  let checksum = 0
  for (let i = 0x0134; i <= 0x014C; i++) {
    checksum = (checksum - rom[i] - 1) & 0xFF
  }
  rom[0x014D] = checksum
  
  // Global checksum (not validated by hardware, set to 0)
  rom[0x014E] = 0x00
  rom[0x014F] = 0x00
  
  // Some code at entry point
  rom[0x0150] = 0x00  // NOP
  rom[0x0151] = 0x76  // HALT
  
  return rom
}

describe('ROMLoader', () => {
  const testROMPath = join(process.cwd(), 'test-rom.gb')
  
  it('loads ROM and parses header', () => {
    const testROM = createTestROM()
    writeFileSync(testROMPath, testROM)
    
    const rom = loadROM(testROMPath)
    
    expect(rom.data).toBeInstanceOf(Uint8Array)
    expect(rom.data.length).toBeGreaterThan(0)
    expect(rom.header.title).toBe('TEST ROM')
    expect(rom.header.cartridgeType).toBe(0x00)
    expect(rom.isValid).toBe(true)
    
    // Clean up
    if (existsSync(testROMPath)) {
      const { unlinkSync } = require('fs')
      unlinkSync(testROMPath)
    }
  })
  
  it('validates header checksum correctly', () => {
    const testROM = createTestROM()
    writeFileSync(testROMPath, testROM)
    
    const rom = loadROM(testROMPath)
    expect(rom.isValid).toBe(true)
    
    // Clean up
    if (existsSync(testROMPath)) {
      const { unlinkSync } = require('fs')
      unlinkSync(testROMPath)
    }
  })
  
  it('detects invalid header checksum', () => {
    const testROM = createTestROM()
    testROM[0x014D] = 0xFF  // Set invalid checksum
    writeFileSync(testROMPath, testROM)
    
    const rom = loadROM(testROMPath)
    expect(rom.isValid).toBe(false)
    
    // Clean up
    if (existsSync(testROMPath)) {
      const { unlinkSync } = require('fs')
      unlinkSync(testROMPath)
    }
  })
  
  it('calculates ROM size correctly', () => {
    expect(getROMSizeInBytes(0)).toBe(32768)     // 32KB
    expect(getROMSizeInBytes(1)).toBe(65536)     // 64KB
    expect(getROMSizeInBytes(2)).toBe(131072)    // 128KB
    expect(getROMSizeInBytes(3)).toBe(262144)    // 256KB
  })
  
  it('calculates RAM size correctly', () => {
    expect(getRAMSizeInBytes(0)).toBe(0)         // None
    expect(getRAMSizeInBytes(1)).toBe(2048)      // 2KB
    expect(getRAMSizeInBytes(2)).toBe(8192)      // 8KB
    expect(getRAMSizeInBytes(3)).toBe(32768)     // 32KB
    expect(getRAMSizeInBytes(4)).toBe(131072)    // 128KB
    expect(getRAMSizeInBytes(5)).toBe(65536)     // 64KB
  })
  
  it('identifies cartridge types correctly', () => {
    expect(getCartridgeTypeName(0x00)).toBe('ROM ONLY')
    expect(getCartridgeTypeName(0x01)).toBe('MBC1')
    expect(getCartridgeTypeName(0x03)).toBe('MBC1+RAM+BATTERY')
    expect(getCartridgeTypeName(0xFF)).toContain('UNKNOWN')
  })
})
