export async function runBookmarkCreationTests({ fixtures, left, right, row, parentRow, checkbox, selectedRow, open, until, command, clickCommand, pressCommand, focus, mark }) {
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const dialog = () => document.querySelector('[data-bookmark-create-dialog]');
  const input = (name) => dialog().querySelector(`input[name="${name}"]`);
  const submit = () => dialog().querySelector('button[type="submit"]').click();
  async function field(name, value) {
    input(name).value = value;
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  }
  async function show(title, shortcut = false) {
    if (shortcut) assert(pressCommand(title === 'Закладку' ? 'b' : 'f', { shiftKey: title === 'Папку' }), 'Creation shortcut overrides the browser default and opens the shared modal');
    else clickCommand(title);
    await until(() => dialog()?.open && document.activeElement === input('title'));
  }
  const order = (pane) => [...pane.querySelectorAll('[data-bookmark-row]')].filter((node) => node.dataset.bookmarkId !== '..')
    .map((node) => node.querySelector('.font-semibold').textContent.trim());
  const source = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Creation source' });
  const target = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Creation target' });
  for (const title of ['Create A', 'Create B', 'Create C']) await browser.bookmarks.create({ parentId: source.id, title, url: 'about:blank' });
  for (const title of ['Create R1', 'Create R2']) await browser.bookmarks.create({ parentId: target.id, title, url: 'about:blank' });
  const originalCreate = browser.bookmarks.create;
  let release = () => {};
  let calls = 0;
  browser.bookmarks.create = async (...args) => { calls++; return originalCreate(...args); };
  try {
    await until(() => row(left, source.title) && row(right, target.title));
    open(left, source.title);
    open(right, target.title);
    await until(() => row(left, 'Create C') && row(right, 'Create R2'));
    await mark(left, 'Create A');
    await mark(right, 'Create R1');
    await focus(left, 'Create A');
    await show('Закладку', true);
    assert(dialog().querySelector('h2').textContent === 'Создать закладку' && input('url') && [...document.querySelectorAll('[aria-label="Команды"] button')].every((button) => button.disabled), 'Bookmark creation opens a modal with name and address fields and disables background commands');
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input('title').dispatchEvent(arrow);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input('title').dispatchEvent(tab);
    assert(!arrow.defaultPrevented && !tab.defaultPrevented && document.activeElement === input('title') && selectedRow(left) === row(left, 'Create A'), 'Pane keyboard shortcuts leave modal fields and their native navigation alone');
    assert(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'a', 'd', 'b', 'Delete'].every((key) => !pressCommand(key)) && !pressCommand('f', { shiftKey: true }) && left.querySelectorAll('input:checked').length === 1 && right.querySelectorAll('input:checked').length === 1 && dialog().querySelector('h2').textContent === 'Создать закладку', 'Command shortcuts do not intercept editing, alter marks or trigger background actions while a creation dialog is open');
    input('url').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    input('url').focus();
    assert(document.activeElement === input('url'), 'Mouse focus can move to the address field without returning to a pane');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog() && document.activeElement === row(left, 'Create A'));
    assert(calls === 0 && checkbox(left, 'Create A').checked && checkbox(right, 'Create R1').checked, 'Cancelling creation makes no bookmark API calls and restores pane focus and both sets of marks');

    await show('Закладку');
    await field('title', '   ');
    await field('url', 'about:blank');
    submit();
    assert(calls === 0 && !input('title').checkValidity(), 'A blank trimmed name cannot create an item');
    await field('title', '  Created bookmark  ');
    await field('url', 'not a URL');
    submit();
    assert(calls === 0 && !input('url').checkValidity(), 'An invalid address cannot create a bookmark');
    await field('url', 'about:blank?created=1');
    const gate = new Promise((resolve) => { release = resolve; });
    let held = false;
    browser.bookmarks.create = async (...args) => {
      calls++;
      const node = await originalCreate(...args);
      held = true;
      await gate;
      return node;
    };
    submit();
    await until(() => held);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert(calls === 1 && !row(left, 'Created bookmark') && dialog().querySelector('button[type="submit"]').disabled && dialog().querySelector('button[type="button"]').disabled, 'Creating an item keeps the old tree visible and prevents duplicate submission and cancellation until the operation finishes');
    release();
    await until(() => !dialog() && row(left, 'Created bookmark') && document.activeElement === row(left, 'Created bookmark'));
    const persisted = await browser.bookmarks.getChildren(source.id);
    assert(order(left).join(',') === 'Create A,Created bookmark,Create B,Create C' && persisted[1].url === 'about:blank?created=1' && checkbox(left, 'Create A').checked && checkbox(right, 'Create R1').checked && !checkbox(left, 'Created bookmark').checked, 'A bookmark is persisted immediately below the left focused row, receives focus and preserves existing marks');
    browser.bookmarks.create = async (...args) => { calls++; return originalCreate(...args); };

    await focus(right, 'Create R1');
    await show('Папку', true);
    assert(dialog().querySelector('h2').textContent === 'Создать папку' && !dialog().querySelector('input[name="url"]'), 'Folder creation asks only for its name');
    await field('title', 'Created folder');
    submit();
    await until(() => !dialog() && document.activeElement === row(right, 'Created folder'));
    const [createdFolder] = await browser.bookmarks.get(row(right, 'Created folder').parentElement.dataset.bookmarkId);
    assert(order(right).join(',') === 'Create R1,Created folder,Create R2' && createdFolder.type === 'folder' && selectedRow(left) === row(left, 'Created bookmark') && checkbox(right, 'Create R1').checked, 'Folder creation inserts into the active right pane after its focus without changing the left pane selection');
    parentRow(left).focus();
    await until(() => document.activeElement === parentRow(left));
    await show('Папку');
    await field('title', 'Created first');
    submit();
    await until(() => !dialog() && row(left, 'Created first'));
    assert(order(left)[0] === 'Created first' && document.activeElement === row(left, 'Created first'), 'Creating with the parent entry focused inserts at the beginning of the current folder');
    await focus(left, 'Create C');
    await show('Папку');
    await field('title', 'Created last');
    submit();
    await until(() => !dialog() && row(left, 'Created last'));
    assert(order(left).at(-1) === 'Created last', 'Creating below the final focused row appends the new item');

    await focus(right, 'Created folder');
    open(right, 'Created folder');
    await until(() => right.querySelector('h2').textContent === 'Created folder');
    await show('Закладку');
    await field('title', 'Created in empty');
    await field('url', 'about:blank');
    submit();
    await until(() => !dialog() && row(right, 'Created in empty'));
    assert(order(right).join(',') === 'Created in empty' && document.activeElement === row(right, 'Created in empty'), 'An empty folder accepts a new bookmark at its first real row');
    await show('Папку');
    await field('title', 'Created after retry');
    browser.bookmarks.create = async () => { throw new Error('Injected bookmark creation failure'); };
    submit();
    await until(() => dialog()?.querySelector('[role="alert"]') && !dialog().querySelector('button[type="submit"]').disabled);
    assert(input('title').value === 'Created after retry' && !row(right, 'Created after retry') && document.activeElement === input('title'), 'A failed create keeps the modal open, preserves the entered name and restores input focus for retry');
    browser.bookmarks.create = originalCreate;
    submit();
    await until(() => !dialog() && row(right, 'Created after retry'));
    assert(!document.querySelector('[role="alert"]') && order(right).join(',') === 'Created in empty,Created after retry', 'Retrying creation clears the error and inserts exactly one item at the original position');

    parentRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => right.querySelector('h2').textContent === target.title);
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(left, source.title) && row(right, target.title));
    await browser.bookmarks.removeTree(source.id);
    await browser.bookmarks.removeTree(target.id);
    await until(() => !row(left, source.title) && !row(right, target.title));
    return results;
  } finally {
    release();
    dialog()?.close();
    browser.bookmarks.create = originalCreate;
  }
}
