import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as selection from '../src/features/live/forms/attachment-selection.ts';
const { validatePickedFiles, mergePickedFiles } = selection;
const limits = { allowPdf: true, maxBytes: 100, maxFiles: 2, multiple: true };
const image = { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 20 };

test('document sources enforce matching type, file size and server counts atomically', () => {
  assert.deepEqual(validatePickedFiles([{ ...image, mimeType: 'application/octet-stream' }], limits), [image]);
  for (const [patch, key] of [[{ mimeType: 'application/pdf' }, 'attachment.invalidType'], [{ name: 'a.exe' }, 'attachment.invalidType'], [{ size: 101 }, 'attachment.tooLarge'], [{ size: undefined }, 'attachment.sizeUnknown'], [{ size: NaN }, 'attachment.sizeUnknown'], [{ size: 0 }, 'attachment.emptyFile']]) {
    assert.throws(() => validatePickedFiles([{ ...image, ...patch }], limits), e => e.key === key);
  }
  assert.throws(() => validatePickedFiles([{ ...image, name: 'a.pdf', mimeType: 'application/pdf' }], { ...limits, allowPdf: false }), e => e.key === 'attachment.invalidImageType');
  const before = [image];
  assert.throws(() => mergePickedFiles([{ ...image, uri: 'file:///b.jpg' }], before, 1, limits), e => e.key === 'attachment.tooMany');
  assert.deepEqual(before, [image]);
  assert.deepEqual(mergePickedFiles([image, image], before, 0, limits), [image]);
  assert.throws(() => mergePickedFiles([image, image], [], 0, { ...limits, multiple: false }), e => e.key === 'attachment.tooMany');
});

function harness({ permission = { granted: true, canAskAgain: true }, canceled = false, mime = 'image/jpeg', platform = 'ios' } = {}) {
  const calls = [];
  const result = () => canceled ? { canceled: true, assets: null } : { canceled: false, assets: [{ uri: 'file:///original', type: 'image', fileName: mime === 'image/heic' ? 'IMG.HEIC' : 'IMG.jpg', mimeType: mime, fileSize: 20 }] };
  const picker = { requestCameraPermissionsAsync: async () => { calls.push('permission'); return permission; }, launchCameraAsync: async options => { calls.push(['camera', options]); return result(); }, launchImageLibraryAsync: async options => { calls.push(['gallery', options]); return result(); }, UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' } };
  const imports = {
    'expo-document-picker': { getDocumentAsync: async options => { calls.push(['files', options]); return { canceled: false, assets: [{ ...image }] }; } },
    'expo-image-picker': picker,
    'expo-image-manipulator': { ImageManipulator: { manipulate: uri => { calls.push(['convert', uri]); return { renderAsync: async () => ({ saveAsync: async options => { calls.push(['save', options]); return { uri: 'file:///converted.jpg' }; }, release: () => calls.push('releaseImage') }), release: () => calls.push('releaseContext') }; } }, SaveFormat: { JPEG: 'jpeg' } },
    'expo-file-system': { File: class { constructor(uri) { this.size = uri.includes('converted') ? 42 : 20; } } },
    'react-native': { Platform: { OS: platform } },
    './attachment-selection': selection,
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/live/forms/pick-attachment.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in imports, key); return imports[key]; }, Date });
  return { calls, pick: (source, lim = limits) => exports.pickAttachment(source, lim, 2) };
}

test('camera requests access only on explicit camera selection; denial leaves alternatives usable', async () => {
  const h = harness({ permission: { granted: false, canAskAgain: false } });
  await assert.rejects(() => h.pick('camera'), e => e.key === 'attachment.cameraSettings');
  assert.deepEqual(h.calls, ['permission']);
  await h.pick('gallery');
  assert.equal(h.calls.filter(c => c === 'permission').length, 1);
  assert.equal(h.calls[1][0], 'gallery');
});

test('camera cancellation stages nothing and requests no conversion', async () => {
  const h = harness({ canceled: true });
  assert.equal(await h.pick('camera'), null);
  assert.deepEqual(h.calls.map(c => Array.isArray(c) ? c[0] : c), ['permission', 'camera']);
});

test('gallery converts HEIC bytes to JPEG and checks resulting size, without cropping or metadata request', async () => {
  const h = harness({ mime: 'image/heic' });
  const files = await h.pick('gallery');
  assert.equal(files[0].uri, 'file:///converted.jpg');
  assert.equal(files[0].mimeType, 'image/jpeg');
  assert.equal(files[0].name, 'IMG.jpg');
  assert.equal(files[0].size, 42);
  assert.equal(h.calls[0][1].allowsEditing, false);
  assert.equal(h.calls[0][1].exif, false);
  assert.deepEqual([...h.calls[0][1].mediaTypes], ['images']);
  assert.equal(h.calls[0][1].selectionLimit, 2);
  assert.deepEqual(h.calls.slice(-2), ['releaseImage', 'releaseContext']);
});

test('files keeps documents intact; reviews/customs images retain photo-only filtering', async () => {
  const h = harness();
  await h.pick('files', { ...limits, allowPdf: false, multiple: false });
  assert.equal(h.calls.length, 1);
  assert.deepEqual([...h.calls[0][1].type], ['image/jpeg', 'image/png']);
  assert.equal(h.calls[0][1].multiple, false);
  assert.equal(h.calls[0][1].copyToCacheDirectory, true);
});

function editorHarness() {
  const slots = [], effects = [], calls = [], changes = [];
  let cursor = 0, tree, finishPick;
  let props = { title: 'Documents', existing: [], staged: [], onStagedChange: files => changes.push(files), maxFiles: 2, maxBytes: 100 };
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
    useLayoutEffect(fn) { effects.push(fn); },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/theme/context': { useThemeStyles: fn => fn({}) },
    './pick-attachment': { pickAttachment: (source, ...args) => { calls.push([source, ...args]); return new Promise(resolve => { finishPick = resolve; }); } },
    './attachment-selection': selection,
    '@/features/media/DocumentViewer': { DocumentViewer: 'DocumentViewer' },
    'react-native': { Linking: {}, Pressable: 'Pressable', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
    '@/i18n/context': { useI18n: () => ({ t: k => k, countt: k => k, formatNumber: String }) },
    '@/ui': { Button: 'Button', Notice: 'Notice', minTouchTarget: 44, useUi: () => ({ s: {}, colors: {} }) },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/live/forms/AttachmentsEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: k => { assert(k in imports, k); return imports[k]; } });
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== 'object' ? [] : [node, ...walk(node.props?.children)];
  const render = update => { props = { ...props, ...update }; cursor = 0; tree = exports.AttachmentsEditor(props); while (effects.length) effects.shift()(); };
  const source = name => walk(tree).find(n => n.props.accessibilityLabel === `attachment.${name}`);
  render();
  return { render, source, all: () => walk(tree), calls, changes, resolve: async files => { finishPick(files); await Promise.resolve(); await Promise.resolve(); } };
}

test('all three actions are available, double taps open one picker, and disabled form drops late result', async () => {
  const h = editorHarness();
  for (const name of ['camera', 'gallery', 'files']) assert.equal(h.source(name).props.disabled, false);
  h.source('camera').props.onPress(); h.source('gallery').props.onPress();
  assert.equal(h.calls.length, 1);
  h.render({ disabled: true });
  await h.resolve([image]);
  assert.equal(h.changes.length, 0);
  h.render({ disabled: false });
  h.source('files').props.onPress();
  await h.resolve([image]);
  assert.equal(h.changes.length, 1);
});

test('read-only and full collections do not expose active upload controls', () => {
  const h = editorHarness();
  h.render({ staged: [image, { ...image, uri: 'file:///b.jpg' }] });
  assert.equal(h.source('camera').props.disabled, true);
  h.source('camera').props.onPress();
  assert.equal(h.calls.length, 0);
  h.render({ readOnly: true });
  for (const name of ['camera', 'gallery', 'files']) assert.equal(h.source(name), undefined);
});


test('switching attachments to read-only disables staged removal and hides existing deletion', () => {
  const h = editorHarness(); let deletes = 0;
  h.render({ existing: [{ id: '1', url: 'https://example.test/a.jpg' }], staged: [image], readOnly: true, onExistingChange: () => deletes++ });
  const remove = h.all().filter(n => n.props.accessibilityLabel === 'attachment.remove');
  assert.equal(remove.length, 1);
  assert.equal(remove[0].props.disabled, true);
  remove[0].props.onPress();
  assert.equal(deletes, 0);
  assert.equal(h.changes.length, 0);
});
