// Runs against the already mounted production UI in the disposable Firefox profile.
export async function runBookmarkTests() {
  const results = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
    results.push(message);
  }
  async function until(check) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Bookmark UI did not update');
  }
  const left = document.querySelector('[aria-label="Левая панель"]');
  const right = document.querySelector('[aria-label="Правая панель"]');
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')]
    .find((button) => button.textContent.includes(title));
  const open = (pane, title) => row(pane, title).parentElement.querySelector('button:last-child').click();
  const tree = await browser.bookmarks.getTree();
  const toolbar = tree[0].children.find((node) => node.id === 'toolbar_____') ?? tree[0].children[0];
  const fixtures = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Event fixtures' });
  const originalGetTree = browser.bookmarks.getTree;
  try {
    assert(![...document.querySelectorAll('button')].some((button) => button.textContent === 'Обновить'), 'The manual refresh button is removed');
    await until(() => row(left, 'Event fixtures'));
    open(left, 'Event fixtures');
    open(right, toolbar.title);
    await until(() => row(right, 'Event fixtures'));
    open(right, 'Event fixtures');

    const item = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Created by Firefox', url: 'about:blank' });
    await until(() => row(left, item.title) && row(right, item.title));
    assert(true, 'Creating a bookmark updates both panels without a manual refresh');
    row(left, item.title).click();
    await browser.bookmarks.update(item.id, { title: 'Renamed by Firefox', url: 'about:config' });
    await until(() => row(left, 'Renamed by Firefox')?.textContent.includes('about:config') && row(right, 'Renamed by Firefox')?.textContent.includes('about:config'));
    assert(row(left, 'Renamed by Firefox').getAttribute('aria-pressed') === 'true', 'Title and URL changes preserve the selected bookmark');
    await browser.bookmarks.update(fixtures.id, { title: 'Renamed folder' });
    await until(() => left.querySelector('h2').textContent === 'Renamed folder' && right.querySelector('h2').textContent === 'Renamed folder');
    assert(true, 'Renaming an open folder updates both pane headings');

    const destination = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Destination' });
    const second = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Second bookmark', url: 'about:blank' });
    await until(() => row(left, 'Destination') && row(right, 'Second bookmark'));
    open(right, 'Destination');
    await browser.bookmarks.move(item.id, { parentId: destination.id });
    await until(() => !row(left, 'Renamed by Firefox') && row(right, 'Renamed by Firefox'));
    assert(left.querySelector('footer').textContent.includes('Выберите элемент'), 'Moving a bookmark updates both folders and clears selection in its old folder');
    await browser.bookmarks.move(second.id, { index: 0 });
    await until(() => left.querySelector('button[aria-pressed]').textContent.includes('Second bookmark'));
    assert(true, 'Moving within a folder updates the displayed order');
    await browser.bookmarks.remove(item.id);
    await until(() => !row(right, 'Renamed by Firefox'));
    assert(true, 'Deleting a bookmark removes it from the open panel');

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
    await browser.bookmarks.removeTree(fixtures.id);
    await until(() => left.querySelector('h2').textContent === 'Все закладки' && right.querySelector('h2').textContent === 'Все закладки');
    assert(true, 'Deleting an open folder returns both affected panels to the root');
    return results;
  } finally {
    browser.bookmarks.getTree = originalGetTree;
    await browser.bookmarks.removeTree(fixtures.id).catch(() => {});
  }
}
