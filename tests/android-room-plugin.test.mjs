import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-workmanager-room.cjs');
const applyRules = plugin.applyWorkManagerRoomRules;
const begin = '# @generated begin bayshop-workmanager-room-reflection';
const end = '# @generated end bayshop-workmanager-room-reflection';

test('Android mod preserves other rules and retains the reflectively instantiated database constructor', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bayshop-room-plugin-'));
  try {
    const android = path.join(root, 'android');
    const file = path.join(android, 'app', 'proguard-rules.pro');
    await mkdir(path.dirname(file), { recursive: true });
    const original = '# Existing application policy\n-keep class com.example.Custom { public <init>(); }\n';
    await writeFile(file, original);
    const config = plugin({ name: 'Test', slug: 'test', ios: { bundleIdentifier: 'example.unchanged' } });
    assert.deepEqual(Object.keys(config.mods), ['android']);
    assert.deepEqual(Object.keys(config.mods.android), ['dangerous']);
    const mod = config.mods.android.dangerous;
    const request = { projectRoot: root, platformProjectRoot: android, platform: 'android', modName: 'dangerous' };
    const result = await mod({ ...config, modRequest: request });
    assert.deepEqual(result.ios, { bundleIdentifier: 'example.unchanged' });
    const once = await readFile(file, 'utf8');
    assert.ok(once.startsWith(original));
    assert.match(once, /-keep class androidx\.work\.impl\.WorkDatabase \{\s+<init>\(\);\s+\}/);
    assert.match(once, /-keep class androidx\.work\.impl\.WorkDatabase_Impl \{\s+public <init>\(\);\s+\}/);
    assert.doesNotMatch(once, /-dont(?:shrink|optimize|obfuscate)|android\.enableR8|-keep class \*|\{\s*\*;/);
    assert.equal(plugin(config).mods.android.dangerous, mod, 'registering twice does not wrap the mod again');
    await mod({ ...config, modRequest: request });
    const fresh = plugin({ name: 'Test', slug: 'test' });
    await fresh.mods.android.dangerous({ ...fresh, modRequest: request });
    assert.equal(await readFile(file, 'utf8'), once, 'repeated prebuilds are byte-identical');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rule replacement preserves unrelated suffix and CRLF without accumulating generated blocks', () => {
  const source = `# before\r\n${begin}\r\n# outdated generated rule\r\n${end}\r\n# after\r\n`;
  const result = applyRules(source);
  assert.ok(result.startsWith('# before\r\n'));
  assert.ok(result.endsWith('\r\n# after\r\n'));
  assert.ok(!result.includes('outdated'));
  assert.equal(result.split(begin).length, 2);
  assert.doesNotMatch(result, /(?<!\r)\n/);
  assert.equal(applyRules(result), result);
});

test('malformed or duplicate managed blocks stop instead of discarding unrelated rules', () => {
  for (const input of [begin, end, `${end}\n${begin}`, `${begin}\n${end}\n${begin}\n${end}`]) {
    assert.throws(() => applyRules(input), /Malformed BayShop WorkManager ProGuard block/);
  }
});
