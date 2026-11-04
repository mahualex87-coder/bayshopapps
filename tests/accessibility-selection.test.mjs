import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { darkColors, lightColors } from '../src/theme/palette.ts';

const require = createRequire(import.meta.url);
const root = new URL('../src/', import.meta.url);

function choiceComponent(colors) {
  const source = readFileSync(new URL('ui.tsx', root), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {};
  // The renderer uses the installed RN Web primitive, so a native-only checked
  // state cannot accidentally pass this regression. Other imports are unused
  // by Choice and do not require loading native Expo modules into Node.
  const load = name => name === 'react-native' ? require('react-native-web')
    : name === 'react' || name === 'react/jsx-runtime' ? require(name)
      : name === '@/theme/context' ? { useTheme: () => ({ colors }), useThemeStyles: factory => factory(colors) }
        : name === '@/i18n/context' ? { useI18n: () => ({ language: 'ro' }) } : {};
  new Function('require', 'exports', compiled)(load, exported);
  return exported.Choice;
}

function radios(html) {
  return [...html.matchAll(/<[^>]*role="radio"[^>]*>/g)].map(([tag]) => ({
    label: /aria-label="([^"]+)"/.exec(tag)?.[1],
    checked: /aria-checked="([^"]+)"/.exec(tag)?.[1],
  }));
}

test('shared choices expose both true and false checked state to the web accessibility tree', () => {
  for (const colors of [lightColors, darkColors]) {
    const Choice = choiceComponent(colors);
    const render = value => renderToStaticMarkup(React.createElement(Choice, { label: 'Currency', options: ['USD', 'RON'], value, onChange() {} }));
    const initial = render('USD');
    assert.match(initial, /role="radiogroup"/);
    assert.deepEqual(radios(initial), [{ label: 'Currency: USD', checked: 'true' }, { label: 'Currency: RON', checked: 'false' }]);
    assert.deepEqual(radios(render('RON')), [{ label: 'Currency: USD', checked: 'false' }, { label: 'Currency: RON', checked: 'true' }]);
  }
});

test('every checked selection control provides the cross-platform ARIA state', () => {
  const missing = [];
  let controls = 0;
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!entry.name.endsWith('.tsx')) continue;
      const source = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
          const state = attributes.find(attribute => attribute.name.getText(source) === 'accessibilityState');
          const expression = state?.initializer && ts.isJsxExpression(state.initializer) ? state.initializer.expression : null;
          if (expression && ts.isObjectLiteralExpression(expression) && expression.properties.some(property => property.name?.getText(source) === 'checked')) {
            controls++;
            if (!attributes.some(attribute => attribute.name.getText(source) === 'aria-checked')) missing.push(path.pathname + ':' + (source.getLineAndCharacterOfPosition(node.pos).line + 1));
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(root);
  assert.ok(controls >= 10, 'the audit covers shared, live, packing, checkout and legacy controls');
  assert.deepEqual(missing, []);
});
