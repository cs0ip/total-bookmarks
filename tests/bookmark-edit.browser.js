// Both panes start in fixtures; this suite runs against Firefox and Chrome.
export async function runBookmarkEditingTests({ fixtures, left, right, until }) {
  const results = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
    results.push(message);
  };
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.querySelector('.font-semibold')?.textContent.trim() === title);
  const parentRow = (pane) => pane.querySelector('button[aria-label="На уровень выше"]');
  const checkbox = (pane, title) => row(pane, title)?.parentElement.querySelector('input');
  const command = (title) => document.querySelector(`[aria-label="Команды"] button[aria-label="${title}"]`);
  const dialog = () => document.querySelector('[data-bookmark-edit-dialog]');
  const input = (name) => dialog()?.querySelector(`[name="${name}"]`);
  const submit = () => dialog().querySelector('button[type="submit"]').click();
  async function focus(pane, title) {
    row(pane, title).focus();
    await until(() => document.activeElement === row(pane, title) && row(pane, title).getAttribute('aria-pressed') === 'true');
  }
  async function field(name, value) {
    input(name).value = value;
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  }
  function shortcut(options = {}) {
    const event = new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', ctrlKey: true, bubbles: true, cancelable: true, ...options });
    document.activeElement.dispatchEvent(event);
    return event;
  }
  async function show(withShortcut = false) {
    if (withShortcut) assert(shortcut({ key: 'у' }).defaultPrevented, 'Ctrl+E opens editing using the physical key even with a Russian keyboard layout');
    else command('Редактировать').click();
    await until(() => dialog()?.open && document.activeElement === input('title'));
  }
  const folder = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Editing fixtures' });
  const bookmark = await browser.bookmarks.create({ parentId: folder.id, title: 'Edit original', url: 'https://example.test/original' });
  const peer = await browser.bookmarks.create({ parentId: folder.id, title: 'Edit peer', url: 'https://example.test/peer' });
  const child = await browser.bookmarks.create({ parentId: folder.id, title: 'Edit folder' });
  const originalUpdate = browser.bookmarks.update;
  let calls = 0;
  let release = () => {};
  browser.bookmarks.update = async (...args) => { calls++; return originalUpdate(...args); };
  try {
    await until(() => row(left, folder.title) && row(right, folder.title));
    for (const pane of [left, right]) row(pane, folder.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(left, peer.title) && row(right, peer.title));
    parentRow(left).focus();
    await until(() => command('Редактировать').disabled);
    assert(command('Редактировать').disabled, 'The parent entry cannot be edited');
    assert(shortcut().defaultPrevented && !dialog(), 'Ctrl+E consumes the browser shortcut without editing the parent entry');
    checkbox(left, peer.title).click();
    checkbox(right, bookmark.title).click();
    await focus(left, bookmark.title);
    for (const options of [{ ctrlKey: false }, { shiftKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }]) shortcut(options);
    await Promise.resolve();
    assert(!dialog(), 'Editing requires exactly Ctrl+E and ignores held-key repeats');
    await show(true);
    assert(dialog().querySelector('h2').textContent === 'Редактировать закладку' && input('title').value === bookmark.title && input('url').value === bookmark.url, 'Editing opens the focused bookmark with its current name and URL, independently of marked items');
    assert([...document.querySelectorAll('[aria-label="Команды"] button')].every((button) => button.disabled), 'The editing modal disables all background commands');
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input('title').dispatchEvent(arrow);
    assert(!arrow.defaultPrevented && document.activeElement === input('title'), 'Pane keyboard navigation does not intercept editing in the modal');
    assert(!shortcut().defaultPrevented, 'Ctrl+E does not execute the pane command while a modal field has focus');
    await field('title', 'Cancelled edit');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog() && document.activeElement === row(left, bookmark.title));
    assert(calls === 0 && checkbox(left, peer.title).checked && checkbox(right, bookmark.title).checked, 'Cancelling editing does not update bookmarks and preserves both pane selections and focus');

    await show();
    await field('title', '   ');
    submit();
    assert(calls === 0 && !input('title').checkValidity(), 'Editing rejects an empty trimmed name');
    await field('title', '  Edited bookmark  ');
    await field('url', 'invalid URL');
    submit();
    assert(calls === 0 && !input('url').checkValidity(), 'Editing rejects invalid bookmark URLs');
    await field('url', 'https://example.test/edited');
    const gate = new Promise((resolve) => { release = resolve; });
    let held = false;
    browser.bookmarks.update = async (...args) => {
      calls++;
      const result = await originalUpdate(...args);
      held = true;
      await gate;
      return result;
    };
    submit();
    await until(() => held);
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    assert(cancel.defaultPrevented && [...dialog().querySelectorAll('input, textarea, button')].every((control) => control.disabled) && !row(left, 'Edited bookmark'), 'Saving prevents cancellation and duplicate submission while keeping the previous tree visible');
    release();
    await until(() => !dialog() && row(left, 'Edited bookmark') && row(right, 'Edited bookmark') && document.activeElement === row(left, 'Edited bookmark'));
    const [saved] = await browser.bookmarks.get(bookmark.id);
    assert(calls === 1 && saved.title === 'Edited bookmark' && saved.url === 'https://example.test/edited' && saved.parentId === folder.id && checkbox(left, peer.title).checked && checkbox(right, 'Edited bookmark').checked, 'Saving updates the existing bookmark in both panes, retaining its ID, folder, marks and focus');

    browser.bookmarks.update = originalUpdate;
    const encodedUrl = 'https://example.test/wiki/%D0%97%D0%B0%D0%BA%D0%BB%D0%B0%D0%B4%D0%BA%D0%B8%20%2F%23%252F?q=%E4%B8%AD%E6%96%87%26x%3D1%09%0A%0D%0A%0D';
    const listUrl = decodeURIComponent(encodedUrl);
    const displayedUrl = listUrl.replace(/\r\n?/g, '\n');
    const unicodeBookmark = await browser.bookmarks.create({ parentId: folder.id, title: 'Unicode address', url: encodedUrl });
    await until(() => row(left, unicodeBookmark.title));
    await focus(left, unicodeBookmark.title);
    const address = () => row(left, unicodeBookmark.title).querySelector('[data-url-encoded]');
    const settingsButton = document.querySelector('[data-settings-button]');
    const listToggle = () => document.querySelector('[data-escape-addresses]');
    const formToggle = () => dialog()?.querySelector('[data-escape-address]');
    async function showSettings() {
      settingsButton.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
      settingsButton.click();
      await until(() => listToggle() && document.activeElement === listToggle());
    }
    async function closeSettings() {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await until(() => !listToggle() && document.activeElement === row(left, unicodeBookmark.title));
    }
    function clipboardEvent(type, text = '') {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      const event = new ClipboardEvent(type, { bubbles: true, cancelable: true });
      // Firefox gives synthetic paste events an empty native clipboard object.
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      return event;
    }
    function copyField(start = 0, end = input('url').value.length) {
      input('url').focus();
      input('url').setSelectionRange(start, end);
      const event = clipboardEvent('copy');
      input('url').dispatchEvent(event);
      return event.clipboardData.getData('text/plain');
    }
    assert(address().textContent === listUrl && (settingsButton.compareDocumentPosition(document.querySelector('[data-language-button]')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Addresses are fully decoded by default and the settings button precedes the language button');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(address());
    selection.removeAllRanges();
    selection.addRange(range);
    const rowCopy = clipboardEvent('copy');
    document.dispatchEvent(rowCopy);
    assert(rowCopy.defaultPrevented && rowCopy.clipboardData.getData('text/plain') === encodedUrl, 'Copying a decoded list address copies the complete encoded URL');
    selection.removeAllRanges();
    await showSettings();
    assert(!listToggle().checked, 'List address escaping is initially disabled');
    listToggle().click();
    await until(async () => address().textContent === encodedUrl && (await browser.storage.local.get('total-bookmarks:settings'))['total-bookmarks:settings']?.escapeAddresses === true);
    assert(document.activeElement === listToggle(), 'The settings switch keeps focus while updating and persisting list address escaping');
    await closeSettings();
    await show();
    assert(!formToggle().checked && input('url').value === displayedUrl, 'The form escaping preference is independent from the list preference and defaults off');
    assert(copyField() === encodedUrl, 'Copying a decoded form address copies its encoded URL');
    const unicodeStart = displayedUrl.indexOf('Закладки');
    assert(copyField(unicodeStart, unicodeStart + 'Закладки'.length) === encodeURIComponent('Закладки'), 'Copying only selected Unicode address text encodes the selected text');
    formToggle().click();
    await until(async () => input('url').value === encodedUrl && (await browser.storage.local.get('total-bookmarks:settings'))['total-bookmarks:settings']?.escapeAddressInDialog === true);
    assert(copyField() === encodedUrl, 'Copying the escaped form address preserves existing escapes without double encoding');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog());
    await show();
    assert(formToggle().checked && input('url').value === encodedUrl, 'The form remembers its escaping choice when reopened');
    formToggle().click();
    await until(() => input('url').value === displayedUrl);
    input('url').focus();
    input('url').select();
    const cut = clipboardEvent('cut');
    input('url').dispatchEvent(cut);
    await until(() => !input('url').value);
    assert(cut.clipboardData.getData('text/plain') === encodedUrl, 'Cutting a decoded address removes its display text and copies its encoded URL');
    const paste = clipboardEvent('paste', encodedUrl);
    input('url').dispatchEvent(paste);
    await until(() => input('url').value === displayedUrl).catch((cause) => { throw new Error(cause.message + '; pasted: ' + JSON.stringify({ clipboard: paste.clipboardData.getData('text/plain'), value: input('url').value, expected: displayedUrl })); });
    assert(copyField() === encodedUrl && input('url').checkValidity(), 'Pasting an encoded URL into the decoded field retains its meaning without double encoding');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog());
    await showSettings();
    assert(listToggle().checked, 'Changing the form preference leaves the saved list preference unchanged');
    listToggle().click();
    await until(async () => address().textContent === listUrl && (await browser.storage.local.get('total-bookmarks:settings'))['total-bookmarks:settings']?.escapeAddressInDialog === false);
    await closeSettings();
    await show();
    assert(input('url').value === displayedUrl && input('url').checkValidity(), 'The editing form decodes all URL characters, including delimiters, spaces and percent signs');
    let submittedUrl;
    browser.bookmarks.update = async (id, changes) => { submittedUrl = changes.url; return originalUpdate(id, changes); };
    await field('title', 'Renamed Unicode address');
    submit();
    await until(() => !dialog() && row(left, 'Renamed Unicode address'));
    assert(submittedUrl === encodedUrl && (await browser.bookmarks.get(unicodeBookmark.id))[0].url === unicodeBookmark.url, 'Renaming a bookmark preserves the original encoded URL exactly when its readable address has not changed');
    await show();
    const editedUnicodeUrl = displayedUrl.replace('Закладки', 'Новые_закладки');
    await field('url', editedUnicodeUrl);
    submit();
    await until(() => !dialog());
    assert(submittedUrl === encodedUrl.replace('%D0%97%D0%B0%D0%BA%D0%BB%D0%B0%D0%B4%D0%BA%D0%B8', encodeURIComponent('Новые_закладки')) && (await browser.bookmarks.get(unicodeBookmark.id))[0].url === submittedUrl, 'Editing a readable Unicode address saves the new URL without changing encoded delimiters');
    await show();
    assert(input('url').value === editedUnicodeUrl, 'Reopening the edited bookmark retains the readable Unicode address');
    dialog().querySelector('button[type="button"]').click();
    await until(() => !dialog());

    row(left, child.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => left.querySelector('h2').textContent === child.title);
    await focus(right, child.title);
    await show(true);
    assert(dialog().querySelector('h2').textContent === 'Редактировать папку' && input('title').value === child.title && !input('url'), 'Editing a folder in the right pane asks only for its current name');
    await field('title', 'Edited folder');
    browser.bookmarks.update = async () => { throw new Error('Injected bookmark editing failure'); };
    submit();
    await until(() => dialog()?.querySelector('[role="alert"]') && !input('title').disabled);
    assert(input('title').value === 'Edited folder' && document.activeElement === input('title') && row(right, child.title), 'A failed edit keeps the dialog open and the entered values available for retry');
    browser.bookmarks.update = async (id, changes) => {
      assert(!('url' in changes), 'Renaming a folder does not send a URL to the browser API');
      return originalUpdate(id, changes);
    };
    submit();
    await until(() => !dialog() && row(right, 'Edited folder') && left.querySelector('h2').textContent === 'Edited folder' && document.activeElement === row(right, 'Edited folder'));
    assert(!document.querySelector('[role="alert"]') && left.querySelector('footer').textContent.includes('Edited folder') && checkbox(right, 'Edited bookmark').checked, 'Retrying a folder rename updates open-folder headings and paths and preserves right-pane focus and marks');
    for (const pane of [left, right]) {
      parentRow(pane).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await until(() => pane.querySelector('h2').textContent === (pane === left ? folder.title : fixtures.title));
    }
    parentRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => left.querySelector('h2').textContent === fixtures.title);
    return results;
  } finally {
    release();
    dialog()?.close();
    browser.bookmarks.update = originalUpdate;
    await browser.bookmarks.removeTree(folder.id);
  }
}

export async function verifyRestoredUrlSettings() {
  async function until(check) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Saved address preferences were not restored');
  }
  document.querySelector('[data-settings-button]').click();
  await until(() => document.querySelector('[data-escape-addresses]')?.checked);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  const pane = document.querySelector('[data-bookmark-pane="0"]');
  pane.querySelector('button[aria-pressed]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const create = document.querySelector('[aria-controls="create-menu"]');
  await until(() => !create.disabled);
  create.click();
  await until(() => document.querySelector('#create-menu button'));
  document.querySelector('#create-menu button').click();
  await until(() => document.querySelector('[data-escape-address]')?.checked);
  document.querySelector('dialog button[type="button"]').click();
  await until(() => !document.querySelector('dialog'));
  pane.querySelector('button[aria-label="На уровень выше"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await until(() => !pane.querySelector('button[aria-label="На уровень выше"]'));
  return 'Both address escaping preferences restore from extension storage after reopening the manager';
}
