// Runs against the already mounted production UI in the disposable Firefox profile.
export async function runBookmarkTests() {
  const results = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
    results.push(message);
  }
  async function until(check) {
    const failure = new Error('Bookmark UI did not update');
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    failure.message += `; focused: ${document.activeElement?.textContent?.trim()}; selected: ${[...document.querySelectorAll('button[aria-pressed="true"]')].map((button) => button.textContent.trim()).join(', ')}`;
    throw failure;
  }
  const left = document.querySelector('[aria-label="Левая панель"]');
  const right = document.querySelector('[aria-label="Правая панель"]');
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')]
    .find((button) => button.textContent.includes(title));
  const parentRow = (pane) => pane.querySelector('button[aria-pressed][aria-label="На уровень выше"]');
  const selectedRow = (pane) => pane.querySelector('button[aria-pressed="true"]');
  const checkbox = (pane, title) => row(pane, title)?.parentElement.querySelector('input[type="checkbox"]');
  function clickCheckbox(input) {
    input.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    input.click();
  }
  const open = (pane, title) => row(pane, title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  function pressArrow(key, repeat = false, shiftKey = false) {
    const event = new KeyboardEvent('keydown', { key, repeat, shiftKey, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    return event;
  }
  function pressBackspace(repeat = false) {
    const event = new KeyboardEvent('keydown', { key: 'Backspace', repeat, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    return event;
  }
  const tree = await browser.bookmarks.getTree();
  const toolbar = tree[0].children.find((node) => node.id === 'toolbar_____') ?? tree[0].children[0];
  const fixtures = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Event fixtures' });
  const originalGetTree = browser.bookmarks.getTree;
  try {
    assert(![...document.querySelectorAll('button')].some((button) => button.textContent === 'Обновить'), 'The manual refresh button is removed');
    assert(!parentRow(right), 'The root list has no parent-folder entry');
    assert(selectedRow(left) && selectedRow(right), 'Both nonempty panels have a default selection');
    assert(left.contains(document.activeElement) || right.contains(document.activeElement), 'Keyboard focus stays in one of the bookmark panels');
    await until(() => row(left, 'Event fixtures'));
    open(left, 'Event fixtures');
    open(right, toolbar.title);
    await until(() => row(right, 'Event fixtures'));
    open(right, 'Event fixtures');
    await until(() => parentRow(left) && left.querySelector('h2').textContent === 'Event fixtures');
    const parent = parentRow(left);
    assert(left.querySelector('button[aria-pressed]') === parent && parent.textContent.includes('..') && parent.textContent.includes('↑') && left.querySelector('header').textContent.includes('Элементов: 0'), 'An empty folder starts with the up-arrow parent entry without counting it as a bookmark');
    assert(selectedRow(left) === parent && selectedRow(right) === parentRow(right), 'Entering a folder automatically selects its first row, including the parent entry');
    assert(!left.querySelector('input[type="checkbox"]'), 'The parent-folder entry has no selection checkbox');
    parent.focus();
    const emptyFolderBackspace = pressBackspace();
    await until(() => left.querySelector('h2').textContent === toolbar.title && document.activeElement === selectedRow(left));
    assert(emptyFolderBackspace.defaultPrevented && right.querySelector('h2').textContent === 'Event fixtures', 'Backspace in an empty folder navigates only the active panel to its parent and retains focus');
    assert(pressBackspace(true).defaultPrevented && left.querySelector('h2').textContent === toolbar.title, 'Holding Backspace does not navigate through additional ancestors');
    open(left, 'Event fixtures');
    await until(() => left.querySelector('h2').textContent === 'Event fixtures');
    parentRow(left).focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    parent.dispatchEvent(tab);
    await until(() => document.activeElement === selectedRow(right));
    assert(tab.defaultPrevented, 'Tab switches directly to the selected row in the other panel');
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    selectedRow(right).dispatchEvent(shiftTab);
    await until(() => document.activeElement === parent);
    assert(shiftTab.defaultPrevented, 'Shift+Tab switches back without leaving the panels');
    const rightArrow = pressArrow('ArrowRight');
    await until(() => document.activeElement === selectedRow(right));
    assert(rightArrow.defaultPrevented, 'ArrowRight switches focus to the selected row in the right panel');
    assert(pressArrow('ArrowRight', true).defaultPrevented && document.activeElement === selectedRow(right), 'ArrowRight in the right panel keeps focus on the same row');
    const leftArrow = pressArrow('ArrowLeft');
    await until(() => document.activeElement === parent);
    assert(leftArrow.defaultPrevented, 'ArrowLeft switches focus to the selected row in the left panel');
    assert(pressArrow('ArrowLeft', true).defaultPrevented && document.activeElement === parent, 'ArrowLeft in the left panel keeps focus on the same row');
    right.querySelector('header').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    await until(() => document.activeElement === selectedRow(right));
    assert(true, 'Clicking a pane heading activates its selected row');
    parent.click();
    await until(() => parent.getAttribute('aria-pressed') === 'true');
    const transient = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Transient parent fixture' });
    await until(() => row(left, transient.title));
    assert(parentRow(left).getAttribute('aria-pressed') === 'true', 'An automatic tree refresh preserves selection of the parent entry');
    await browser.bookmarks.remove(transient.id);
    await until(() => !row(left, transient.title));
    parentRow(left).focus();
    parentRow(left).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until(() => left.querySelector('h2').textContent === toolbar.title);
    assert(document.activeElement === selectedRow(left), 'Navigation keeps keyboard focus on the default selection in the active panel');
    assert(right.querySelector('h2').textContent === 'Event fixtures', 'Enter on the selected parent entry navigates only its own panel');
    open(left, 'Event fixtures');

    const item = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Created by Firefox', url: 'about:blank' });
    await until(() => row(left, item.title) && row(right, item.title));
    assert(true, 'Creating a bookmark updates both panels without a manual refresh');
    const checkedPeer = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Checkbox peer', url: 'about:blank' });
    await until(() => row(left, checkedPeer.title) && row(right, checkedPeer.title));
    const originalCreateTab = browser.tabs.create;
    const opened = [];
    browser.tabs.create = async (options) => { opened.push(options.url); return { id: -1 }; };
    try {
      const bookmarkRow = row(left, item.title);
      assert(bookmarkRow.parentElement.querySelectorAll('button').length === 1, 'Bookmark rows have no separate open button');
      const itemCheckbox = checkbox(left, item.title);
      const peerCheckbox = checkbox(left, checkedPeer.title);
      assert(itemCheckbox && !itemCheckbox.checked && !checkbox(right, item.title).checked, 'Bookmark selection checkboxes start unchecked in both panels');
      assert(bookmarkRow.parentElement.firstElementChild === itemCheckbox && !itemCheckbox.closest('button'), 'The checkbox is on the left, beside the row button rather than nested inside it');
      parentRow(left).focus({ preventScroll: true });
      await until(() => document.activeElement === parentRow(left));
      clickCheckbox(itemCheckbox);
      await until(() => itemCheckbox.checked);
      assert(document.activeElement === parentRow(left) && selectedRow(left) === parentRow(left) && opened.length === 0, 'Checking a bookmark preserves row focus and does not open it');
      const checkedColor = getComputedStyle(bookmarkRow.parentElement).backgroundColor;
      const focusColor = getComputedStyle(parentRow(left).parentElement).backgroundColor;
      const colorStrength = (color) => color.match(/[\d.]+/g).slice(0, 3).reduce((sum, channel) => sum + 255 - Number(channel), 0);
      assert(checkedColor !== focusColor && colorStrength(checkedColor) > 0 && colorStrength(checkedColor) < colorStrength(focusColor), 'A checked row has a different, softer background than the focused row');
      clickCheckbox(peerCheckbox);
      await until(() => peerCheckbox.checked);
      assert(left.querySelectorAll('input[type="checkbox"]:checked').length === 2 && !right.querySelector('input[type="checkbox"]:checked'), 'Multiple bookmarks can be checked independently in each panel');
      itemCheckbox.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      assert(opened.length === 0, 'Double-clicking a checkbox does not open the bookmark');
      clickCheckbox(peerCheckbox);
      await until(() => !peerCheckbox.checked && getComputedStyle(row(left, checkedPeer.title).parentElement).backgroundColor !== checkedColor);
      assert(itemCheckbox.checked, 'Unchecking one bookmark removes its soft background and preserves other checks');
      clickCheckbox(peerCheckbox);
      await until(() => peerCheckbox.checked);
      bookmarkRow.focus();
      await until(() => bookmarkRow.getAttribute('aria-pressed') === 'true' && document.activeElement === bookmarkRow);
      assert(selectedRow(left) === bookmarkRow, 'Keyboard focus selects its row without requiring a click');
      assert(itemCheckbox.checked && getComputedStyle(bookmarkRow.parentElement).backgroundColor === focusColor, 'The focus background takes priority while the bookmark remains checked');
      bookmarkRow.click();
      await until(() => bookmarkRow.getAttribute('aria-pressed') === 'true');
      assert(opened.length === 0, 'A single click selects a bookmark without opening it');
      bookmarkRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      assert(opened.length === 1 && opened[0] === item.url, 'A double click opens the bookmark exactly once');
      bookmarkRow.focus();
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      bookmarkRow.dispatchEvent(enter);
      assert(enter.defaultPrevented && opened.length === 2 && opened[1] === item.url, 'Enter opens the selected bookmark and suppresses native button activation');
      bookmarkRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }));
      assert(opened.length === 2, 'Holding Enter does not open additional tabs');
      row(right, item.title).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      assert(opened.length === 2, 'Enter does not open an unselected bookmark in the other panel');
      const rightSelection = selectedRow(right);
      pressArrow('ArrowRight');
      await until(() => document.activeElement === rightSelection);
      assert(selectedRow(left) === bookmarkRow && selectedRow(right) === rightSelection, 'Switching right preserves the separate selections in both panels');
      pressArrow('ArrowLeft');
      await until(() => document.activeElement === bookmarkRow);
      assert(selectedRow(left) === bookmarkRow && opened.length === 2, 'Switching left restores the previously selected bookmark without opening it');
      assert(itemCheckbox.checked && peerCheckbox.checked, 'Keyboard focus and pane changes preserve checked bookmarks');
    } finally {
      browser.tabs.create = originalCreateTab;
    }
    await browser.bookmarks.update(item.id, { title: 'Renamed by Firefox', url: 'about:config' });
    await until(() => row(left, 'Renamed by Firefox')?.textContent.includes('about:config') && row(right, 'Renamed by Firefox')?.textContent.includes('about:config'));
    assert(row(left, 'Renamed by Firefox').getAttribute('aria-pressed') === 'true', 'Title and URL changes preserve the selected bookmark');
    assert(checkbox(left, 'Renamed by Firefox').checked, 'Title and URL changes also preserve the checkbox selection');
    await browser.bookmarks.update(fixtures.id, { title: 'Renamed folder' });
    await until(() => left.querySelector('h2').textContent === 'Renamed folder' && right.querySelector('h2').textContent === 'Renamed folder');
    assert(true, 'Renaming an open folder updates both pane headings');

    const destination = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Destination' });
    const second = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Second bookmark', url: 'about:blank' });
    await until(() => row(left, 'Destination') && row(right, 'Second bookmark'));
    const folderCheckbox = checkbox(left, 'Destination');
    assert(folderCheckbox && !folderCheckbox.checked && !checkbox(right, 'Destination').checked, 'Folder rows have unchecked selection checkboxes in both panels');
    const focusedBeforeFolderCheck = document.activeElement;
    clickCheckbox(folderCheckbox);
    await until(() => folderCheckbox.checked);
    assert(document.activeElement === focusedBeforeFolderCheck && left.querySelector('h2').textContent === 'Renamed folder', 'Checking a folder preserves focus without navigating into it');
    const folderBackground = getComputedStyle(row(left, 'Destination').parentElement).backgroundColor;
    assert(folderBackground !== getComputedStyle(focusedBeforeFolderCheck.parentElement).backgroundColor && checkbox(left, 'Renamed by Firefox').checked && !checkbox(right, 'Destination').checked, 'Folders and bookmarks can be checked together with independent pane selections and soft folder highlighting');
    await browser.bookmarks.move(checkedPeer.id, { parentId: destination.id });
    await until(() => !row(left, checkedPeer.title));
    await browser.bookmarks.move(checkedPeer.id, { parentId: fixtures.id });
    await until(() => checkbox(left, checkedPeer.title));
    assert(!checkbox(left, checkedPeer.title).checked, 'A bookmark leaving the current folder loses its checkbox selection');
    assert(folderCheckbox.checked, 'Folder checkbox selection survives automatic tree updates');
    row(right, 'Destination').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => right.querySelector('h2').textContent === 'Destination');
    assert(true, 'A double click opens a folder in its own panel');
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => right.querySelector('h2').textContent === 'Renamed folder');
    assert(left.querySelector('h2').textContent === 'Renamed folder', 'A double click on the parent entry returns to the parent folder');
    open(right, 'Destination');
    parentRow(left).click();
    await until(() => parentRow(left).getAttribute('aria-pressed') === 'true');
    assert(!document.querySelector('[aria-label="Перемещение между панелями"]') && !document.querySelector('[aria-label="Переместить выбранное вправо"]') && !document.querySelector('[aria-label="Переместить выбранное влево"]'), 'The buttons between panels are removed');
    row(left, 'Renamed by Firefox').click();
    row(left, 'Renamed by Firefox').focus();
    await browser.bookmarks.move(item.id, { parentId: destination.id });
    await until(() => !row(left, 'Renamed by Firefox') && row(right, 'Renamed by Firefox'));
    await until(() => document.activeElement === parentRow(left));
    assert(selectedRow(left) === parentRow(left) && left.querySelector('footer').textContent.trim() === `${toolbar.title} / Renamed folder`, 'An external move selects and focuses the first remaining row while the footer keeps the current folder path');
    await browser.bookmarks.move(second.id, { index: 0 });
    await until(() => left.querySelector('button[aria-pressed]:not([aria-label="На уровень выше"])').textContent.includes('Second bookmark'));
    assert(true, 'Moving within a folder updates the displayed order');
    row(right, 'Renamed by Firefox').focus();
    await until(() => selectedRow(right) === row(right, 'Renamed by Firefox'));
    await browser.bookmarks.remove(item.id);
    await until(() => !row(right, 'Renamed by Firefox'));
    assert(true, 'Deleting a bookmark removes it from the open panel');
    await until(() => document.activeElement === parentRow(right));
    assert(selectedRow(right) === parentRow(right), 'Deleting the focused bookmark restores selection and focus to the parent entry');

    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'Focus fixture';
    document.body.append(outsideButton);
    try {
      outsideButton.focus();
      assert(document.activeElement === selectedRow(right), 'Attempting to focus an outside control immediately returns focus to the active panel');
      let clicks = 0;
      outsideButton.onclick = () => clicks++;
      outsideButton.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
      outsideButton.click();
      assert(clicks === 1 && document.activeElement === selectedRow(right), 'Outside buttons remain clickable while keyboard focus stays in the active panel');
      selectedRow(right).blur();
      await until(() => document.activeElement === selectedRow(right));
      assert(true, 'Losing focus without a new target restores the active row');
      await browser.bookmarks.update(second.id, { title: 'Updated without focus' });
      await until(() => row(left, 'Updated without focus'));
      assert(document.activeElement === selectedRow(right), 'Background updates preserve focus in the active panel');
    } finally {
      outsideButton.remove();
    }

    // Hold one old snapshot while another change arrives, exposing lost-event
    // and overlapping-read bugs without relying on network or machine timing.
    let release;
    let captured = false;
    let reads = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = new Promise((resolve) => { release = resolve; });
    browser.bookmarks.getTree = async () => {
      reads++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const snapshot = await originalGetTree();
        if (reads === 1) { captured = true; await gate; }
        return snapshot;
      } finally { inFlight--; }
    };
    try {
      await browser.bookmarks.update(second.id, { title: 'First snapshot' });
      await until(() => captured);
      await browser.bookmarks.update(second.id, { title: 'Latest snapshot' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      release();
      await until(() => row(left, 'Latest snapshot'));
      assert(reads >= 2 && maxInFlight === 1, 'Changes during an async read are processed in another pass without overlapping reads');
    } finally {
      release();
      browser.bookmarks.getTree = originalGetTree;
    }

    row(left, 'Latest snapshot').focus();
    await until(() => document.activeElement === row(left, 'Latest snapshot'));
    const otherPaneTitle = right.querySelector('h2').textContent;
    const bookmarkBackspace = pressBackspace();
    await until(() => left.querySelector('h2').textContent === toolbar.title && document.activeElement === selectedRow(left));
    assert(bookmarkBackspace.defaultPrevented && right.querySelector('h2').textContent === otherPaneTitle, 'Backspace on a focused bookmark navigates its panel to the parent instead of opening the bookmark');
    open(left, 'Renamed folder');
    await until(() => left.querySelector('h2').textContent === 'Renamed folder');

    const navigation = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Keyboard navigation fixtures' });
    await browser.bookmarks.create({ parentId: navigation.id, title: 'Keyboard child folder' });
    await browser.bookmarks.create({ parentId: navigation.id, type: 'separator' });
    await Promise.all(Array.from({ length: 20 }, (_, index) => browser.bookmarks.create({
      parentId: navigation.id, title: `Keyboard bookmark ${index}`, url: 'about:blank'
    })));
    await until(() => row(left, navigation.title));
    open(left, navigation.title);
    await until(() => row(left, 'Keyboard bookmark 19'));
    const navigationList = parentRow(left).closest('[tabindex="-1"]');
    const originalListStyle = navigationList.getAttribute('style');
    try {
      navigationList.style.flex = 'none';
      navigationList.style.height = '160px';
      const navigationRows = [...navigationList.querySelectorAll('button[aria-pressed]')];
      const navigationChecks = navigationRows.map((button) => button.parentElement.querySelector('input[type="checkbox"]'));
      const untilFocused = (index) => until(() => selectedRow(left) === navigationRows[index] && document.activeElement === navigationRows[index]);
      navigationRows[0].focus({ preventScroll: true });
      await untilFocused(0);
      const initialScroll = navigationList.scrollTop;
      assert(pressArrow('ArrowUp').defaultPrevented && document.activeElement === navigationRows[0] && navigationList.scrollTop === initialScroll, 'ArrowUp at the first row neither wraps nor scrolls');
      const down = pressArrow('ArrowDown');
      await untilFocused(1);
      assert(down.defaultPrevented, 'ArrowDown moves focus from the parent entry to the next row');
      assert(navigationList.scrollTop === initialScroll, 'Moving focus to an already visible row does not scroll the list');
      pressArrow('ArrowDown', true);
      await untilFocused(2);
      assert(document.activeElement === navigationRows[2], 'Repeated ArrowDown moves focus to a separator like any other row');
      assert(!navigationRows[2].parentElement.querySelector('input[type="checkbox"]'), 'Separator rows have no bookmark selection checkbox');
      pressArrow('ArrowUp');
      await untilFocused(1);
      assert(document.activeElement === navigationRows[1], 'ArrowUp moves selection and focus to the previous row');

      const rowVisible = (button) => {
        const bounds = button.getBoundingClientRect();
        const viewport = navigationList.getBoundingClientRect();
        return bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.top + navigationList.clientHeight + 1;
      };
      const rightList = parentRow(right).closest('[tabindex="-1"]');
      const rightScroll = rightList.scrollTop;
      const pageScroll = window.scrollY;
      let preservedVisibleScroll = true;
      let revealedFocusedRows = true;
      let minimalScroll = true;
      for (let index = 2; index < navigationRows.length; index++) {
        const before = navigationList.scrollTop;
        const bounds = navigationRows[index].getBoundingClientRect();
        const viewport = navigationList.getBoundingClientRect();
        const fullyVisible = bounds.top >= viewport.top + 6 && bounds.bottom <= viewport.top + navigationList.clientHeight - 6;
        pressArrow('ArrowDown', true);
        await untilFocused(index);
        if (fullyVisible && navigationList.scrollTop !== before) preservedVisibleScroll = false;
        if (!rowVisible(navigationRows[index])) revealedFocusedRows = false;
        if (navigationList.scrollTop - before > bounds.height + 1) minimalScroll = false;
      }
      assert(preservedVisibleScroll && minimalScroll, 'Arrow navigation preserves scroll for visible rows and reveals hidden rows with the minimum movement');
      assert(revealedFocusedRows && navigationList.scrollTop > initialScroll, 'The viewport follows focused rows down a long list');
      const lastScroll = navigationList.scrollTop;
      assert(pressArrow('ArrowDown').defaultPrevented && document.activeElement === navigationRows.at(-1) && navigationList.scrollTop === lastScroll, 'ArrowDown at the last row neither wraps nor scrolls');
      navigationRows[0].focus({ preventScroll: true });
      await untilFocused(0);
      assert(rowVisible(navigationRows[0]) && navigationList.scrollTop < lastScroll, 'Focusing a row without arrow keys also scrolls it into view');
      navigationRows.at(-1).focus({ preventScroll: true });
      await untilFocused(navigationRows.length - 1);
      for (let index = navigationRows.length - 2; index >= 0; index--) {
        pressArrow('ArrowUp', true);
        await untilFocused(index);
        if (!rowVisible(navigationRows[index])) revealedFocusedRows = false;
      }
      assert(revealedFocusedRows && rowVisible(navigationRows[0]), 'The viewport follows focused rows back up the list');
      assert(rightList.scrollTop === rightScroll && window.scrollY === pageScroll, 'Focus-driven scrolling affects only the active list, not the other panel or page');
      const end = pressArrow('End');
      await untilFocused(navigationRows.length - 1);
      assert(end.defaultPrevented && rowVisible(document.activeElement), 'End focuses and reveals the last row');
      const home = pressArrow('Home');
      await untilFocused(0);
      assert(home.defaultPrevented && rowVisible(document.activeElement), 'Home focuses and reveals the first row');
      const insertParent = pressArrow('Insert');
      await untilFocused(1);
      assert(insertParent.defaultPrevented && !navigationList.querySelector('input:checked'), 'Insert on the parent entry advances without marking it');
      pressArrow('Insert');
      await untilFocused(2);
      assert(checkbox(left, 'Keyboard child folder').checked, 'Insert marks a folder and advances focus to the next row');
      pressArrow('Insert');
      await untilFocused(3);
      assert(navigationList.querySelectorAll('input:checked').length === 1, 'Insert on a separator advances without adding a mark');
      pressArrow('Insert');
      await untilFocused(4);
      assert(navigationChecks[3].checked, 'Insert marks a bookmark and advances focus');
      pressArrow('End');
      await untilFocused(navigationRows.length - 1);
      pressArrow('Insert');
      await until(() => navigationChecks.at(-1).checked);
      assert(document.activeElement === navigationRows.at(-1), 'Insert marks the final row without wrapping focus');
      pressArrow('Insert');
      await until(() => !navigationChecks.at(-1).checked);
      assert(document.activeElement === navigationRows.at(-1), 'Repeating Insert removes the mark while retaining focus at the list boundary');
      pressArrow('Insert');
      await until(() => navigationChecks.at(-1).checked);
      pressArrow('Home');
      await untilFocused(0);
      pressArrow('ArrowDown', false, true);
      await untilFocused(1);
      assert(navigationList.querySelectorAll('input:checked').length === 3, 'Shift+Down on the parent entry advances without changing marks');
      pressArrow('ArrowDown', false, true);
      await untilFocused(2);
      assert(!checkbox(left, 'Keyboard child folder').checked, 'Shift+Down removes the mark from an already selected folder and advances focus');
      pressArrow('ArrowDown', false, true);
      await untilFocused(3);
      assert(navigationList.querySelectorAll('input:checked').length === 2, 'Shift+Down advances past separators without marking them');
      pressArrow('ArrowDown', false, true);
      await untilFocused(4);
      pressArrow('ArrowDown', true, true);
      await untilFocused(5);
      assert(!navigationChecks[3].checked && navigationChecks[4].checked, 'Shift+Down toggles each visited bookmark and advances one row');
      pressArrow('ArrowUp', false, true);
      await untilFocused(4);
      assert(navigationChecks[5].checked, 'Shift+Up marks the current bookmark and moves to the preceding row');
      navigationRows[9].focus({ preventScroll: true });
      await untilFocused(9);
      const shiftHome = pressArrow('Home', false, true);
      await untilFocused(0);
      assert(shiftHome.defaultPrevented && navigationChecks[1].checked && navigationChecks[3].checked && !navigationChecks[4].checked && !navigationChecks[5].checked && navigationChecks.slice(6, 10).every((input) => input.checked) && !navigationChecks[10].checked && navigationChecks.at(-1).checked, 'Shift+Home toggles the inclusive range to the first row and preserves marks outside that range');
      navigationRows[9].focus({ preventScroll: true });
      await untilFocused(9);
      const shiftEnd = pressArrow('End', false, true);
      await untilFocused(navigationRows.length - 1);
      assert(shiftEnd.defaultPrevented && !navigationChecks[9].checked && navigationChecks.slice(10, -1).every((input) => input.checked) && !navigationChecks.at(-1).checked && navigationList.querySelectorAll('input:checked').length === 17 && left.querySelector('header').textContent.includes('Выбрано: 17') && rowVisible(document.activeElement), 'Shift+End toggles the inclusive range to the last row, updates the count and reveals the focused row');
      navigationRows.at(-2).focus({ preventScroll: true });
      await untilFocused(navigationRows.length - 2);
      pressArrow('End', false, true);
      await untilFocused(navigationRows.length - 1);
      assert(!navigationChecks.at(-2).checked && navigationChecks.at(-1).checked && navigationList.querySelectorAll('input:checked').length === 17, 'A mixed range updates both marks even when the total selected count remains unchanged');

      for (const input of navigationChecks.filter((input) => input?.checked)) {
        clickCheckbox(input);
        await until(() => !input.checked);
      }
      await until(() => !navigationList.querySelector('input:checked'));
      const shiftClick = (target, button = 0) => {
        target.dispatchEvent(new MouseEvent('mousedown', { button, shiftKey: true, bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { button, shiftKey: true, bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('click', { button, shiftKey: true, bubbles: true, cancelable: true }));
      };
      clickCheckbox(navigationChecks.at(-1));
      navigationRows[1].focus({ preventScroll: true });
      await untilFocused(1);
      shiftClick(navigationRows[5]);
      await untilFocused(5);
      assert([1, 3, 4, 5].every((index) => navigationChecks[index].checked) && navigationChecks.at(-1).checked && navigationList.querySelectorAll('input:checked').length === 5, 'Shift-click selects an inclusive range containing folders and bookmarks, skips separators, and preserves outside marks');
      shiftClick(navigationRows[1]);
      await untilFocused(1);
      assert(navigationList.querySelectorAll('input:checked').length === 1 && navigationChecks.at(-1).checked, 'Repeating Shift-click over the same range in reverse removes its marks and preserves outside marks');
      shiftClick(navigationRows[5]);
      await untilFocused(5);
      assert([1, 3, 4, 5].every((index) => navigationChecks[index].checked), 'Shift-click restores the range after its marks were removed');
      shiftClick(navigationRows[3]);
      await untilFocused(3);
      assert(navigationChecks[1].checked && [3, 4, 5].every((index) => !navigationChecks[index].checked), 'An upward Shift-click toggles both boundaries and all intermediate items off');
      shiftClick(navigationRows[3]);
      await until(() => navigationChecks[3].checked);
      shiftClick(navigationRows[3]);
      await until(() => !navigationChecks[3].checked);
      assert(document.activeElement === navigationRows[3], 'Shift-clicking the focused row twice toggles its mark on and off without moving focus');
      shiftClick(navigationChecks[7]);
      await untilFocused(7);
      assert(navigationChecks.slice(3, 8).every((input) => input.checked), 'Shift-clicking a checkbox selects the inclusive range without unchecking its endpoint');
      shiftClick(navigationRows[9].parentElement);
      await untilFocused(9);
      assert(!navigationChecks[7].checked && navigationChecks[8].checked && navigationChecks[9].checked, 'Shift-clicking row padding toggles an already marked boundary off and unmarked rows on');
      const mixedCount = navigationList.querySelectorAll('input:checked').length;
      shiftClick(navigationRows[10]);
      await untilFocused(10);
      assert(!navigationChecks[9].checked && navigationChecks[10].checked && navigationList.querySelectorAll('input:checked').length === mixedCount, 'Shift-click updates a mixed range even when the selected count stays the same');
      const countBeforeSecondaryClick = navigationList.querySelectorAll('input:checked').length;
      shiftClick(navigationRows[12], 2);
      assert(navigationList.querySelectorAll('input:checked').length === countBeforeSecondaryClick && !navigationChecks[12].checked, 'Shift with the secondary mouse button does not select a range');
      for (const input of navigationChecks.filter((input) => input?.checked)) {
        clickCheckbox(input);
        await until(() => !input.checked);
      }
      await until(() => !navigationList.querySelector('input:checked'));
      navigationRows[3].focus({ preventScroll: true });
      await untilFocused(3);
      shiftClick(navigationRows[0]);
      await untilFocused(0);
      assert(navigationChecks[1].checked && navigationChecks[3].checked && navigationList.querySelectorAll('input:checked').length === 2, 'The parent entry can end an inclusive range without marking the parent or separator');
      shiftClick(navigationRows[2]);
      await untilFocused(2);
      assert(!navigationChecks[1].checked && navigationChecks[3].checked && navigationList.querySelectorAll('input:checked').length === 1, 'A separator can end a range and toggle marked folders off without receiving a mark');
    } finally {
      if (originalListStyle === null) navigationList.removeAttribute('style');
      else navigationList.setAttribute('style', originalListStyle);
      parentRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await until(() => left.querySelector('h2').textContent === 'Renamed folder');
      await browser.bookmarks.removeTree(navigation.id);
    }

    const history = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Folder state history' });
    const historyItem = await browser.bookmarks.create({ parentId: history.id, title: 'Remembered parent bookmark', url: 'about:blank' });
    const historyChild = await browser.bookmarks.create({ parentId: history.id, title: 'Remembered child folder' });
    const childItem = await browser.bookmarks.create({ parentId: historyChild.id, title: 'Remembered child bookmark', url: 'about:blank' });
    const grandchild = await browser.bookmarks.create({ parentId: historyChild.id, title: 'History grandchild' });
    await until(() => row(left, history.title));
    open(left, history.title);
    await until(() => row(left, historyItem.title));
    row(left, historyItem.title).focus();
    await until(() => selectedRow(left) === row(left, historyItem.title) && document.activeElement === row(left, historyItem.title));
    clickCheckbox(checkbox(left, historyItem.title));
    await until(() => checkbox(left, historyItem.title).checked);
    clickCheckbox(checkbox(left, historyChild.title));
    await until(() => checkbox(left, historyItem.title).checked && checkbox(left, historyChild.title).checked);
    open(left, historyChild.title);
    await until(() => row(left, childItem.title) && document.activeElement === parentRow(left));
    assert(selectedRow(left) === parentRow(left) && !left.querySelector('input:checked'), 'Entering a new child folder starts on its first row with its own selection state');
    row(left, childItem.title).focus();
    await until(() => selectedRow(left) === row(left, childItem.title) && document.activeElement === row(left, childItem.title));
    clickCheckbox(checkbox(left, childItem.title));
    await until(() => checkbox(left, childItem.title).checked);
    open(left, grandchild.title);
    await until(() => left.querySelector('h2').textContent === grandchild.title);
    pressBackspace();
    await until(() => document.activeElement === row(left, childItem.title));
    assert(checkbox(left, childItem.title).checked && left.querySelector('header').textContent.includes('Выбрано: 1'), 'Returning from a grandchild restores the child folder focus, checkbox selection and count');
    parentRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => document.activeElement === row(left, historyItem.title));
    assert(checkbox(left, historyItem.title).checked && checkbox(left, historyChild.title).checked && left.querySelector('header').textContent.includes('Выбрано: 2'), 'Returning to the parent restores its separate focus and bookmark and folder selections');
    open(left, historyChild.title);
    await until(() => row(left, childItem.title) && document.activeElement === parentRow(left));
    assert(checkbox(left, childItem.title).checked && selectedRow(left) === parentRow(left), 'Re-entering a previously visited child restores checks but resets focus to the first row');
    pressBackspace();
    await until(() => document.activeElement === row(left, historyItem.title));

    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => row(right, history.title));
    open(right, history.title);
    await until(() => row(right, historyItem.title));
    assert(!right.querySelector('input:checked') && checkbox(left, historyItem.title).checked, 'The same folder keeps independent history states in the two panels');
    open(left, historyChild.title);
    await until(() => row(left, childItem.title));
    await browser.bookmarks.remove(historyItem.id);
    await until(() => !row(right, historyItem.title));
    parentRow(left).focus();
    pressBackspace();
    await until(() => left.querySelector('h2').textContent === history.title && document.activeElement === parentRow(left));
    assert(!row(left, historyItem.title) && checkbox(left, historyChild.title).checked && left.querySelector('header').textContent.includes('Выбрано: 1'), 'Restoring a folder removes deleted checks and uses the first row when the remembered focus was deleted');
    await browser.bookmarks.removeTree(historyChild.id);
    await until(() => !row(left, historyChild.title));
    assert(!left.querySelector('header').textContent.includes('Выбрано:'), 'The selected count disappears when all restored marked items are removed');
    parentRow(left).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    parentRow(right).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => left.querySelector('h2').textContent === 'Renamed folder' && right.querySelector('h2').textContent === 'Renamed folder');
    await browser.bookmarks.removeTree(history.id);

    const { runBookmarkCommandTests } = await import('./bookmark-commands.browser.js');
    results.push(...await runBookmarkCommandTests({ fixtures: { ...fixtures, title: 'Renamed folder' }, left, right, row, parentRow, checkbox, selectedRow, open, until, clickCheckbox }));

    // A synthetic empty root covers a genuinely empty list without the virtual
    // parent entry; bookmark events still drive every UI update.
    selectedRow(left).focus();
    browser.bookmarks.getTree = async () => [{ ...tree[0], children: [] }];
    try {
      await browser.bookmarks.update(second.id, { title: 'Empty root fixture' });
      await until(() => !left.querySelector('button[aria-pressed]') && !right.querySelector('button[aria-pressed]'));
      assert(!selectedRow(left) && !selectedRow(right), 'A completely empty list has no selected row');
      assert(left.contains(document.activeElement), 'The active list retains keyboard focus while it is empty');
      const emptyFocus = document.activeElement;
      assert(pressBackspace().defaultPrevented && document.activeElement === emptyFocus && left.querySelector('h2').textContent === 'Все закладки', 'Backspace in a completely empty root preserves focus and suppresses browser navigation');
      assert(pressArrow('ArrowUp').defaultPrevented && pressArrow('ArrowDown').defaultPrevented && document.activeElement === emptyFocus, 'Arrow keys in an empty list suppress native scrolling and retain focus');
      assert(['Insert', 'Home', 'End'].every((key) => pressArrow(key).defaultPrevented && pressArrow(key, false, true).defaultPrevented) && document.activeElement === emptyFocus, 'Selection and boundary navigation keys retain focus and suppress native actions in an empty list');
      const emptyRight = pressArrow('ArrowRight');
      await until(() => right.contains(document.activeElement));
      assert(emptyRight.defaultPrevented, 'ArrowRight can activate a completely empty right panel');
      const emptyLeft = pressArrow('ArrowLeft');
      await until(() => left.contains(document.activeElement));
      assert(emptyLeft.defaultPrevented, 'ArrowLeft can activate a completely empty left panel');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await until(() => right.contains(document.activeElement));
      assert(true, 'Tab can activate a completely empty panel');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await until(() => left.contains(document.activeElement));
    } finally {
      browser.bookmarks.getTree = originalGetTree;
    }
    await browser.bookmarks.update(second.id, { title: 'Populated root fixture' });
    await until(() => selectedRow(left) && selectedRow(right) && document.activeElement === selectedRow(left));
    assert(selectedRow(left) === left.querySelector('button[aria-pressed]') && selectedRow(right) === right.querySelector('button[aria-pressed]'), 'Rows appearing in empty lists automatically receive a default selection and restore focus in the active panel');
    open(left, toolbar.title);
    await until(() => row(left, 'Renamed folder'));
    open(left, 'Renamed folder');
    open(right, toolbar.title);
    await until(() => row(right, 'Renamed folder'));
    open(right, 'Renamed folder');
    await until(() => left.querySelector('h2').textContent === 'Renamed folder' && right.querySelector('h2').textContent === 'Renamed folder');
    await browser.bookmarks.removeTree(fixtures.id);
    await until(() => left.querySelector('h2').textContent === 'Все закладки' && right.querySelector('h2').textContent === 'Все закладки');
    assert(true, 'Deleting an open folder returns both affected panels to the root');
    assert(!parentRow(left) && !parentRow(right), 'Parent entries disappear from both panels after returning to the root');
    assert(pressBackspace().defaultPrevented && left.querySelector('h2').textContent === 'Все закладки' && right.querySelector('h2').textContent === 'Все закладки', 'Backspace at a populated root leaves both panels in place and suppresses browser navigation');
    return results;
  } finally {
    browser.bookmarks.getTree = originalGetTree;
    await browser.bookmarks.removeTree(fixtures.id).catch(() => {});
  }
}
