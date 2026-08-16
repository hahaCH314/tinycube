import fs from 'fs';
import path from 'path';

const src = 'C:\\Users\\syunp\\.gemini\\antigravity-ide\\brain\\800d0c40-7833-43a5-b430-425d93a39b4a\\tinycube_feature_graphic_1786762096683.jpg';
const dest = 'E:\\cmcube\\916cube\\public\\feature-graphic.jpg';

try {
  fs.copyFileSync(src, dest);
  console.log('Successfully copied to:', dest);
} catch (err) {
  console.error('Copy error:', err);
}
