const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const src = path.join(dist, 'index.html');
const dest = path.join(dist, '404.html');

try {
  fs.copyFileSync(src, dest);
  console.log('Copied index.html to 404.html for SPA routing');
} catch (e) {
  console.error('Failed to copy index.html to 404.html:', e);
  process.exit(1);
}
