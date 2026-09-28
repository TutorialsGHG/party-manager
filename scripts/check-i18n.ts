import fs from 'node:fs';

function readJson(path: string) {
	const content = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
	return JSON.parse(content);
}

const de = readJson('src/lib/i18n/de.json');
const en = readJson('src/lib/i18n/en.json');

let errors = 0;

function compareKeys(
	obj1: Record<string, any>,
	obj2: Record<string, any>,
	prefix = '',
	name1 = 'de',
	name2 = 'en'
) {
	for (const key of Object.keys(obj1)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (!(key in obj2)) {
			console.error(`FAIL: Key "${fullKey}" exists in ${name1} but is missing in ${name2}`);
			errors++;
		} else if (typeof obj1[key] === 'object' && obj1[key] !== null) {
			if (typeof obj2[key] !== 'object' || obj2[key] === null) {
				console.error(`FAIL: Type mismatch at "${fullKey}"`);
				errors++;
			} else {
				compareKeys(obj1[key], obj2[key], fullKey, name1, name2);
			}
		} else if (typeof obj1[key] === 'string' && obj1[key].trim() === '') {
			console.error(`FAIL: Empty value at "${fullKey}" in ${name1}`);
			errors++;
		}
	}
}

compareKeys(de, en, '', 'de', 'en');
compareKeys(en, de, '', 'en', 'de');

if (errors > 0) {
	console.error(`check-i18n failed with ${errors} mismatch(es).`);
	process.exit(1);
} else {
	console.log('ALL I18N CHECKS PASSED: de.json and en.json are in 100% parity.');
}
