import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy manifest to dist
const manifestSrc = path.resolve(__dirname, '../public/manifest.json');
const manifestDest = path.resolve(__dirname, '../dist/manifest.json');

if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, manifestDest);
  console.log('✓ Copied manifest.json to dist/');
} else {
  console.error('✗ manifest.json not found in public/');
  process.exit(1);
}

// Copy icons if they exist
const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png'];
iconFiles.forEach(icon => {
  const iconSrc = path.resolve(__dirname, `../public/${icon}`);
  const iconDest = path.resolve(__dirname, `../dist/${icon}`);
  
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDest);
    console.log(`✓ Copied ${icon} to dist/`);
  }
});

// Copy MediaPipe WASM files to dist/wasm
const wasmSourceDir = path.resolve(__dirname, '../node_modules/@mediapipe/tasks-text/wasm');
const wasmDestDir = path.resolve(__dirname, '../dist/wasm');

if (fs.existsSync(wasmSourceDir)) {
  if (!fs.existsSync(wasmDestDir)) {
    fs.mkdirSync(wasmDestDir, { recursive: true });
  }
  
  const wasmFiles = fs.readdirSync(wasmSourceDir);
  wasmFiles.forEach(file => {
    const src = path.join(wasmSourceDir, file);
    const dest = path.join(wasmDestDir, file);
    fs.copyFileSync(src, dest);
  });
  console.log('✓ Copied MediaPipe WASM files to dist/wasm/');
}

console.log('✓ Extension build complete!');

