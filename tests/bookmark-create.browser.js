export async function runBookmarkCreationTests({ fixtures, left, right, row, parentRow, checkbox, selectedRow, open, until, command, clickCommand, pressCommand, focus, mark }) {
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const dialog = () => document.querySelector('[data-bookmark-create-dialog]');
  const input = (name) => dialog().querySelector(`[name="${name}"]`);
  const submit = () => dialog().querySelector('button[type="submit"]').click();
  async function chooseCreation(title) {
    clickCommand('Создать');
    await until(() => document.querySelector('#create-menu')?.contains(document.activeElement));
    document.querySelector(`#create-menu button[aria-label="${title}"]`).click();
  }
  async function field(name, value) {
    input(name).value = value;
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  }
  async function show(title, shortcut = false) {
    if (shortcut) assert(pressCommand(title === 'Закладку' ? 'b' : 'f', { shiftKey: title === 'Папку' }), 'Creation shortcut overrides the browser default and opens the shared modal');
    else await chooseCreation(title);
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
    const createdUrl = 'https://example.test/Новая закладка?query=中文';
    await field('url', createdUrl);
    let createdDetails;
    const gate = new Promise((resolve) => { release = resolve; });
    let held = false;
    browser.bookmarks.create = async (...args) => {
      calls++;
      createdDetails = args[0];
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
    assert(order(left).join(',') === 'Create A,Created bookmark,Create B,Create C' && persisted[1].url === encodeURI(createdUrl) && createdDetails.url === encodeURI(createdUrl) && checkbox(left, 'Create A').checked && checkbox(right, 'Create R1').checked && !checkbox(left, 'Created bookmark').checked, 'A bookmark is persisted immediately below the left focused row, receives focus and preserves existing marks');
    browser.bookmarks.create = async (...args) => { calls++; return originalCreate(...args); };

    await focus(right, 'Create R1');
    await show('Папку', true);
    assert(dialog().querySelector('h2').textContent === 'Создать папку' && !dialog().querySelector('[name="url"]'), 'Folder creation asks only for its name');
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

    const separatorRow = (pane) => pane.querySelector('[data-bookmark-separator]')?.closest('button');
    const separatorCount = (pane) => pane.querySelectorAll('[data-bookmark-separator]').length;
    await focus(left, 'Create A');
    let separatorDetails;
    const separatorGate = new Promise((resolve) => { release = resolve; });
    browser.bookmarks.create = async (details) => {
      separatorDetails = details;
      const node = await originalCreate(details);
      await separatorGate;
      return node;
    };
    await chooseCreation('Разделитель');
    await until(() => separatorDetails);
    assert(separatorDetails.type === 'separator' && !('title' in separatorDetails) && !('url' in separatorDetails) && !dialog() && command('Создать').disabled, 'The separator menu item creates a native separator without a properties dialog and blocks repeated submission');
    pressCommand('s', { code: 'KeyS', shiftKey: true, repeat: true });
    release();
    await until(() => separatorCount(left) === 1 && !command('Создать').disabled && document.activeElement === separatorRow(left));
    const withSeparator = await browser.bookmarks.getChildren(source.id);
    const separator = withSeparator[withSeparator.findIndex((item) => item.title === 'Create A') + 1];
    assert(separator.type === 'separator' && separatorRow(left).parentElement.dataset.bookmarkId === separator.id && checkbox(left, 'Create A').checked, 'A separator is inserted after the left focused row, receives focus and retains existing marks');
    assert(separatorRow(left).parentElement.querySelector('input') && !separatorRow(left).parentElement.querySelector('input').checked && command('Редактировать').disabled, 'A focused separator has an initially unchecked selection checkbox and no editable properties');
    const separatorIndex = withSeparator.findIndex((item) => item.id === separator.id);
    separatorRow(left).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    separatorRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert(left.querySelector('h2').textContent === source.title && !dialog(), 'Enter and double-click do not open a separator');
    browser.bookmarks.create = originalCreate;
    parentRow(right).focus();
    await until(() => document.activeElement === parentRow(right));
    assert(pressCommand('ы', { code: 'KeyS', shiftKey: true }), 'Ctrl+Shift+S uses the physical key with a Russian keyboard layout');
    await until(() => separatorCount(right) === 1 && document.activeElement === separatorRow(right));
    const rightFolderId = (await browser.bookmarks.get(separatorRow(right).parentElement.dataset.bookmarkId))[0].parentId;
    assert((await browser.bookmarks.getChildren(rightFolderId))[0].type === 'separator' && separatorCount(left) === 1, 'The separator shortcut inserts at the beginning of the right folder when its parent row is focused');
    browser.bookmarks.create = async () => { throw new Error('Injected separator creation failure'); };
    await chooseCreation('Разделитель');
    await until(() => document.querySelector('[role="alert"]') && !command('Создать').disabled);
    assert(separatorCount(right) === 1 && document.activeElement === separatorRow(right), 'Failed separator creation preserves the focused row and allows retry');
    browser.bookmarks.create = originalCreate;
    await chooseCreation('Разделитель');
    await until(() => separatorCount(right) === 2 && !command('Создать').disabled);
    assert(!document.querySelector('[role="alert"]') && (await browser.bookmarks.getChildren(source.id))[separatorIndex].id === separator.id, 'Retrying separator creation clears the error and preserves the other folder order');
    const emptyForSeparator = await originalCreate({ parentId: rightFolderId, title: 'Empty separator folder' });
    await until(() => row(right, emptyForSeparator.title));
    open(right, emptyForSeparator.title);
    await until(() => right.querySelector('h2').textContent === emptyForSeparator.title);
    await chooseCreation('Разделитель');
    await until(() => separatorCount(right) === 1 && document.activeElement === separatorRow(right));
    assert((await browser.bookmarks.getChildren(emptyForSeparator.id)).length === 1, 'A separator can be the first and only item in an empty folder');
    const [markedSeparator] = await browser.bookmarks.getChildren(emptyForSeparator.id);
    const companion = await originalCreate({ parentId: emptyForSeparator.id, title: 'Separator companion', url: 'about:blank' });
    await until(() => row(right, companion.title));
    await mark(right, 'Разделитель');
    await mark(right, companion.title);
    await focus(right, companion.title);
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, emptyForSeparator.title));
    open(right, emptyForSeparator.title);
    await until(() => row(right, companion.title));
    assert(right.querySelector(`[data-bookmark-id="${markedSeparator.id}"] input`).checked && checkbox(right, companion.title).checked && right.querySelector('header').textContent.includes('Выбрано: 2'), 'Separator and bookmark marks survive leaving and reentering their folder');
    await browser.bookmarks.update(companion.id, { title: 'Updated separator companion' });
    await until(() => row(right, 'Updated separator companion'));
    assert(right.querySelector(`[data-bookmark-id="${markedSeparator.id}"] input`).checked, 'Refreshing the bookmark tree retains a marked separator');
    await focus(right, 'Updated separator companion');
    clickCommand('Переместить влево');
    await until(() => row(left, 'Updated separator companion') && !row(right, 'Updated separator companion'));
    const movedChildren = await browser.bookmarks.getChildren(source.id);
    const movedIndex = movedChildren.findIndex((item) => item.id === markedSeparator.id);
    assert(movedIndex >= 0 && movedChildren[movedIndex + 1]?.id === companion.id && left.querySelector(`[data-bookmark-id="${markedSeparator.id}"] input`).checked && checkbox(left, 'Updated separator companion').checked && !right.querySelector('input:checked'), 'Moving a mixed marked group transfers separators and bookmarks in order and moves their marks to the destination pane');
    await focus(left, 'Create C');
    clickCommand('Ничего');
    await until(() => !left.querySelector('input:checked'));
    left.querySelector(`[data-bookmark-id="${markedSeparator.id}"] input`).click();
    await mark(left, 'Updated separator companion');
    const confirm = window.confirm;
    let message;
    window.confirm = (text) => { message = text; return true; };
    try {
      clickCommand('Удалить');
      await until(() => !left.querySelector(`[data-bookmark-id="${markedSeparator.id}"]`) && !row(left, 'Updated separator companion'));
      assert(message.includes('Количество элементов: 2.') && document.activeElement === row(left, 'Create C') && separatorCount(left) === 1 && !(await browser.bookmarks.getChildren(source.id)).some((item) => item.id === companion.id), 'Batch deletion removes marked separators and bookmarks while retaining the unmarked separator and focused row');
    } finally { window.confirm = confirm; }
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => right.querySelector('h2').textContent === 'Created folder');

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
