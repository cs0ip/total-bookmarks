import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(path, target, browser, require = () => { throw new Error('Unexpected import'); }) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(code, { exports, __BROWSER_TARGET__: target, browser, require, URL, console });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const target of ['firefox', 'chrome']) {
  test(`${target}: subscribe only to supported bookmark change events`, () => {
    const commonEvents = ['created', 'removed', 'changed', 'moved'].map((name) => ({ name }));
    const reordered = { name: 'reordered' };
    const bookmarks = Object.fromEntries(['onCreated', 'onRemoved', 'onChanged', 'onMoved'].map((name, index) => [name, commonEvents[index]]));
    Object.defineProperty(bookmarks, 'onChildrenReordered', { get() {
      assert.equal(target, 'chrome', 'Firefox must not access the unsupported event');
      return reordered;
    } });
    const api = load('src/platform/bookmarks.ts', target, { bookmarks });
    assert.deepEqual(Array.from(api.getBookmarkChangeEvents()), target === 'chrome' ? [...commonEvents, reordered] : commonEvents);
  });
  test(`${target}: normalize a native tree and preserve protected folders and separators`, async () => {
    const tree = [{ id: 'root', title: '', children: [
      { id: 'bar', title: 'Bar', folderType: 'bookmarks-bar' },
      { id: 'empty', title: 'Empty' },
      { id: 'url', title: 'URL', url: 'https://example.test/' },
      { id: 'line', title: '', type: 'separator', url: 'data:separator' },
      { id: 'managed', title: 'Policy', unmodifiable: 'managed' }
    ] }];
    const api = load('src/platform/bookmarks.ts', target, { bookmarks: { getTree: async () => tree, getChildren: async () => tree[0].children } });
    const [root] = await api.getTree();
    assert.equal(root.type, 'folder');
    assert.equal(root.children[0].type, 'folder');
    assert.deepEqual(plain(root.children[1].children), []);
    assert.equal(root.children[2].type, 'bookmark');
    assert.equal(root.children[3].type, 'separator');
    assert.ok(api.isProtectedItem(root.children[0]));
    assert.ok(api.isProtectedItem(root.children[4]));
    assert.ok(!api.isProtectedItem(root.children[1]));
    assert.deepEqual(plain(await api.getChildren('root')), plain(root.children));
  });
  test(`${target}: create folders and bookmarks with the native API schema`, async () => {
    const calls = [];
    const api = load('src/platform/bookmarks.ts', target, { bookmarks: { create: async (details) => {
      calls.push(plain(details));
      return { id: 'new', ...details };
    } } });
    const folder = { parentId: 'bar', index: 2, type: 'folder', title: 'Folder' };
    assert.equal((await api.createBookmark(folder)).type, 'folder');
    const bookmark = { ...folder, type: 'bookmark', title: 'Site', url: 'https://example.test/' };
    assert.equal((await api.createBookmark(bookmark)).type, 'bookmark');
    for (let i = 0; i < 2; i++) {
      const expected = { ...[folder, bookmark][i] };
      if (target === 'chrome') delete expected.type;
      assert.deepEqual(calls[i], expected);
    }
    if (target === 'chrome') {
      await assert.rejects(api.createBookmark({ type: 'separator' }), /does not support/);
      assert.equal(calls.length, 2);
    }
  });
}

test('Chrome favicon URLs use the local cache and encode the complete bookmark URL', () => {
  const protocol = load('src/icons/protocol.ts');
  const api = load('src/platform/chrome/icons.ts', 'chrome', { runtime: { getURL: (path) => `chrome-extension://test/${path.replace(/^\//, '')}` } }, () => protocol);
  assert.deepEqual(plain(api.iconOrigins), []);
  assert.equal(api.defaultIcons.folder, 'chrome-extension://test/icons/folder.svg');
  const page = 'https://example.test/path?query=中文&other=1#part';
  let icon;
  assert.equal(typeof api.watchSiteIcon(page, (value) => { icon = value; }), 'function');
  const url = new URL(icon);
  assert.equal(url.pathname, '/_favicon/');
  assert.equal(url.searchParams.get('pageUrl'), page);
  assert.equal(url.searchParams.get('size'), '32');
  for (const invalid of ['invalid', 'javascript:alert(1)', 'file:///test', 'about:blank']) {
    api.watchSiteIcon(invalid, () => assert.fail('Unsupported URL requested an icon'));
  }
});

test('Both packages contain valid platform manifests, localized metadata, and icon assets', () => {
  for (const target of ['firefox', 'chrome']) {
    const dir = new URL(`../dist/${target}/`, import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir)));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, 'en');
    for (const path of Object.values(manifest.icons)) assert.ok(existsSync(new URL(path, dir)), path);
    for (const lang of ['en', 'ru', 'zh_CN']) assert.ok(existsSync(new URL(`_locales/${lang}/messages.json`, dir)));
    if (target === 'chrome') {
      assert.equal(manifest.minimum_chrome_version, '148');
      assert.deepEqual(manifest.permissions, ['bookmarks', 'storage', 'favicon']);
      assert.equal(manifest.host_permissions, undefined);
      assert.equal(manifest.browser_specific_settings, undefined);
      assert.equal(manifest.action.default_area, undefined);
      assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
      for (const [size, path] of Object.entries(manifest.icons)) {
        const png = readFileSync(new URL(path, dir));
        assert.equal(png.readUInt32BE(16), Number(size));
        assert.equal(png.readUInt32BE(20), Number(size));
      }
      const worker = readFileSync(new URL('background.js', dir), 'utf8');
      assert.doesNotMatch(worker, /DOMParser|FileReader|indexedDB|site-icons|chrome:\/\/global/);
    } else {
      assert.deepEqual(manifest.background.scripts, ['background.js']);
      assert.ok(manifest.browser_specific_settings.gecko.id);
      assert.ok(manifest.permissions.includes('alarms'));
      const html = readFileSync(new URL('index.html', dir), 'utf8');
      const main = html.match(/src="\.\/([^"]+\.js)"/)[1];
      assert.doesNotMatch(readFileSync(new URL(main, dir), 'utf8'), /onChildrenReordered/);
    }
  }
});

for (const target of ['firefox', 'chrome']) {
  test(`${target}: convert final move indices only for same-folder downward moves`, async () => {
    const calls = [];
    let reads = 0;
    const node = { id: 'item', parentId: 'source', index: 1, title: 'Item', url: 'https://example.test/' };
    const api = load('src/platform/bookmarks.ts', target, { bookmarks: {
      get: async () => { reads++; return [node]; },
      move: async (id, details) => { calls.push(plain(details)); return { ...node, ...details }; }
    } });
    await api.moveBookmark('item', { parentId: 'source', index: 2 });
    await api.moveBookmark('item', { parentId: 'source', index: 0 });
    await api.moveBookmark('item', { parentId: 'destination', index: 2 });
    await api.moveBookmark('item', { parentId: 'source', index: 1 });
    assert.deepEqual(calls, [
      { parentId: 'source', index: target === 'chrome' ? 3 : 2 },
      { parentId: 'source', index: 0 },
      { parentId: 'destination', index: 2 },
      { parentId: 'source', index: 1 }
    ]);
    assert.equal(reads, target === 'chrome' ? 4 : 0);
  });
}
