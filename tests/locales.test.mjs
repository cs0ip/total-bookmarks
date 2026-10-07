import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as stores from 'svelte/store';

const preferenceKey = 'total-bookmarks:locale';
const dictionaries = Object.fromEntries(['en', 'ru', 'zh'].map((language) => [
  language, JSON.parse(readFileSync(new URL(`../src/locales/${language}.json`, import.meta.url), 'utf8'))
]));
const code = ts.transpileModule(readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

async function initialize(uiLanguage, saved, { legacy, pageStorageDisabled = false, extensionStorageDisabled = false, write } = {}) {
  const values = new Map(saved === undefined ? [] : [[preferenceKey, saved]]);
  const pageValues = new Map(legacy === undefined ? [] : [[preferenceKey, legacy]]);
  const document = { documentElement: { lang: '' } };
  const errors = [];
  const exports = {};
  runInNewContext(code, {
    exports, document, console: { error: (...args) => errors.push(args) },
    browser: {
      i18n: { getUILanguage: () => uiLanguage },
      storage: { local: {
        get: async (key) => { if (extensionStorageDisabled) throw new Error('Storage unavailable'); return { [key]: values.get(key) }; },
        set: async (data) => {
          if (extensionStorageDisabled) throw new Error('Storage unavailable');
          if (write) await write(data[preferenceKey]);
          for (const [key, value] of Object.entries(data)) values.set(key, value);
        }
      } }
    },
    localStorage: {
      getItem: (key) => { if (pageStorageDisabled) throw new Error('Page storage unavailable'); return pageValues.get(key) ?? null; },
      removeItem: (key) => pageValues.delete(key)
    },
    require: (name) => name === 'svelte/store' ? stores : { __esModule: true, default: dictionaries[name.match(/(en|ru|zh)\.json$/)[1]] }
  });
  await exports.initializeLocale();
  return { ...exports, document, values, pageValues, errors };
}

test('All languages have complete translations and matching interpolation parameters', () => {
  const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map(([value]) => value).sort();
  for (const dictionary of Object.values(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(dictionaries.en).sort());
    for (const key of Object.keys(dictionaries.en)) {
      assert.ok(dictionary[key].trim(), key);
      assert.deepEqual(placeholders(dictionary[key]), placeholders(dictionaries.en[key]), key);
    }
  }
});

test('Browser locale selects regional Russian and Chinese variants, with English fallback', async () => {
  for (const [language, expected] of [['ru-RU', 'ru'], ['RU', 'ru'], ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['zh_Hans', 'zh'], ['en-GB', 'en'], ['fr-FR', 'en'], ['', 'en']]) {
    const app = await initialize(language);
    assert.equal(stores.get(app.locale), expected, language);
    assert.equal(app.document.documentElement.lang, expected === 'zh' ? 'zh-Hans' : expected);
  }
});

test('Extension storage restores manual choice in a fresh session without page storage', async () => {
  const app = await initialize('en-US');
  await app.setLocale('ru');
  const restarted = await initialize('en-US', app.values.get(preferenceKey), { pageStorageDisabled: true });
  assert.equal(stores.get(restarted.locale), 'ru');
  assert.equal(stores.get(restarted.t)('help'), 'Управление');
  assert.equal(restarted.document.documentElement.lang, 'ru');
  assert.equal(stores.get((await initialize('ru-RU', 'invalid')).locale), 'ru');
});

test('Existing page-storage preference migrates once, while extension storage takes precedence', async () => {
  const migrated = await initialize('en-US', undefined, { legacy: 'zh' });
  assert.equal(stores.get(migrated.locale), 'zh');
  assert.equal(migrated.values.get(preferenceKey), 'zh');
  assert.equal(migrated.pageValues.has(preferenceKey), false);
  const app = await initialize('en-US', 'ru', { legacy: 'zh' });
  assert.equal(stores.get(app.locale), 'ru');
});

test('Rapid language changes persist in selection order', async () => {
  let release;
  const firstWrite = new Promise((resolve) => { release = resolve; });
  const writes = [];
  const app = await initialize('en-US', undefined, { write: async (language) => {
    if (language === 'ru') await firstWrite;
    writes.push(language);
  } });
  const first = app.setLocale('ru');
  const last = app.setLocale('zh');
  assert.equal(stores.get(app.t)('selectedCount', { count: 5 }), '已选：5');
  release();
  await Promise.all([first, last]);
  assert.deepEqual(writes, ['ru', 'zh']);
  assert.equal(app.values.get(preferenceKey), 'zh');
});

test('Storage failures are logged and leave the interface usable', async () => {
  const app = await initialize('ru-RU', undefined, { extensionStorageDisabled: true });
  assert.equal(stores.get(app.locale), 'ru');
  await app.setLocale('en');
  assert.equal(stores.get(app.t)('help'), 'Controls');
  assert.deepEqual(app.errors.map(([message]) => message), ['Failed to restore the language preference', 'Failed to save the language preference']);
});
