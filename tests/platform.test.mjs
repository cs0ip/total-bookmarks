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

test('URL display decodes every escape and retains malformed sequences', () => {
  const { readableUrl } = load('src/bookmarks/url.ts');
  for (const value of [
    'https://example.test/%D0%BC%D0%B8%D1%80%20%2F%3F%23%26%3D%25%252F?q=%E4%B8%AD%E6%96%87%2B%26#%F0%9F%98%80',
    'https://example.test/%D0%B0%09%0A%0D%C2%A0%E2%80%AE%EF%BB%BF'
  ]) assert.equal(readableUrl(value), decodeURIComponent(value));
  for (const malformed of ['https://example.test/%', 'https://example.test/%D0%ZZ', 'https://example.test/%FF', 'https://example.test/%E2%82']) {
    assert.equal(readableUrl(malformed), malformed);
  }
});

test('Editing and copying decoded URLs preserve the original meaning of reserved characters', () => {
  const { readableUrl, editUrl, escapedUrl, encodedUrlSelection } = load('src/bookmarks/url.ts');
  const encoded = 'https://example.test/%D0%BC%D0%B8%D1%80%20%2F%23%25%252F%09%0A%0D?q=%E4%B8%AD%E6%96%87%26x%3D1#%F0%9F%98%80';
  const display = readableUrl(encoded);
  assert.equal(editUrl(encoded, display, false), encoded);
  assert.equal(editUrl(encoded, display.replace('мир', 'привет'), false), encoded.replace(encodeURIComponent('мир'), encodeURIComponent('привет')));
  assert.equal(editUrl(encoded, encoded, true), encoded);
  assert.equal(encodedUrlSelection(encoded, 0, display.length, false), encoded);
  const start = display.indexOf('мир');
  assert.equal(encodedUrlSelection(encoded, start, start + 3, false), encodeURIComponent('мир'));
  assert.equal(encodedUrlSelection(encoded, display.length - 2, display.length, false), '%F0%9F%98%80');
  assert.equal(encodedUrlSelection(encoded, 0, encoded.length, true), encoded);
  assert.equal(editUrl('', 'https://example.test/новый путь/%2F', false), 'https://example.test/%D0%BD%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%BF%D1%83%D1%82%D1%8C/%252F');
  assert.equal(escapedUrl('http://[::1]/中文 %20%\n'), 'http://[::1]/%E4%B8%AD%E6%96%87%20%20%25%0A');
  const multiline = encoded + '%0D%0A%0D';
  const fieldText = readableUrl(multiline, true);
  assert.equal(fieldText, readableUrl(multiline).replace(/\r\n?/g, '\n'));
  assert.equal(editUrl(multiline, fieldText.replace('мир', 'Мир'), false, true), multiline.replace('%D0%BC', '%D0%9C'));
  assert.equal(encodedUrlSelection(multiline, 0, fieldText.length, false, true), multiline);
});

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
      assert.equal(api.supportsSeparators, false);
      await assert.rejects(api.createBookmark({ type: 'separator' }), /does not support/);
      assert.equal(calls.length, 2);
    } else {
      assert.equal(api.supportsSeparators, true);
      const separator = { parentId: 'bar', index: 1, type: 'separator' };
      assert.equal((await api.createBookmark(separator)).type, 'separator');
      assert.deepEqual(calls[2], separator);
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
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  for (const target of ['firefox', 'chrome']) {
    const dir = new URL(`../dist/${target}/`, import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir)));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, metadata.version);
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

function sorted(items, options = {}, ids = []) {
  const { planSort } = load('src/actions/sort.ts');
  const moves = planSort(items, { by: 'name', ignoreCase: true, separateFolders: true, foldersFirst: true, ...options }, 'en', ids);
  const result = [...items];
  for (const { id, index } of moves) {
    const oldIndex = result.findIndex((item) => item.id === id);
    assert.ok(oldIndex >= 0 && index >= 0 && index < result.length, 'Sorting moves existing items to valid positions');
    if (options.onlySelected) assert.ok(ids.includes(id), 'Sorting the selection moves only selected IDs');
    result.splice(index, 0, result.splice(oldIndex, 1)[0]);
  }
  assert.equal(planSort(result, { by: 'name', ignoreCase: true, separateFolders: true, foldersFirst: true, ...options }, 'en', ids).length, 0);
  return result.map((item) => item.id);
}

test('Name sorting preserves case-insensitive ties, supports case sensitivity and keeps separator slots', () => {
  const items = [
    { id: 'upper', title: 'ALPHA', type: 'bookmark' },
    { id: 'separator', title: '', type: 'separator' },
    { id: 'lower', title: 'alpha', type: 'bookmark' },
    { id: 'accent', title: 'álpha', type: 'bookmark' },
    { id: 'first', title: 'aardvark', type: 'bookmark' }
  ];
  assert.deepEqual(sorted(items), ['first', 'separator', 'upper', 'lower', 'accent']);
  assert.deepEqual(sorted(items, { ignoreCase: false }), ['first', 'separator', 'lower', 'upper', 'accent']);
  assert.deepEqual(sorted(items, { reverse: true }), ['accent', 'separator', 'upper', 'lower', 'first']);
  assert.deepEqual(sorted(items, { reverse: true, ignoreCase: false }), ['accent', 'separator', 'upper', 'lower', 'first']);
  assert.deepEqual(items.map((item) => item.id), ['upper', 'separator', 'lower', 'accent', 'first']);
});

test('Folders sort within their own group at either end, or together with bookmarks', () => {
  const items = [
    { id: 'z-folder', title: 'Zulu', type: 'folder' },
    { id: 'b-bookmark', title: 'Bravo', type: 'bookmark' },
    { id: 'a-folder', title: 'Alpha', type: 'folder' },
    { id: 'c-bookmark', title: 'Charlie', type: 'bookmark' }
  ];
  assert.deepEqual(sorted(items), ['a-folder', 'z-folder', 'b-bookmark', 'c-bookmark']);
  assert.deepEqual(sorted(items, { foldersFirst: false }), ['b-bookmark', 'c-bookmark', 'a-folder', 'z-folder']);
  assert.deepEqual(sorted(items, { separateFolders: false }), ['a-folder', 'b-bookmark', 'c-bookmark', 'z-folder']);
  assert.deepEqual(sorted(items, { reverse: true }), ['z-folder', 'a-folder', 'c-bookmark', 'b-bookmark']);
  assert.deepEqual(sorted(items, { reverse: true, foldersFirst: false }), ['c-bookmark', 'b-bookmark', 'z-folder', 'a-folder']);
  assert.deepEqual(sorted(items, { reverse: true, separateFolders: false }), ['z-folder', 'c-bookmark', 'b-bookmark', 'a-folder']);
});

test('URL and domain sorting preserve relative folder order regardless of folder grouping', () => {
  const items = [
    { id: 'z-folder', title: 'Zulu', type: 'folder' },
    { id: 'b-bookmark', title: 'Bravo', type: 'bookmark', url: 'https://z.example.test/' },
    { id: 'separator', title: '', type: 'separator' },
    { id: 'a-folder', title: 'Alpha', type: 'folder' },
    { id: 'a-bookmark', title: 'Alpha', type: 'bookmark', url: 'https://a.test/' }
  ];
  for (const by of ['url', 'domain']) {
    assert.deepEqual(sorted(items, { by }), ['z-folder', 'a-folder', 'separator', 'a-bookmark', 'b-bookmark']);
    assert.deepEqual(sorted(items, { by, reverse: true }), ['z-folder', 'a-folder', 'separator', 'b-bookmark', 'a-bookmark']);
    assert.deepEqual(sorted(items, { by, foldersFirst: false }), ['a-bookmark', 'b-bookmark', 'separator', 'z-folder', 'a-folder']);
    for (const foldersFirst of [true, false]) {
      assert.deepEqual(sorted(items, { by, separateFolders: false, foldersFirst }), ['a-bookmark', 'b-bookmark', 'separator', 'z-folder', 'a-folder']);
    }
    assert.deepEqual(sorted(items.filter((item) => item.type === 'folder'), { by }), ['z-folder', 'a-folder']);
  }
});

test('Sorting only selected items keeps unselected entries and separators in their slots', () => {
  const items = [
    { id: 'z-bookmark', title: 'Zulu', type: 'bookmark', dateAdded: 100, url: 'https://a.example.test/' },
    { id: 'fixed-folder', title: 'Fixed folder', type: 'folder' },
    { id: 'separator', title: '', type: 'separator' },
    { id: 'z-folder', title: 'Z folder', type: 'folder', dateAdded: 200 },
    { id: 'b-bookmark', title: 'Bravo', type: 'bookmark', dateAdded: 300, url: 'https://b.test/' },
    { id: 'fixed-bookmark', title: 'Fixed bookmark', type: 'bookmark', url: 'about:blank' },
    { id: 'a-folder', title: 'A folder', type: 'folder', dateAdded: 400 }
  ];
  const ids = ['a-folder', 'b-bookmark', 'z-folder', 'z-bookmark', 'separator'];
  const options = { onlySelected: true };
  assert.deepEqual(sorted(items, options, ids), ['a-folder', 'fixed-folder', 'separator', 'z-folder', 'b-bookmark', 'fixed-bookmark', 'z-bookmark']);
  assert.deepEqual(sorted(items, { ...options, reverse: true }, ids), ['z-folder', 'fixed-folder', 'separator', 'a-folder', 'z-bookmark', 'fixed-bookmark', 'b-bookmark']);
  assert.deepEqual(sorted(items, { ...options, foldersFirst: false }, ids), ['b-bookmark', 'fixed-folder', 'separator', 'z-bookmark', 'a-folder', 'fixed-bookmark', 'z-folder']);
  assert.deepEqual(sorted(items, { ...options, separateFolders: false }, ids), ['a-folder', 'fixed-folder', 'separator', 'b-bookmark', 'z-folder', 'fixed-bookmark', 'z-bookmark']);
  assert.deepEqual(sorted(items, { ...options, by: 'date', separateFolders: false, reverse: true }, ids), ['a-folder', 'fixed-folder', 'separator', 'b-bookmark', 'z-folder', 'fixed-bookmark', 'z-bookmark']);
  assert.deepEqual(sorted(items, { ...options, by: 'url' }, ids), ['z-folder', 'fixed-folder', 'separator', 'a-folder', 'z-bookmark', 'fixed-bookmark', 'b-bookmark']);
  assert.deepEqual(sorted(items, { ...options, by: 'domain' }, ids), ['z-folder', 'fixed-folder', 'separator', 'a-folder', 'b-bookmark', 'fixed-bookmark', 'z-bookmark']);
  for (const selection of [[], ['z-bookmark'], ['separator'], ['missing']]) {
    assert.deepEqual(sorted(items, options, selection), items.map((item) => item.id));
  }
  assert.deepEqual(sorted(items, { onlySelected: false }, []), sorted(items));
});

test('Grouping a sorted selection packs it from its first slot and keeps other items in order', () => {
  const items = [
    { id: 'prefix', title: 'Prefix', type: 'bookmark' },
    { id: 'z-bookmark', title: 'Zulu', type: 'bookmark', dateAdded: 100, url: 'https://a.example.test/' },
    { id: 'other-folder', title: 'Other folder', type: 'folder' },
    { id: 'separator', title: '', type: 'separator' },
    { id: 'z-folder', title: 'Z folder', type: 'folder', dateAdded: 200 },
    { id: 'b-bookmark', title: 'Bravo', type: 'bookmark', dateAdded: 300, url: 'https://b.test/' },
    { id: 'other-bookmark', title: 'Other bookmark', type: 'bookmark' },
    { id: 'a-folder', title: 'A folder', type: 'folder', dateAdded: 400 },
    { id: 'selected-separator', title: '', type: 'separator' },
    { id: 'suffix', title: 'Suffix', type: 'bookmark' }
  ];
  const ids = ['a-folder', 'b-bookmark', 'z-folder', 'z-bookmark', 'selected-separator'];
  const options = { onlySelected: true, groupSelected: true };
  const packed = (group) => ['prefix', ...group, 'selected-separator', 'other-folder', 'separator', 'other-bookmark', 'suffix'];
  assert.deepEqual(sorted(items, options, ids), packed(['a-folder', 'z-folder', 'b-bookmark', 'z-bookmark']));
  assert.deepEqual(sorted(items, { ...options, reverse: true }, ids), packed(['z-folder', 'a-folder', 'z-bookmark', 'b-bookmark']));
  assert.deepEqual(sorted(items, { ...options, foldersFirst: false }, ids), packed(['b-bookmark', 'z-bookmark', 'a-folder', 'z-folder']));
  assert.deepEqual(sorted(items, { ...options, separateFolders: false }, ids), packed(['a-folder', 'b-bookmark', 'z-folder', 'z-bookmark']));
  assert.deepEqual(sorted(items, { ...options, by: 'date', separateFolders: false, reverse: true }, ids), packed(['a-folder', 'b-bookmark', 'z-folder', 'z-bookmark']));
  assert.deepEqual(sorted(items, { ...options, by: 'url' }, ids), packed(['z-folder', 'a-folder', 'z-bookmark', 'b-bookmark']));
  assert.deepEqual(sorted(items, { ...options, by: 'domain' }, ids), packed(['z-folder', 'a-folder', 'b-bookmark', 'z-bookmark']));
  for (const selection of [[], ['z-bookmark'], ['selected-separator'], ['missing']]) {
    assert.deepEqual(sorted(items, options, selection), items.map((item) => item.id));
  }
  assert.deepEqual(sorted(items, options, ['separator', 'b-bookmark', 'a-folder']), ['prefix', 'z-bookmark', 'other-folder', 'separator', 'a-folder', 'b-bookmark', 'z-folder', 'other-bookmark', 'selected-separator', 'suffix']);
  assert.deepEqual(sorted(items, { groupSelected: true, onlySelected: false }, ids), sorted(items));
});

test('Date sorting uses creation time, keeps equal dates stable and places missing dates last', () => {
  const items = [
    { id: 'new', title: 'New', type: 'bookmark', dateAdded: 300 },
    { id: 'missing', title: 'Missing', type: 'folder' },
    { id: 'old1', title: 'Old', type: 'bookmark', dateAdded: 100 },
    { id: 'old2', title: 'Old', type: 'folder', dateAdded: 100 }
  ];
  assert.deepEqual(sorted(items, { by: 'date', separateFolders: false }), ['old1', 'old2', 'new', 'missing']);
  assert.deepEqual(sorted(items, { by: 'date', separateFolders: false, reverse: true }), ['new', 'old1', 'old2', 'missing']);
  assert.deepEqual(sorted(items, { by: 'date', reverse: true }), ['old2', 'missing', 'new', 'old1']);
});

test('URL sorting compares full addresses; domain sorting puts fewer hostname parts first', () => {
  const items = [
    { id: 'deep', title: '', type: 'bookmark', url: 'https://a.b.example.com/a' },
    { id: 'sub', title: '', type: 'bookmark', url: 'https://a.example.com/a' },
    { id: 'base-z', title: '', type: 'bookmark', url: 'https://example.com/z' },
    { id: 'base-a', title: '', type: 'bookmark', url: 'https://example.com/a' },
    { id: 'other', title: '', type: 'bookmark', url: 'https://b.test/a' },
    { id: 'invalid', title: '', type: 'bookmark', url: 'bad URL' },
    { id: 'local', title: '', type: 'bookmark', url: 'about:blank' }
  ];
  assert.deepEqual(sorted(items, { by: 'url' }), ['local', 'invalid', 'deep', 'sub', 'other', 'base-a', 'base-z']);
  assert.deepEqual(sorted(items, { by: 'domain' }), ['other', 'base-a', 'base-z', 'sub', 'deep', 'local', 'invalid']);
  assert.deepEqual(sorted(items, { by: 'url', reverse: true }), ['base-z', 'base-a', 'other', 'sub', 'deep', 'invalid', 'local']);
  assert.deepEqual(sorted(items, { by: 'domain', reverse: true }), ['deep', 'sub', 'base-z', 'base-a', 'other', 'invalid', 'local']);
  assert.deepEqual(sorted([], { by: 'domain' }), []);
});
