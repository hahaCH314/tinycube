const fs = require('fs');
const path = require('path');

const srcDir = 'E:/cmcube/assets/cmcube(1)';
const destDir = 'E:/cmcube/916cube/public/frames';
const framesTsPath = 'E:/cmcube/916cube/src/frames.ts';

const folders = fs.readdirSync(srcDir).filter(f => fs.statSync(path.join(srcDir, f)).isDirectory());

let newFrames = [];

  let counter = 0;
  for (const folder of folders) {
    const folderPath = path.join(srcDir, folder);
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png') || f.endsWith('.webp'));
    
    const mural = files.find(f => f.includes('mural'));
    const overlay = files.find(f => f.includes('overlay'));
    
    if (mural && overlay) {
      counter++;
      const idMatch = folder.match(/cmcube_(.+?)_themes/);
      const baseId = idMatch ? idMatch[1] : folder.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const id = baseId + '_' + Date.now().toString().slice(-4) + '_' + counter;
    
    const destMural = `${id}_mural${path.extname(mural)}`;
    const destOverlay = `${id}_overlay${path.extname(overlay)}`;
    
    fs.copyFileSync(path.join(folderPath, mural), path.join(destDir, destMural));
    fs.copyFileSync(path.join(folderPath, overlay), path.join(destDir, destOverlay));
    
    newFrames.push({
      id: id,
      name: folder,
      file: `./frames/${destOverlay}`,
      bgFile: `./frames/${destMural}`,
      anchor: 'full'
    });
  }
}

// Check root of cmcube(1) as well
const rootFiles = fs.readdirSync(srcDir).filter(f => !fs.statSync(path.join(srcDir, f)).isDirectory());
const rootMural = rootFiles.find(f => f.includes('mural'));
const rootOverlay = rootFiles.find(f => f.includes('overlay'));

if (rootMural && rootOverlay) {
  const id = 'ofuzake1_' + Date.now().toString().slice(-4);
  const destMural = `${id}_mural${path.extname(rootMural)}`;
  const destOverlay = `${id}_overlay${path.extname(rootOverlay)}`;
  fs.copyFileSync(path.join(srcDir, rootMural), path.join(destDir, destMural));
  fs.copyFileSync(path.join(srcDir, rootOverlay), path.join(destDir, destOverlay));
  newFrames.push({
    id: id, name: 'ofuzake', file: `./frames/${destOverlay}`, bgFile: `./frames/${destMural}`, anchor: 'full'
  });
}

if (newFrames.length > 0) {
  console.log(`Found ${newFrames.length} sandwich frames!`);
  let framesCode = "";
  for (const f of newFrames) {
    framesCode += `  { id: '${f.id}', name: '${f.name}', file: '${f.file}', bgFile: '${f.bgFile}', anchor: '${f.anchor}' },\n`;
  }
  
  let framesTs = fs.readFileSync(framesTsPath, 'utf8');
  framesTs = framesTs.replace('export const FRAMES: Frame[] = [', 'export const FRAMES: Frame[] = [\n' + framesCode);
  fs.writeFileSync(framesTsPath, framesTs);
  console.log("Automatically injected into src/frames.ts!");
} else {
  console.log("No sandwich frames found.");
}
