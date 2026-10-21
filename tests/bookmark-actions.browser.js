// Both panes start in fixtures. Firefox also exercises native separators.
export async function runBookmarkActionTests({ fixtures, left, right, until, separators = false }) {
  const results = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
    results.push(message);
  };
  const command = (title) => document.querySelector(`[aria-label="Команды"] button[aria-label="${title}"]`);
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.querySelector('.font-semibold')?.textContent.trim() === title);
  const checkbox = (pane, title) => row(pane, title)?.parentElement.querySelector('input');
  const parentRow = (pane) => pane.querySelector('button[aria-label="На уровень выше"]');
  const ids = (pane) => [...pane.querySelectorAll('[data-bookmark-row]')].map((node) => node.dataset.bookmarkId).filter((id) => id !== '..');
  const matches = (pane, expected) => JSON.stringify(ids(pane)) === JSON.stringify(expected);
  const menu = () => document.querySelector('#actions-menu');
  const action = () => menu()?.querySelector('[role="menuitem"]');
  async function showMenu() {
    command('Действия').click();
    await until(() => menu()?.contains(document.activeElement));
  }
  async function perform() {
    await showMenu();
    assert(action().textContent.trim() === 'Переместить папки вверх' && !action().disabled, 'The actions menu offers folder grouping for the active mixed folder');
    action().click();
  }
  async function focus(pane, title) {
    row(pane, title).focus();
    await until(() => document.activeElement === row(pane, title));
  }
  function escape() {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
  const source = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Grouping source' });
  const target = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Grouping target' });
  const items = [];
  for (const [title, kind] of [['Folder Z', 'folder'], ['Action one', 'bookmark'], ['Folder B', 'folder'], ...(separators ? [['', 'separator']] : []), ['Action two', 'bookmark'], ['Folder A', 'folder'], ['Action three', 'bookmark']]) {
    items.push(await browser.bookmarks.create({ parentId: source.id, ...(kind === 'separator' ? { type: 'separator' } : { title }), ...(kind === 'bookmark' ? { url: 'https://example.test/' } : {}) }));
  }
  const folders = items.filter((item) => item.title.startsWith('Folder'));
  const desired = [...folders, ...items.filter((item) => !folders.includes(item))].map((item) => item.id);
  const nested = await browser.bookmarks.create({ parentId: folders[1].id, title: 'Action nested', url: 'https://example.test/nested' });
  const otherBookmark = await browser.bookmarks.create({ parentId: target.id, title: 'Other bookmark', url: 'https://example.test/other' });
  const otherFolder = await browser.bookmarks.create({ parentId: target.id, title: 'Other folder' });
  const originalMove = browser.bookmarks.move;
  let release = () => {};
  try {
    await until(() => row(left, source.title) && row(right, source.title));
    for (const pane of [left, right]) row(pane, source.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(left, 'Action three') && row(right, 'Action three'));
    checkbox(left, 'Action one').click();
    checkbox(left, 'Folder B').click();
    checkbox(right, 'Folder A').click();
    await focus(right, 'Action two');
    await focus(left, 'Action three');
    let held = false;
    let calls = 0;
    const gate = new Promise((resolve) => { release = resolve; });
    browser.bookmarks.move = async (id, destination) => {
      calls++;
      assert(folders.some((folder) => folder.id === id) && destination.parentId === source.id, 'Grouping moves only folders within their current parent');
      const result = await originalMove(id, destination);
      if (!held) { held = true; await gate; }
      return result;
    };
    await perform();
    await until(() => held);
    assert(matches(left, items.map((item) => item.id)) && !menu() && [...document.querySelectorAll('[aria-label="Команды"] button')].every((button) => button.disabled), 'Folder grouping holds the previous snapshot and blocks overlapping commands until the batch finishes');
    release();
    await until(() => matches(left, desired) && matches(right, desired) && !command('Действия').disabled);
    assert(JSON.stringify((await browser.bookmarks.getChildren(source.id)).map((item) => item.id)) === JSON.stringify(desired), 'Grouping persists a stable partition: all folders first, with bookmark and separator order preserved');
    assert(document.activeElement === row(left, 'Action three') && row(right, 'Action two').getAttribute('aria-pressed') === 'true' && checkbox(left, 'Action one').checked && checkbox(left, 'Folder B').checked && checkbox(right, 'Folder A').checked && !checkbox(left, 'Folder A').checked, 'Grouping ignores checkbox selection and preserves independent marks and focused rows in both panes');
    assert((await browser.bookmarks.getChildren(folders[1].id))[0].id === nested.id, 'Grouping leaves folder contents unchanged');
    const completedCalls = calls;
    await showMenu();
    assert(action().disabled && document.activeElement === menu(), 'Already grouped folders disable the action while the menu remains keyboard accessible');
    action().click();
    assert(calls === completedCalls, 'An already grouped folder does not issue additional move requests');
    escape();
    await until(() => !menu() && document.activeElement === row(left, 'Action three'));
    browser.bookmarks.move = originalMove;

    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, target.title));
    row(right, target.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, otherFolder.title));
    await focus(right, otherBookmark.title);
    browser.bookmarks.move = async () => { throw new Error('Injected folder grouping failure'); };
    await perform();
    await until(() => document.querySelector('[role="alert"]') && !command('Действия').disabled);
    assert(matches(right, [otherBookmark.id, otherFolder.id]) && document.activeElement === row(right, otherBookmark.title), 'A failed grouping reports the error and restores the original active row');
    browser.bookmarks.move = originalMove;
    await perform();
    await until(() => matches(right, [otherFolder.id, otherBookmark.id]) && !command('Действия').disabled);
    assert(!document.querySelector('[role="alert"]') && matches(left, desired) && document.activeElement === row(right, otherBookmark.title), 'Retry groups only the active right folder and preserves the inactive folder order');
    await browser.bookmarks.removeTree(otherFolder.id);
    await until(() => !row(right, otherFolder.title));
    await showMenu();
    assert(action().disabled, 'Folder grouping is unavailable when the current folder contains no folders');
    escape();
    await until(() => !menu());
    for (const pane of [left, right]) parentRow(pane).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => left.querySelector('h2').textContent === fixtures.title && right.querySelector('h2').textContent === fixtures.title);
    return results;
  } finally {
    release();
    browser.bookmarks.move = originalMove;
    await browser.bookmarks.removeTree(source.id);
    await browser.bookmarks.removeTree(target.id);
  }
}
