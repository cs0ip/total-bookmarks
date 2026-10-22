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
    assert(action().disabled && document.activeElement?.getAttribute('aria-label') === 'Сортировка', 'Already grouped folders disable grouping while sorting remains keyboard accessible');
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
    results.push(...await runBookmarkSortTests({ fixtures, left, right, until, separators }));
    return results;
  } finally {
    release();
    browser.bookmarks.move = originalMove;
    await browser.bookmarks.removeTree(source.id);
    await browser.bookmarks.removeTree(target.id);
  }
}

async function runBookmarkSortTests({ fixtures, left, right, until, separators }) {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.querySelector('.font-semibold')?.textContent.trim() === title);
  const checkbox = (pane, title) => row(pane, title).parentElement.querySelector('input');
  const ids = (pane) => [...pane.querySelectorAll('[data-bookmark-row]')].map((node) => node.dataset.bookmarkId).filter((id) => id !== '..');
  const dialog = () => document.querySelector('[data-sort-dialog]');
  const input = (name, value) => dialog().querySelector(`input[name="${name}"]${value ? `[value="${value}"]` : ''}`);
  const source = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Sorting source' });
  const nodes = new Map();
  let separator;
  let separatorIndex;
  const originalMove = browser.bookmarks.move;
  async function openDialog() {
    document.querySelector('button[aria-controls="actions-menu"]').click();
    await until(() => document.querySelector('#actions-menu [aria-label="Сортировка"]'));
    document.querySelector('#actions-menu [aria-label="Сортировка"]').click();
    await until(() => dialog()?.open && dialog().contains(document.activeElement));
  }
  async function apply(expectedTitles) {
    const expected = expectedTitles.map((title) => nodes.get(title).id);
    if (separator) expected.splice(separatorIndex, 0, separator.id);
    dialog().querySelector('button[type="submit"]').click();
    await until(() => !dialog() && JSON.stringify(ids(left)) === JSON.stringify(expected) && JSON.stringify(ids(right)) === JSON.stringify(expected));
    assert(JSON.stringify((await browser.bookmarks.getChildren(source.id)).map((node) => node.id)) === JSON.stringify(expected), 'Sorting persists the requested order in the browser bookmark tree');
    assert(document.activeElement === row(left, 'Zulu') && checkbox(left, 'alpha').checked && checkbox(left, 'Folder Z').checked && checkbox(right, 'Beta').checked && row(right, 'ALPHA').getAttribute('aria-pressed') === 'true', 'Sorting keeps focused rows and independent marks in both panes');
  }
  try {
    for (const [title, url] of [['Zulu', 'https://a.b.example.test/z'], ['Folder Z'], ...(separators ? [['separator']] : []), ['ALPHA', 'https://example.test/z'], ['alpha', 'https://example.test/a'], ['Folder A'], ['Beta', 'https://a.test/b'], ['Gamma', 'https://a.example.test/g']]) {
      const node = await browser.bookmarks.create({ parentId: source.id, ...(title === 'separator' ? { type: 'separator' } : { title }), ...(url ? { url } : {}) });
      if (title === 'separator') { separator = node; separatorIndex = node.index; }
      else nodes.set(title, node);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const nested = await browser.bookmarks.create({ parentId: nodes.get('Folder Z').id, title: 'Unsorted child', url: 'about:blank' });
    for (const pane of [left, right]) {
      await until(() => row(pane, source.title));
      row(pane, source.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
    await until(() => row(left, 'Gamma') && row(right, 'Gamma'));
    checkbox(left, 'alpha').click();
    checkbox(left, 'Folder Z').click();
    checkbox(right, 'Beta').click();
    row(right, 'ALPHA').focus();
    row(left, 'Zulu').focus();
    const originalIds = ids(left);
    await openDialog();
    assert(input('sort-by', 'name').checked && input('ignore-case').checked && input('separate-folders').checked && input('folder-position', 'first').checked, 'The sorting dialog defaults to case-insensitive names with folders first');
    assert(input('sort-order', 'forward').checked, 'Sort order defaults to forward');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog() && document.activeElement === row(left, 'Zulu'));
    assert(JSON.stringify(ids(left)) === JSON.stringify(originalIds), 'Cancelling sorting keeps the original bookmark order');
    await openDialog();
    await apply(['Folder A', 'Folder Z', 'ALPHA', 'alpha', 'Beta', 'Gamma', 'Zulu']);
    await openDialog();
    let calls = 0;
    browser.bookmarks.move = async (...args) => { calls++; return originalMove(...args); };
    await apply(['Folder A', 'Folder Z', 'ALPHA', 'alpha', 'Beta', 'Gamma', 'Zulu']);
    assert(calls === 0, 'Sorting an already sorted folder does not issue bookmark moves');
    browser.bookmarks.move = originalMove;
    await openDialog();
    input('sort-order', 'reverse').click();
    await apply(['Folder Z', 'Folder A', 'Zulu', 'Gamma', 'Beta', 'ALPHA', 'alpha']);
    await openDialog();
    assert(input('sort-order', 'reverse').checked, 'The sorting dialog remembers reverse order');
    input('sort-order', 'forward').click();
    await apply(['Folder A', 'Folder Z', 'ALPHA', 'alpha', 'Beta', 'Gamma', 'Zulu']);
    await openDialog();
    input('sort-by', 'date').click();
    input('separate-folders').click();
    await apply(['Zulu', 'Folder Z', 'ALPHA', 'alpha', 'Folder A', 'Beta', 'Gamma']);
    await openDialog();
    input('sort-by', 'date').click();
    await until(() => dialog().querySelector('input[name="sort-order"]'));
    assert(input('sort-order', 'forward').checked, 'Forward sorting puts older dates first');
    input('sort-order', 'reverse').click();
    await apply(['Gamma', 'Beta', 'Folder A', 'alpha', 'ALPHA', 'Folder Z', 'Zulu']);
    await openDialog();
    input('sort-by', 'date').click();
    await until(() => dialog().querySelector('input[name="sort-order"]'));
    assert(input('sort-order', 'reverse').checked, 'Shared reverse ordering persists after switching from names to dates');
    input('sort-order', 'forward').click();
    await apply(['Zulu', 'Folder Z', 'ALPHA', 'alpha', 'Folder A', 'Beta', 'Gamma']);
    await openDialog();
    assert(!input('separate-folders').checked && !input('folder-position', 'first'), 'The dialog remembers folder grouping and hides placement when grouping is off');
    input('separate-folders').click();
    await until(() => input('folder-position', 'last'));
    input('folder-position', 'last').click();
    input('sort-by', 'url').click();
    await apply(['Zulu', 'Gamma', 'Beta', 'alpha', 'ALPHA', 'Folder Z', 'Folder A']);
    await openDialog();
    input('sort-by', 'url').click();
    input('sort-order', 'reverse').click();
    await apply(['ALPHA', 'alpha', 'Beta', 'Gamma', 'Zulu', 'Folder Z', 'Folder A']);
    await openDialog();
    assert(input('folder-position', 'last').checked, 'The dialog remembers the folder placement preference');
    input('sort-by', 'domain').click();
    assert(input('sort-order', 'reverse').checked, 'The same reverse order remains selected for domain sorting');
    await apply(['Zulu', 'Gamma', 'ALPHA', 'alpha', 'Beta', 'Folder Z', 'Folder A']);
    await openDialog();
    input('sort-by', 'domain').click();
    input('sort-order', 'forward').click();
    await apply(['Beta', 'alpha', 'ALPHA', 'Gamma', 'Zulu', 'Folder Z', 'Folder A']);
    await openDialog();
    assert(!input('only-selected').checked, 'Sorting the selection is an explicit option, disabled by default');
    input('only-selected').click();
    input('folder-position', 'first').click();
    const selectedMove = browser.bookmarks.move;
    browser.bookmarks.move = async (id, destination) => {
      assert([nodes.get('Folder Z').id, nodes.get('alpha').id].includes(id), 'Sorting the selection issues moves only for marks in the active pane');
      return selectedMove(id, destination);
    };
    await apply(['Beta', 'Folder Z', 'ALPHA', 'Gamma', 'Zulu', 'alpha', 'Folder A']);
    await openDialog();
    assert(!input('group-selected'), 'Selection grouping is hidden when sorting the entire folder');
    input('only-selected').click();
    await until(() => input('group-selected'));
    assert(!input('group-selected').checked, 'Selection grouping is disabled by default');
    input('group-selected').click();
    if (separator) separatorIndex++;
    await apply(['Beta', 'Folder Z', 'alpha', 'ALPHA', 'Gamma', 'Zulu', 'Folder A']);
    assert(ids(left)[1] === nodes.get('Folder Z').id && ids(left)[2] === nodes.get('alpha').id, 'Grouped sorting packs marks from their first original position and preserves the other items in order');
    browser.bookmarks.move = originalMove;
    await openDialog();
    assert(!input('only-selected').checked, 'Reopening sorting restores the default scope of the whole folder');
    input('ignore-case').click();
    input('folder-position', 'first').click();
    browser.bookmarks.move = async () => { throw new Error('Injected sorting failure'); };
    dialog().querySelector('button[type="submit"]').click();
    await until(() => dialog()?.querySelector('[role="alert"]') && !dialog().querySelector('button[type="submit"]').disabled);
    assert(dialog().open && document.querySelector('main > [role="alert"]'), 'A failed sorting batch leaves the dialog open for retry and reports the failure');
    browser.bookmarks.move = originalMove;
    await apply(['Folder A', 'Folder Z', 'alpha', 'ALPHA', 'Beta', 'Gamma', 'Zulu']);
    await openDialog();
    assert(!input('ignore-case').checked, 'The dialog remembers case sensitivity independently of folder grouping');
    input('ignore-case').click();
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog());
    assert((await browser.bookmarks.getChildren(nodes.get('Folder Z').id))[0].id === nested.id, 'Sorting changes only direct children and keeps nested folder contents unchanged');
    for (const pane of [left, right]) row(pane, '..').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => left.querySelector('h2').textContent === fixtures.title && right.querySelector('h2').textContent === fixtures.title);
    return results;
  } finally {
    browser.bookmarks.move = originalMove;
    await browser.bookmarks.removeTree(source.id);
  }
}
