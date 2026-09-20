import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_DOMAINS = [
  'googleapis.com',
  'gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'tile.openstreetmap.org',
  'google-analytics.com',
  'googletagmanager.com',
  'segment.io',
  'hotjar.com'
];

let errors = 0;

function scanDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && /\.(svelte|ts|js|html|css|json)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const domain of FORBIDDEN_DOMAINS) {
        if (content.includes(domain)) {
          console.error(`FAIL: Forbidden external domain "${domain}" found in ${fullPath}`);
          errors++;
        }
      }
    }
  }
}

scanDir('src');
scanDir('static');

if (errors > 0) {
  console.error(`check-no-external failed with ${errors} violation(s).`);
  process.exit(1);
} else {
  console.log('ALL NO-EXTERNAL CHECKS PASSED: No third-party CDNs or trackers found.');
}