import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

try {
  const shibuyaCss = fs.readFileSync('e:/cmcube/916cube/docs/tinycube-skin-shibuya.css', 'utf8');
  const oldAppCss = fs.readFileSync('e:/cmcube/916cube/src/App.css', 'utf8');
  if (!oldAppCss.includes('渋谷デコラティブストリートカルチャー')) {
    const lines = oldAppCss.split('\n');
    const startIndex = lines.findIndex(line => line.includes('.setup-screen') || line.includes('.hand-setting'));
    if (startIndex !== -1) {
      const setupCss = lines.slice(startIndex).join('\n');
      const combined = shibuyaCss + '\n\n/* SETUP SCREEN STYLES PRESERVED */\n' + setupCss;
      fs.writeFileSync('e:/cmcube/916cube/src/App.css', combined);
      console.log('App.css updated successfully by vite.config.ts!');
    }
  }
} catch (e) {
  console.error(e);
}

try {
  require('./import_sandwiches.js');
} catch (e) {
  console.error(e);
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
