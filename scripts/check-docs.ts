import fs from 'node:fs';
import path from 'node:path';

let errors = 0;

// 1. Check AGENTS.md length <= 150 lines
const agentsPath = 'AGENTS.md';
if (!fs.existsSync(agentsPath)) {
  console.error('FAIL: AGENTS.md does not exist');
  errors++;
} else {
  const lines = fs.readFileSync(agentsPath, 'utf8').split('\n').length;
  if (lines > 150) {
    console.error(`FAIL: AGENTS.md is too long (${lines} lines, max 150 permitted)`);
    errors++;
  } else {
    console.log(`OK: AGENTS.md is within limits (${lines}/150 lines)`);
  }
}

// 2. Check nested AGENTS.md existence
const requiredNested = [
  'src/lib/server/crypto/AGENTS.md',
  'src/lib/server/db/AGENTS.md',
  'src/lib/server/storage/AGENTS.md',
  'src/lib/ui/AGENTS.md',
  'src/lib/i18n/AGENTS.md',
  'tests/AGENTS.md'
];

for (const p of requiredNested) {
  if (!fs.existsSync(p)) {
    console.error(`FAIL: Missing nested AGENTS.md at ${p}`);
    errors++;
  } else {
    console.log(`OK: Nested AGENTS.md found at ${p}`);
  }
}

// 3. Check feature cards existence
const requiredFeatureCards = [
  'docs/features/auth.md',
  'docs/features/events.md',
  'docs/features/rsvp.md',
  'docs/features/polls.md',
  'docs/features/wall.md',
  'docs/features/gallery.md',
  'docs/features/admin.md'
];

for (const fc of requiredFeatureCards) {
  if (!fs.existsSync(fc)) {
    console.error(`FAIL: Missing feature card at ${fc}`);
    errors++;
  } else {
    console.log(`OK: Feature card found at ${fc}`);
  }
}

if (errors > 0) {
  console.error(`Check-docs failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log('ALL DOCS CHECKS PASSED.');
}