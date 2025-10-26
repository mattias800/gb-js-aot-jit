#!/usr/bin/env node
/**
 * Build a Game Boy ROM to standalone JavaScript bundle
 */
import * as prettier from 'prettier';
import { writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { loadROM } from '../loader/ROMLoader';
import { AOTCompiler } from '../compiler/AOTCompiler';

const main = async (): Promise<void> => {
  const romPath = process.argv[2];
  const outputDir = process.argv[3] || './dist';
  
  if (!romPath) {
    console.error('Usage: npm run build-game <rom-file> [output-dir]');
    console.error('Example: npm run build-game tetris.gb ./dist/tetris');
    process.exit(1);
  }
  
  console.log(`🎮 Building Game Boy ROM to standalone JavaScript\n`);
  console.log(`Input: ${romPath}`);
  console.log(`Output: ${outputDir}\n`);
  
  // Load ROM
  console.log('Loading ROM...');
  const rom = loadROM(romPath);
  const romTitle = basename(romPath, '.gb');
  
  console.log(`Title: ${romTitle}`);
  console.log(`Size: ${rom.data.length.toLocaleString()} bytes\n`);
  
  // Compile
  console.log('Compiling...');
  const compiler = new AOTCompiler(rom);
  const jsCode = compiler.compile({
    romTitle,
    outputPath: outputDir,
  });
  
  // Create output directory
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch (e) {
    // Directory already exists
  }
  
  // Format and write JavaScript
  console.log('Formatting generated JavaScript with Prettier...');
  const jsPath = join(outputDir, 'game.js');
  try {
    const formattedJs = await prettier.format(jsCode, { parser: 'babel' });
    writeFileSync(jsPath, formattedJs);
  } catch (error) {
    console.warn('Failed to format JavaScript with Prettier:', error);
    console.warn('Writing unformatted code');
    writeFileSync(jsPath, jsCode);
  }
  console.log(`\n✅ Wrote ${jsPath}`);
  console.log(`   Size: ${(jsCode.length / 1024).toFixed(2)} KB`);
  
  // Write HTML
  const htmlPath = join(outputDir, 'index.html');
  const htmlContent = await generateHTML(romTitle);
  writeFileSync(htmlPath, htmlContent);
  console.log(`✅ Wrote ${htmlPath}`);
  
  // Write README
  const readmePath = join(outputDir, 'README.md');
  const readmeContent = generateREADME(romTitle);
  writeFileSync(readmePath, readmeContent);
  console.log(`✅ Wrote ${readmePath}`);
  
  console.log(`\n🎉 Build complete!`);
  console.log(`\nTo run:`);
  console.log(`  npm run serve-dist`);
  console.log(`  Open http://localhost:8000/${basename(outputDir)}\n`);
};

const generateHTML = async (title: string): Promise<string> => {
  const unformattedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Game Boy</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #1a1a1a;
      color: #fff;
      font-family: 'Courier New', monospace;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    
    .container {
      text-align: center;
    }
    
    h1 {
      margin-bottom: 10px;
      font-size: 24px;
      color: #4CAF50;
    }
    
    .subtitle {
      color: #888;
      font-size: 12px;
      margin-bottom: 20px;
    }
    
    .screen-container {
      display: inline-block;
      border: 8px solid #2a2a2a;
      border-radius: 4px;
      background: #0f380f;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    
    canvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      width: 640px;
      height: 576px;
      border: 2px solid #000;
    }
    
    .controls {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    
    button {
      background: #4CAF50;
      border: none;
      color: white;
      padding: 12px 24px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    button:hover:not(:disabled) {
      background: #45a049;
    }
    
    button:disabled {
      background: #555;
      cursor: not-allowed;
    }
    
    .info {
      margin-top: 20px;
      font-size: 12px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 ${title}</h1>
    <div class="subtitle">AOT Compiled Game Boy Emulator</div>
    
    <div class="screen-container">
      <canvas id="screen" width="160" height="144"></canvas>
    </div>
    
    <div class="controls">
      <button id="startBtn">Start</button>
      <button id="stopBtn" disabled>Stop</button>
      <button id="resetBtn">Reset</button>
    </div>
    
    <div class="info" id="info"></div>
  </div>
  
  <script src="game.js"></script>
  <script>
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const infoDiv = document.getElementById('info');
    
    // Initialize emulator
    const emulator = new GameBoyEmulator.Emulator();
    
    // Update info
    infoDiv.textContent = \`\${GameBoyEmulator.romTitle} - \${GameBoyEmulator.blocksCompiled} blocks compiled\`;
    
    let frameCount = 0;
    let lastFpsTime = Date.now();
    let fps = 0;
    
    function renderFrame() {
      const frameBuffer = emulator.ppu.getFrameBuffer();
      const imageData = new ImageData(frameBuffer, 160, 144);
      ctx.putImageData(imageData, 0, 0);
      
      frameCount++;
      const now = Date.now();
      if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        infoDiv.textContent = \`\${GameBoyEmulator.romTitle} - \${fps} FPS\`;
      }
    }
    
    function mainLoop() {
      if (!emulator.running) return;
      emulator.executeFrame();
      renderFrame();
      requestAnimationFrame(mainLoop);
    }
    
    startBtn.addEventListener('click', () => {
      emulator.start();
      startBtn.disabled = true;
      stopBtn.disabled = false;
      mainLoop();
    });
    
    stopBtn.addEventListener('click', () => {
      emulator.stop();
      stopBtn.disabled = true;
      startBtn.disabled = false;
    });
    
    resetBtn.addEventListener('click', () => {
      emulator.stop();
      emulator.reset();
      startBtn.disabled = false;
      stopBtn.disabled = true;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 160, 144);
    });
    
    // Render initial frame
    renderFrame();
  </script>
</body>
</html>
`;

  try {
    return await prettier.format(unformattedHtml, { parser: 'html' });
  } catch (error) {
    console.warn('Failed to format HTML with Prettier:', error);
    return unformattedHtml;
  }
};

const generateREADME = (title: string): string => {
  return `# ${title} - AOT Compiled Game Boy

This is a **statically compiled** version of the Game Boy game "${title}".

## What is this?

The original Game Boy ROM has been **ahead-of-time (AOT) compiled** to JavaScript. This means:

- ✅ No emulator needed - just open \`index.html\`
- ✅ All game code pre-compiled to optimized JavaScript
- ✅ Runs entirely in your browser
- ✅ No external dependencies
- ✅ Can be hosted on any static file server

## How to Run

### Option 1: Using npm (Recommended)

From the project root:

\`\`\`bash
npm run serve-dist
\`\`\`

Then open http://localhost:8000/${title}

### Option 2: Using npx

\`\`\`bash
cd ..
npx serve dist -l 8000
\`\`\`

Then open http://localhost:8000/${title}

### Option 3: Any Static Host

Upload these files to:
- GitHub Pages
- Netlify
- Vercel
- Amazon S3
- Any web server

Just serve the files and open \`index.html\`.

## Files

- **index.html** - Game interface
- **game.js** - Compiled game code (ROM + emulator)
- **README.md** - This file

## Technical Details

### Compilation Process

1. **Static Analysis** - Analyzed Game Boy ROM into basic blocks
2. **Transpilation** - Each block converted to optimized JavaScript
3. **Bundling** - Combined with minimal runtime (CPU, MMU, PPU)
4. **Output** - Single standalone JavaScript file

### What's Included

- Full Game Boy CPU emulation (all 512 opcodes)
- Graphics rendering (160x144 pixels, 4 shades)
- Memory management (ROM, VRAM, RAM, I/O)
- PPU (Picture Processing Unit)
- Compiled game code

### Performance

- Runs at ~60 FPS
- All ROM code pre-compiled (no JIT overhead)
- Optimized block execution

## Generated by

Game Boy Dynamic Recompiler
https://github.com/your-repo

---

Enjoy playing ${title}! 🎮
`;
};

main();
