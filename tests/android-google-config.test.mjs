import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import ignore from 'ignore';

test('config exposes only explicitly supplied Android Web audience and leaves iOS/settings intact', t => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'bayshop-google-config-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const exports = {}; const env = {};
  const code = ts.transpileModule(readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process: { env }, require: createRequire(new URL('../app.config.ts', import.meta.url)) });
  const input = { projectRoot, config: { name: 'Synthetic', slug: 'synthetic', ios: { bundleIdentifier: 'com.example.ios' }, android: { package: 'com.example.android', blockedPermissions: ['WRITE_SETTINGS'] } } };
  assert.equal(exports.default(input).extra.nativeSocial.googleAndroidWebClientId, null);
  env.BAYSHOP_GOOGLE_OAUTH_ANDROID_WEB_CLIENT_ID = 'synthetic-web.apps.googleusercontent.com';
  const config = exports.default(input); assert.equal(config.extra.nativeSocial.googleAndroidWebClientId, env.BAYSHOP_GOOGLE_OAUTH_ANDROID_WEB_CLIENT_ID); assert.equal(config.ios.bundleIdentifier, 'com.example.ios'); assert.deepEqual(config.android.blockedPermissions, ['WRITE_SETTINGS']);
  env.BAYSHOP_GOOGLE_OAUTH_ANDROID_WEB_CLIENT_ID = 'not-a-client'; assert.throws(() => exports.default(input));
});
test('EAS includes only local module source while excluding generated app projects and credentials', () => {
  const filter = ignore().add(readFileSync(new URL('../.easignore', import.meta.url), 'utf8'));
  for (const path of ['modules/bayshop-google-auth/android/build.gradle', 'modules/bayshop-google-auth/android/src/main/AndroidManifest.xml', 'modules/bayshop-google-auth/android/src/main/java/com/bayshop/googleauth/BayShopGoogleAuthModule.kt']) assert.equal(filter.ignores(path), false, path);
  for (const path of ['android/build.gradle', 'android/app/src/main/MainActivity.kt', '.env.local', 'private.key', 'modules/bayshop-google-auth/android/secret.jks']) assert.equal(filter.ignores(path), true, path);
});
