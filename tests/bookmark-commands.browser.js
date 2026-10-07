export async function runBookmarkCommandTests({ fixtures, left, right, row, parentRow, checkbox, selectedRow, open, until, clickCheckbox }) {
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const command = (title) => document.querySelector(`[aria-label="Команды"] button[aria-label="${title}"]`);
  const order = (pane) => [...pane.querySelectorAll('button[aria-pressed]')]
    .filter((button) => button !== parentRow(pane)).map((button) => button.querySelector('.font-semibold').textContent.trim());
  const matches = (pane, titles) => JSON.stringify(order(pane)) === JSON.stringify(titles);
  function clickCommand(title) {
    const button = command(title);
    button.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    button.click();
  }
  function pressCommand(key, options = {}) {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: key !== 'Delete', bubbles: true, cancelable: true, ...options });
    document.activeElement.dispatchEvent(event);
    return event.defaultPrevented;
  }
  async function focus(pane, title) {
    row(pane, title).focus();
    await until(() => document.activeElement === row(pane, title) && selectedRow(pane) === row(pane, title));
  }
  async function mark(pane, title) {
    if (!checkbox(pane, title).checked) clickCheckbox(checkbox(pane, title));
    await until(() => checkbox(pane, title).checked);
  }
  const source = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Command source' });
  const target = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Command target' });
  const empty = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Command empty target' });
  const nodes = [];
  for (const title of ['Command A', 'Command B', 'Command C', 'Command D', 'Command E', 'Command F']) {
    nodes.push(await browser.bookmarks.create({ parentId: source.id, title, ...(title === 'Command B' ? {} : { url: 'about:blank' }) }));
  }
  for (const title of ['Target 1', 'Target 2', 'Target 3']) {
    await browser.bookmarks.create({ parentId: target.id, title, url: 'about:blank' });
  }
  const originalMove = browser.bookmarks.move;
  let release = () => {};
  try {
    await until(() => row(left, source.title) && row(right, target.title));
    open(left, source.title);
    open(right, target.title);
    await until(() => row(left, 'Command F') && row(right, 'Target 3'));
    const bar = document.querySelector('[aria-label="Команды"]');
    assert([...bar.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')).join(',') === 'Переместить вверх,Переместить вниз,Переместить влево,Переместить вправо,Всё,Ничего,Закладку,Папку,Удалить,Управление,О программе' && bar.getBoundingClientRect().top >= Math.max(left.getBoundingClientRect().bottom, right.getBoundingClientRect().bottom), 'Movement, selection, creation, delete, help and about commands appear in the configured order below both panels');
    assert([...bar.querySelectorAll('button')].slice(0, 4).map((button) => button.textContent.trim()).join('') === '↑↓←→' && bar.textContent.includes('Переместить:') && bar.textContent.includes('Выделить:') && bar.textContent.split('|').length === 6 && command('Всё').previousElementSibling.textContent === 'Выделить:' && command('Закладку').previousElementSibling.textContent === 'Создать:' && command('Удалить').previousElementSibling.textContent === '|' && command('Управление').previousElementSibling.textContent === '|' && command('Управление').textContent.includes('?') && command('О программе').previousElementSibling.textContent === '|' && command('О программе').querySelector('img').getAttribute('src') === './icons/logo.svg', 'Command groups have compact captions, arrow buttons, separators, a help icon and an application logo');
    assert([...bar.querySelectorAll('button')].filter((button) => !['Всё', 'Закладку', 'Папку', 'Управление', 'О программе'].includes(button.getAttribute('aria-label'))).every((button) => button.disabled) && !command('Всё').disabled && !command('Закладку').disabled && !command('Папку').disabled && !command('Управление').disabled && !command('О программе').disabled, 'Selection, creation, help and about remain available when both panes have unmarked items and their parent entries focused');
    const help = () => document.querySelector('[data-keyboard-help]');
    const helpContent = () => document.querySelector('[data-keyboard-help-content]');
    const previousFocus = document.activeElement;
    clickCommand('Управление');
    await until(() => help() && document.activeElement === helpContent());
    const helpBounds = help().getBoundingClientRect();
    const keys = [...help().querySelectorAll('kbd')].map((key) => key.textContent.trim());
    assert(help().getAttribute('aria-modal') === 'false' && command('Управление').getAttribute('aria-expanded') === 'true' && helpBounds.top >= 0 && helpBounds.bottom <= bar.getBoundingClientRect().top && helpContent().scrollHeight > helpContent().clientHeight, 'Help opens above the command bar as a nonmodal scrollable popup within the viewport');
    assert(['↑ / ↓', '← / →', 'Tab / Shift+Tab', 'Home / End', 'Enter', 'Backspace', 'Пробел', 'Insert / Shift+↓', 'Shift+↑', 'Shift+Home', 'Shift+End', 'Ctrl+↑', 'Ctrl+↓', 'Ctrl+←', 'Ctrl+→', 'Ctrl+A', 'Ctrl+D', 'Ctrl+B', 'Ctrl+Shift+F', 'Del', 'Esc'].every((key) => keys.includes(key)) && help().textContent.includes('Повторное выделение снимает отметку'), 'Help lists all list and command shortcuts with current folder creation binding and selection toggle semantics');
    assert(!pressCommand('ArrowRight', { ctrlKey: false }) && !pressCommand('a') && !left.querySelector('input:checked') && !right.querySelector('input:checked') && document.activeElement === helpContent(), 'Keyboard input in help does not switch panes or execute background selection commands');
    assert(pressCommand('Escape', { ctrlKey: false }), 'Escape is consumed by the help popup');
    await until(() => !help() && document.activeElement === previousFocus);
    assert(command('Управление').getAttribute('aria-expanded') === 'false', 'Closing help restores the original active pane focus and collapsed button state');
    clickCommand('Управление');
    await until(() => help() && document.activeElement === helpContent());
    await focus(right, 'Target 2');
    await until(() => !help());
    assert(document.activeElement === row(right, 'Target 2'), 'Focusing a pane closes nonmodal help and keeps focus on the newly chosen row');
    clickCommand('Управление');
    await until(() => help() && document.activeElement === helpContent());
    clickCommand('Управление');
    await until(() => !help() && document.activeElement === row(right, 'Target 2'));
    assert(!help(), 'Clicking the help button again closes its popup');
    clickCommand('Управление');
    await until(() => help() && document.activeElement === helpContent());
    window.dispatchEvent(new Event('blur'));
    await until(() => !help());
    assert(!help(), 'Losing window focus dismisses help');
    previousFocus.focus();
    await until(() => document.activeElement === previousFocus);
    await focus(left, 'Command C');
    assert(!command('Переместить вверх').disabled && !command('Переместить вниз').disabled && !command('Переместить вправо').disabled, 'A focused real row enables source movement commands without checkbox marks');
    assert(!pressCommand('ArrowUp', { altKey: true }) && !pressCommand('ArrowUp', { shiftKey: true }) && !pressCommand('ArrowUp', { metaKey: true }) && pressCommand('ArrowUp', { repeat: true }) && matches(left, nodes.map((node) => node.title)), 'Extra modifiers do not trigger commands and held command keys cannot repeatedly move items');
    assert(pressCommand('ArrowUp'), 'Ctrl+Up overrides the browser default and invokes move-up');
    await until(() => matches(left, ['Command A', 'Command C', 'Command B', 'Command D', 'Command E', 'Command F']) && !command('Переместить вверх').disabled);
    assert(document.activeElement === row(left, 'Command C') && !left.querySelector('input:checked'), 'Moving a focused row upward preserves focus without adding a checkbox mark');
    assert(pressCommand('ArrowDown'), 'Ctrl+Down invokes move-down through the shared command');
    await until(() => matches(left, nodes.map((node) => node.title)) && !command('Переместить вниз').disabled);
    assert(document.activeElement === row(left, 'Command C') && !left.querySelector('input:checked'), 'Moving a focused row downward restores order without marking it');
    await focus(right, 'Target 1');
    assert(pressCommand('ArrowRight'), 'Ctrl+Right invokes left-to-right movement even when the right pane is active');
    await until(() => matches(right, ['Target 1', 'Command C', 'Target 2', 'Target 3']) && !command('Переместить влево').disabled);
    assert(!row(left, 'Command C') && !left.querySelector('input:checked') && !right.querySelector('input:checked') && document.activeElement === row(right, 'Target 1') && selectedRow(left) === row(left, 'Command D'), 'Move-right keeps the inactive source selection at the removed row position while preserving active destination focus and leaving checkboxes unmarked');
    await browser.bookmarks.move(nodes[2].id, { parentId: source.id, index: 2 });
    await until(() => matches(left, nodes.map((node) => node.title)) && matches(right, ['Target 1', 'Target 2', 'Target 3']));
    await focus(left, 'Command E');
    await mark(left, 'Command E');
    await mark(left, 'Command B');
    let calls = 0;
    let held = false;
    const gate = new Promise((resolve) => { release = resolve; });
    browser.bookmarks.move = async (...args) => {
      calls++;
      const moved = await originalMove(...args);
      if (calls === 1) { held = true; await gate; }
      return moved;
    };
    clickCommand('Переместить вверх');
    await until(() => held);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert(matches(left, nodes.map((node) => node.title)) && left.querySelectorAll('input:checked').length === 2 && [...bar.querySelectorAll('button')].every((button) => button.disabled), 'A batch keeps the original visible snapshot and marks while disabling commands');
    clickCommand('Переместить вверх');
    assert(pressCommand('ArrowDown') && pressCommand('a') && left.querySelectorAll('input:checked').length === 2, 'Movement and selection shortcuts are consumed without changing a busy batch');
    assert(calls === 1, 'A second command cannot start while a move batch is in progress');
    release();
    await until(() => matches(left, ['Command B', 'Command E', 'Command A', 'Command C', 'Command D', 'Command F']) && !command('Переместить вверх').disabled);
    assert(checkbox(left, 'Command B').checked && checkbox(left, 'Command E').checked && document.activeElement === row(left, 'Command E'), 'Moving upward packs nonadjacent folder and bookmark selections in their displayed order and preserves marks and focus');
    browser.bookmarks.move = originalMove;

    for (const [index, node] of nodes.entries()) await browser.bookmarks.move(node.id, { index });
    await until(() => matches(left, nodes.map((node) => node.title)));
    clickCommand('Переместить вниз');
    await until(() => matches(left, ['Command A', 'Command C', 'Command D', 'Command F', 'Command B', 'Command E']) && !command('Переместить вниз').disabled);
    const saved = await browser.bookmarks.getChildren(source.id);
    assert(saved.map((node) => node.title).join(',') === order(left).join(',') && checkbox(left, 'Command B').checked && checkbox(left, 'Command E').checked && document.activeElement === row(left, 'Command E'), 'Moving downward packs selections after the row following the final selection and persists the exact order in Firefox');
    calls = 0;
    browser.bookmarks.move = async (...args) => { calls++; return originalMove(...args); };
    clickCommand('Переместить вниз');
    await new Promise((resolve) => setTimeout(resolve, 30));
    await until(() => !command('Переместить вниз').disabled);
    assert(calls === 0 && matches(left, saved.map((node) => node.title)), 'A contiguous block at the bottom does not wrap or issue unnecessary moves');
    browser.bookmarks.move = originalMove;

    await focus(right, 'Target 1');
    await mark(right, 'Target 3');
    clickCommand('Переместить вправо');
    await until(() => matches(right, ['Target 1', 'Command B', 'Command E', 'Target 2', 'Target 3']) && checkbox(right, 'Command B').checked && checkbox(right, 'Command E').checked);
    assert(!left.querySelector('input:checked') && checkbox(right, 'Target 3').checked && document.activeElement === row(right, 'Target 1') && selectedRow(left) === row(left, 'Command F'), 'Move-right preserves destination focus and marks while clamping the removed source focus to its last remaining row');
    await focus(left, 'Command C');
    assert(pressCommand('ArrowLeft'), 'Ctrl+Left invokes right-to-left movement even when the left pane is active');
    await until(() => matches(left, ['Command A', 'Command C', 'Command B', 'Command E', 'Target 3', 'Command D', 'Command F']) && left.querySelectorAll('input:checked').length === 3);
    assert(matches(right, ['Target 1', 'Target 2']) && !right.querySelector('input:checked') && document.activeElement === row(left, 'Command C'), 'Move-left transfers the right selection in order below the left focused row and preserves left focus');

    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, source.title));
    open(right, source.title);
    await until(() => row(right, 'Command D'));
    await focus(right, 'Command D');
    clickCommand('Переместить вправо');
    await until(() => matches(left, ['Command A', 'Command C', 'Command D', 'Command B', 'Command E', 'Target 3', 'Command F']) && right.querySelectorAll('input:checked').length === 3);
    assert(matches(right, order(left)) && left.querySelectorAll('input:checked').length === 3 && document.activeElement === row(right, 'Command D'), 'Moving between panels showing the same folder reorders below the target focus and preserves independent marks in both panes');
    open(right, 'Command B');
    await until(() => right.querySelector('h2').textContent === 'Command B');
    assert(command('Переместить вправо').disabled, 'A selected folder cannot be moved into itself or a selected ancestor into its descendant');
    assert(pressCommand('ArrowRight') && right.querySelector('h2').textContent === 'Command B', 'A disabled move shortcut is consumed without switching panes or moving an invalid selection');
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => right.querySelector('h2').textContent === source.title);
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, empty.title));
    open(right, empty.title);
    await until(() => right.querySelector('h2').textContent === empty.title);
    await focus(left, 'Command F');
    clickCommand('Переместить вправо');
    await until(() => matches(right, ['Command B', 'Command E', 'Target 3']) && right.querySelectorAll('input:checked').length === 3);
    assert(selectedRow(right) === parentRow(right) && document.activeElement === row(left, 'Command F'), 'An empty destination inserts the selected block at the start without moving focus away from the source pane');

    await focus(left, 'Command D');
    await mark(left, 'Command A');
    await mark(left, 'Command D');
    calls = 0;
    browser.bookmarks.move = async (...args) => {
      if (++calls === 2) throw new Error('Injected bookmark move failure');
      return originalMove(...args);
    };
    clickCommand('Переместить вправо');
    await until(() => document.querySelector('[role="alert"]') && checkbox(right, 'Command A')?.checked && !command('Переместить вправо').disabled);
    assert(!row(left, 'Command A') && checkbox(left, 'Command D').checked && matches(right, ['Command A', 'Command B', 'Command E', 'Target 3']) && right.querySelectorAll('input:checked').length === 4 && document.activeElement === row(left, 'Command D'), 'A failed batch reports the error and preserves marks for both completed and remaining moves');
    browser.bookmarks.move = originalMove;
    clickCommand('Переместить вправо');
    await until(() => matches(right, ['Command D', 'Command A', 'Command B', 'Command E', 'Target 3']) && right.querySelectorAll('input:checked').length === 5);
    assert(!document.querySelector('[role="alert"]') && !left.querySelector('input:checked') && document.activeElement === row(left, 'Command F'), 'Retrying after a partial failure moves only remaining marks, clears the error and keeps source focus at the same position');

    await focus(left, 'Command C');
    clickCommand('Переместить вправо');
    await until(() => matches(left, ['Command F']) && !command('Переместить вправо').disabled);
    assert(document.activeElement === row(left, 'Command F') && selectedRow(right) === parentRow(right) && !checkbox(right, 'Command C').checked, 'Moving the active focused row selects the remaining row at the same position and preserves destination selection');
    clickCommand('Переместить вправо');
    await until(() => matches(left, []) && command('Переместить вправо').disabled);
    assert(document.activeElement === parentRow(left) && !checkbox(right, 'Command F').checked, 'Moving the final source item falls back to the parent entry in the empty list');

    for (const input of right.querySelectorAll('input:checked')) clickCheckbox(input);
    await until(() => !right.querySelector('input:checked'));
    await focus(right, 'Command C');
    clickCommand('Переместить влево');
    await until(() => matches(left, ['Command C']) && !row(right, 'Command C') && !command('Переместить влево').disabled);
    assert(document.activeElement === row(right, 'Command D') && selectedRow(left) === parentRow(left), 'Move-left also keeps active source focus at the removed row position without changing destination selection');

    const { runBookmarkDeletionTests } = await import('./bookmark-delete.browser.js');
    results.push(...await runBookmarkDeletionTests({ fixtures, left, right, row, parentRow, checkbox, selectedRow, open, until, clickCheckbox, command, clickCommand, pressCommand, focus, mark }));
    const { runBookmarkCreationTests } = await import('./bookmark-create.browser.js');
    results.push(...await runBookmarkCreationTests({ fixtures, left, right, row, parentRow, checkbox, selectedRow, open, until, command, clickCommand, pressCommand, focus, mark }));
    for (const pane of [left, right]) {
      if (pane.querySelector('h2').textContent !== fixtures.title) parentRow(pane).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
    await until(() => left.querySelector('h2').textContent === fixtures.title && right.querySelector('h2').textContent === fixtures.title);
    for (const folder of [source, target, empty]) await browser.bookmarks.removeTree(folder.id);
    return results;
  } finally {
    release();
    browser.bookmarks.move = originalMove;
  }
}
