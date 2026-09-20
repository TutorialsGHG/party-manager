import fs from 'node:fs';
import path from 'node:path';

let errors = 0;

function checkClientFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const serverImportRegex = /from\s+['"][^'"]*(\$lib\/server|\/server\/)[^'"]*['"]/g;
  let match;
  while ((match = serverImportRegex.exec(content)) !== null) {
    console.error(`FAIL: Boundary violation in client file ${filePath}: importing server code "${match[0]}"`);
    errors++;
  }
}

function scanDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'server') continue; // skip server folder
      scanDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.svelte') || (!entry.name.includes('.server.') && /\.(ts|js)$/.test(entry.name)))) {
      // If it's inside routes and ends with +page.svelte or +layout.svelte
      // or inside src/lib/ui or src/lib/features/**/components
      const normalized = fullPath.replace(/\\/g, '/');
      if (
        normalized.includes('/src/lib/ui/') ||
        normalized.includes('/components/') ||
        normalized.endsWith('+page.svelte') ||
        normalized.endsWith('+layout.svelte')
      ) {
        checkClientFile(fullPath);
      }
    }
  }
}

scanDir('src/lib');
scanDir('src/routes');

if (errors > 0) {
  console.error(`check-boundaries failed with ${errors} violation(s).`);
  process.exit(1);
} else {
  console.log('ALL BOUNDARY CHECKS PASSED: Server modules strictly isolated.');
}