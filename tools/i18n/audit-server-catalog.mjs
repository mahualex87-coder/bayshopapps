/** Offline whitelist/coverage preparation. It never requests the server or
 * exports the complete languagesContent table. Optional input is a local
 * language-code -> source-hash -> translated-string map obtained by the owner. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { catalog } from '../../src/i18n/catalog.ts';

const [auditPath, outputPath, dictionaryPath] = process.argv.slice(2);
if (!auditPath || !outputPath) throw Error('Usage: audit-server-catalog.mjs server-languages.json output-directory [approved-server-translations.json]');
const audit = JSON.parse(await readFile(resolve(auditPath), 'utf8'));
const server = dictionaryPath ? JSON.parse(await readFile(resolve(dictionaryPath), 'utf8')) : null;
const placeholders = text => [...new Set(Array.from(text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g), match => match[1]))].sort();
const messages = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => {
  const source = entry.en.trim();
  return [key, { source, sourceHash: createHash('md5').update(source).digest('hex'), placeholders: placeholders(source) }];
}));
const revision = createHash('sha256').update(JSON.stringify(messages)).digest('hex');
const manifest = { version: 1, revision, hashAlgorithm: 'md5(trim(English source)) — existing BayShop languagesContent contract', messages };
const coverage = audit.languages.filter(item => item.active).map(language => {
  const bundled = Object.keys(messages).filter(key => typeof catalog[key][language.code] === 'string' && catalog[key][language.code].trim()).length;
  const dictionary = server?.[language.code];
  const missingKeys = [], invalidPlaceholderKeys = [];
  let exactServerMatches = 0;
  if (dictionary) for (const [key, entry] of Object.entries(messages)) {
    const translated = dictionary[entry.sourceHash];
    if (typeof translated !== 'string' || !translated.trim()) missingKeys.push(key);
    else if (JSON.stringify(placeholders(translated)) !== JSON.stringify(entry.placeholders)) invalidPlaceholderKeys.push(key);
    else exactServerMatches++;
  }
  return { code:language.code, serverId:language.id, bundledKeys:bundled, totalKeys:Object.keys(messages).length, serverCoverageMeasured:!!dictionary, exactServerMatches:dictionary ? exactServerMatches : null, missingKeys:dictionary ? missingKeys : null, invalidPlaceholderKeys:dictionary ? invalidPlaceholderKeys : null, supportedByCurrentApp:['ro','ru','en'].includes(language.code) };
});
await mkdir(resolve(outputPath), { recursive:true });
await writeFile(resolve(outputPath, 'mobile-source-manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
await writeFile(resolve(outputPath, 'language-coverage.json'), JSON.stringify({ source:audit.source, revision, totalKeys:Object.keys(messages).length, activeServerLanguages:coverage.length, serverDictionaryProvided:!!server, note:'Exact source-hash matches are candidates for review, not proof of translation quality. No unlisted server strings are exported.', languages:coverage }, null, 2)+'\n');
console.log(JSON.stringify({ totalKeys:Object.keys(messages).length, activeServerLanguages:coverage.length, bundledLanguages:coverage.filter(item=>item.bundledKeys===item.totalKeys).map(item=>item.code), serverDictionaryProvided:!!server }));
