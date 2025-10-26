import { readFileSync } from 'fs'

export interface ROMHeader {
  title: string
  cgbFlag: number
  cartridgeType: number
  romSize: number
  ramSize: number
  headerChecksum: number
  globalChecksum: number
}

export interface ROM {
  data: Uint8Array
  header: ROMHeader
  isValid: boolean
}

// Load ROM from file path (Node.js only)
export const loadROM = (filepath: string): ROM => {
  const data = new Uint8Array(readFileSync(filepath));
  const header = parseHeader(data);
  const isValid = validateHeaderChecksum(data, header);
  
  return { data, header, isValid };
};

// Load ROM from ArrayBuffer (Browser)
export const loadROMFromArrayBuffer = (arrayBuffer: ArrayBuffer): ROM => {
  const data = new Uint8Array(arrayBuffer);
  const header = parseHeader(data);
  const isValid = validateHeaderChecksum(data, header);
  
  return { data, header, isValid };
};

const parseHeader = (data: Uint8Array): ROMHeader => {
  // Title is at 0x0134-0x0143 (16 bytes, null-terminated)
  let title = ''
  for (let i = 0x0134; i < 0x0144; i++) {
    const byte = data[i]
    if (byte === 0) break
    title += String.fromCharCode(byte)
  }
  
  return {
    title: title.trim(),
    cgbFlag: data[0x0143],
    cartridgeType: data[0x0147],
    romSize: data[0x0148],
    ramSize: data[0x0149],
    headerChecksum: data[0x014D],
    globalChecksum: (data[0x014E] << 8) | data[0x014F],
  }
}

const validateHeaderChecksum = (data: Uint8Array, header: ROMHeader): boolean => {
  // Header checksum is calculated over 0x0134-0x014C
  let checksum = 0
  for (let i = 0x0134; i <= 0x014C; i++) {
    checksum = (checksum - data[i] - 1) & 0xFF
  }
  
  return checksum === header.headerChecksum
}

export const getROMSizeInBytes = (romSizeCode: number): number => {
  // ROM size code: 0 = 32KB, 1 = 64KB, 2 = 128KB, etc.
  return 32768 * (1 << romSizeCode)
}

export const getRAMSizeInBytes = (ramSizeCode: number): number => {
  switch (ramSizeCode) {
    case 0: return 0
    case 1: return 2048      // 2KB
    case 2: return 8192      // 8KB
    case 3: return 32768     // 32KB (4 banks of 8KB)
    case 4: return 131072    // 128KB (16 banks of 8KB)
    case 5: return 65536     // 64KB (8 banks of 8KB)
    default: return 0
  }
}

export const getCartridgeTypeName = (type: number): string => {
  const types: Record<number, string> = {
    0x00: 'ROM ONLY',
    0x01: 'MBC1',
    0x02: 'MBC1+RAM',
    0x03: 'MBC1+RAM+BATTERY',
    0x05: 'MBC2',
    0x06: 'MBC2+BATTERY',
    0x08: 'ROM+RAM',
    0x09: 'ROM+RAM+BATTERY',
    0x0B: 'MMM01',
    0x0C: 'MMM01+RAM',
    0x0D: 'MMM01+RAM+BATTERY',
    0x0F: 'MBC3+TIMER+BATTERY',
    0x10: 'MBC3+TIMER+RAM+BATTERY',
    0x11: 'MBC3',
    0x12: 'MBC3+RAM',
    0x13: 'MBC3+RAM+BATTERY',
    0x19: 'MBC5',
    0x1A: 'MBC5+RAM',
    0x1B: 'MBC5+RAM+BATTERY',
    0x1C: 'MBC5+RUMBLE',
    0x1D: 'MBC5+RUMBLE+RAM',
    0x1E: 'MBC5+RUMBLE+RAM+BATTERY',
  }
  
  return types[type] || `UNKNOWN (0x${type.toString(16).toUpperCase().padStart(2, '0')})`
}
