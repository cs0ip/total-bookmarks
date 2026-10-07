// Runs against the production UI, before the existing Russian-language suites.
export async function runLanguageTests() {
  const results = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
    results.push(message);
  }
  async function until(check) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Language UI did not update');
  }
  const button = document.querySelector('[data-language-button]');
  const panes = [...document.querySelectorAll('[data-bookmark-pane]')];
  const rows = () => panes.map((pane) => pane.querySelector('button[aria-pressed="true"]'));
  const headings = () => panes.map((pane) => pane.querySelector('h2').textContent);
  const command = (label) => document.querySelector(`[role="group"] > button[aria-label="${label}"]`);
  await until(() => panes[0].querySelector('input[type="checkbox"]'));
  assert(document.documentElement.lang === 'en' && document.title.includes('bookmark manager') && panes[0].getAttribute('aria-label') === 'Left pane', 'An unsupported browser locale defaults to the English interface');
  const selectedRows = rows();
  const folderHeadings = headings();
  const checkbox = panes[0].querySelector('input[type="checkbox"]');
  checkbox.click();
  await until(() => panes[0].querySelector('header').textContent.includes('Selected: 1'));
  const focused = document.activeElement;
  const scroll = panes.map((pane) => pane.querySelector('[data-bookmark-list]').scrollTop);

  async function openMenu() {
    button.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    button.click();
    await until(() => document.querySelector('#language-menu')?.contains(document.activeElement));
  }
  async function choose(language) {
    await openMenu();
    document.querySelector(`[data-locale="${language}"]`).click();
    await until(() => !document.querySelector('#language-menu') && document.activeElement === focused);
  }

  await openMenu();
  assert([...document.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent.replace('✓', '').trim()).join(',') === 'English,Русский,中文' && document.activeElement.dataset.locale === 'en', 'The nonmodal language menu shows native language names and focuses the current language');
  const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(up);
  assert(up.defaultPrevented && document.activeElement.dataset.locale === 'zh', 'Arrow keys navigate languages without moving the bookmark cursor');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await until(() => !document.querySelector('#language-menu') && document.activeElement === focused);
  assert(rows().every((row, index) => row === selectedRows[index]), 'Escape closes the language menu and restores the previous pane focus');

  await choose('zh');
  await until(async () => (await browser.storage.local.get('total-bookmarks:locale'))['total-bookmarks:locale'] === 'zh');
  assert(document.documentElement.lang === 'zh-Hans' && (await browser.storage.local.get('total-bookmarks:locale'))['total-bookmarks:locale'] === 'zh' && panes[0].querySelector('header').textContent.includes('已选：1') && command('删除'), 'Chinese selection updates commands and counters immediately and persists the choice');
  command('操作说明').click();
  await until(() => document.querySelector('[data-keyboard-help]'));
  assert(document.querySelector('[data-keyboard-help]').textContent.includes('快捷键') && document.querySelector('[data-keyboard-help]').textContent.includes('导航'), 'Shortcut help is translated into Chinese');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await until(() => !document.querySelector('[data-keyboard-help]'));
  assert(checkbox.checked && rows().every((row, index) => row === selectedRows[index]) && headings().every((heading, index) => heading === folderHeadings[index] || heading === '所有书签') && panes.every((pane, index) => pane.querySelector('[data-bookmark-list]').scrollTop === scroll[index]), 'Switching languages preserves folders, row identities, selections and scroll positions');

  await choose('en');
  command('Bookmark').click();
  await until(() => document.querySelector('dialog[open]'));
  assert(document.querySelector('dialog h2').textContent === 'Create bookmark' && document.querySelector('dialog').textContent.includes('URL'), 'Creation dialogs use the selected language');
  document.querySelector('dialog button[type="button"]').click();
  await until(() => !document.querySelector('dialog[open]'));
  await openMenu();
  panes[1].querySelector('button[aria-pressed]').focus();
  await until(() => !document.querySelector('#language-menu'));
  assert(panes[1].contains(document.activeElement), 'Moving focus to a pane dismisses the language menu without trapping focus');
  // Restore the original pane before finishing and leave the older suites in Russian.
  focused.focus();
  await choose('ru');
  assert(document.documentElement.lang === 'ru' && panes[0].querySelector('header').textContent.includes('Выбрано: 1') && command('Удалить'), 'Russian selection updates the same interface without remounting panels');
  checkbox.click();
  await until(() => !checkbox.checked);
  return results;
}
