export async function runChromeTests() {
  const results = [];
  function assert(value, message) {
    if (!value) throw new Error(message);
    results.push(message);
  }
  async function until(check) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Chrome UI did not update: ${check}`);
  }
  const pane = (side) => document.querySelector(`[data-bookmark-pane="${side}"]`);
  const row = (side, title) => [...pane(side).querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.includes(title));
  const open = (side, title) => row(side, title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const selected = (side) => pane(side).querySelector('button[aria-pressed="true"]');
  const command = (title) => [...document.querySelectorAll('[aria-label="Команды"] button')].find((button) => button.getAttribute('aria-label') === title || button.textContent.trim() === title);
  function key(key, options = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    document.activeElement.dispatchEvent(event);
    return event;
  }
  async function focus(side, title) {
    row(side, title).click();
    await until(() => document.activeElement === row(side, title));
  }
  await until(() => pane(0) && selected(0));
  assert(browser.bookmarks === chrome.bookmarks, 'Chrome provides the shared browser namespace');
  assert(document.documentElement.lang === 'en', 'Chrome initially renders the English interface');
  document.querySelector('[data-language-button]').click();
  await until(() => document.querySelector('[role="menuitemradio"]'));
  [...document.querySelectorAll('[role="menuitemradio"]')].find((button) => button.textContent.includes('Русский')).click();
  await until(() => document.documentElement.lang === 'ru');
  await until(async () => (await browser.storage.local.get('total-bookmarks:locale'))['total-bookmarks:locale'] === 'ru');
  assert(true, 'Language switching updates the UI and persists the choice in Chrome storage');
  assert(!document.body.textContent.includes('Разрешить загрузку иконок'), 'Chrome does not request website access for favicons');
  assert(selected(0) && selected(1), 'Chrome root folders render with a focused row in each pane');
  assert(command('Закладку').disabled, 'The browser root cannot receive newly created items');
  const [root] = await browser.bookmarks.getTree();
  const toolbar = root.children.find((item) => item.folderType === 'bookmarks-bar') ?? root.children[0];
  const fixtures = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Chrome fixtures' });
  try {
    const left = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Chrome left' });
    const right = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Chrome right' });
    for (const title of ['A', 'B', 'C']) await browser.bookmarks.create({ parentId: left.id, title: `Chrome ${title}`, url: `https://example.test/${title}` });
    for (const side of [0, 1]) {
      await until(() => row(side, toolbar.title));
      open(side, toolbar.title);
      await until(() => row(side, fixtures.title));
      open(side, fixtures.title);
      await until(() => row(side, 'Chrome left'));
      open(side, side === 0 ? 'Chrome left' : 'Chrome right');
    }
    await until(() => row(0, 'Chrome C') && selected(1));
    assert(pane(1).querySelectorAll('button[aria-pressed]').length === 1, 'An empty Chrome folder remains navigable through the parent row');
    assert(!command('Закладку').disabled, 'Chrome folders permit creation even without native children/type properties');
    await focus(0, 'Chrome B');
    const icon = row(0, 'Chrome B').querySelector('img');
    await until(() => icon.complete && icon.naturalWidth > 0);
    assert(new URL(icon.src).pathname === '/_favicon/', 'Bookmark icons render through the Chrome favicon cache');
    assert(new URL(icon.src).searchParams.get('pageUrl') === 'https://example.test/B', 'Chrome favicon requests retain the full bookmark URL');
    key(' ', { code: 'Space' });
    await until(() => row(0, 'Chrome B').parentElement.querySelector('input').checked);
    assert(true, 'Space marks the focused Chrome bookmark');
    key('ArrowRight', { ctrlKey: true });
    await until(async () => (await browser.bookmarks.getChildren(right.id)).some((item) => item.title === 'Chrome B'));
    await until(() => row(1, 'Chrome B') && selected(0)?.textContent.includes('Chrome C'));
    assert(true, 'The shared move handler transfers marks to the other pane and preserves the nearest source focus');
    key('d', { code: 'KeyD', ctrlKey: true });
    await focus(0, 'Chrome A');
    key('ArrowDown', { ctrlKey: true });
    await until(async () => (await browser.bookmarks.getChildren(left.id))[1]?.title === 'Chrome A');
    assert(true, 'The shared reorder handler works with the Chrome bookmark API');
    await focus(0, 'Chrome A');
    key('f', { code: 'KeyF', ctrlKey: true, shiftKey: true });
    await until(() => document.querySelector('dialog[open]'));
    const input = document.querySelector('dialog input[name="title"]');
    input.value = 'Created Chrome folder';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('dialog form').requestSubmit();
    await until(() => !document.querySelector('dialog') && row(0, 'Created Chrome folder'));
    const children = await browser.bookmarks.getChildren(left.id);
    assert(children[children.findIndex((item) => item.title === 'Chrome A') + 1]?.title === 'Created Chrome folder', 'The folder dialog creates through the adapter and inserts after the focused Chrome row');
    command('Закладку').click();
    await until(() => document.querySelector('dialog[open]'));
    for (const [name, value] of [['title', 'Created Chrome bookmark'], ['url', 'https://example.test/new']]) {
      const input = document.querySelector(`dialog input[name="${name}"]`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('dialog form').requestSubmit();
    await until(() => !document.querySelector('dialog') && row(0, 'Created Chrome bookmark'));
    assert((await browser.bookmarks.getChildren(left.id)).some((item) => item.url === 'https://example.test/new'), 'The bookmark dialog creates a Chrome bookmark without Firefox-only API fields');
    key('a', { code: 'KeyA', ctrlKey: true });
    await until(() => pane(0).querySelectorAll('input:checked').length === 4);
    assert(true, 'Select all uses the shared handler in Chrome');
    key('d', { code: 'KeyD', ctrlKey: true });
    await until(() => pane(0).querySelectorAll('input:checked').length === 0);
    assert(true, 'Clear selection uses the shared handler in Chrome');
    await focus(0, 'Created Chrome bookmark');
    const originalConfirm = window.confirm;
    let confirmation;
    window.confirm = (message) => { confirmation = message; return true; };
    try {
      key('Delete');
      await until(() => !row(0, 'Created Chrome bookmark'));
      assert(confirmation.includes('1'), 'Chrome deletion asks for confirmation with the item count');
    } finally { window.confirm = originalConfirm; }
    key('Backspace');
    await until(() => row(0, 'Chrome left'));
    assert(true, 'Backspace navigates to the parent Chrome folder');
    assert(!document.querySelector('[role="alert"]'), 'Chrome commands complete without an error banner');
  } finally {
    await browser.bookmarks.removeTree(fixtures.id);
  }
  return results;
}
