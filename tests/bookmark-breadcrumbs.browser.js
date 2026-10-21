export async function runBreadcrumbTests({ fixtures, left, right, until }) {
  const results = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
    results.push(message);
  };
  const row = (pane, title) => [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.querySelector('.font-semibold')?.textContent.trim() === title);
  const checkbox = (pane, title) => row(pane, title)?.parentElement.querySelector('input');
  const crumb = (pane, id) => pane.querySelector(`[data-bookmark-breadcrumb="${id}"]`);
  const path = (pane) => pane.querySelector('.folder-path');
  async function open(pane, folder) {
    await until(() => row(pane, folder.title));
    row(pane, folder.title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => pane.querySelector('h2').textContent === folder.title && crumb(pane, folder.parentId) && !crumb(pane, folder.id));
  }
  async function clickCrumb(pane, folder) {
    const button = crumb(pane, folder.id);
    button.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    button.click();
    await until(() => pane.querySelector('h2').textContent === folder.title && !crumb(pane, folder.id) && pane.querySelector('[data-bookmark-list]').contains(document.activeElement));
  }
  const top = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Breadcrumb / ancestor' });
  const middle = await browser.bookmarks.create({ parentId: top.id, title: 'Repeated name' });
  const middleBookmark = await browser.bookmarks.create({ parentId: middle.id, title: 'Breadcrumb middle bookmark', url: 'https://example.test/middle' });
  const leaf = await browser.bookmarks.create({ parentId: middle.id, title: middle.title });
  const leafBookmark = await browser.bookmarks.create({ parentId: leaf.id, title: 'Breadcrumb leaf bookmark', url: 'https://example.test/leaf' });
  let container;
  try {
    for (const pane of [left, right]) {
      await open(pane, top);
      await open(pane, middle);
      if (pane === left) checkbox(pane, middleBookmark.title).click();
      row(pane, leaf.title).focus();
      await until(() => row(pane, leaf.title).getAttribute('aria-pressed') === 'true');
      await open(pane, leaf);
    }
    const leftPath = path(left);
    assert(crumb(left, top.id)?.textContent === top.title && crumb(left, middle.id)?.textContent === middle.title && !crumb(left, leaf.id) && leftPath.querySelector('[aria-current="page"]').textContent === leaf.title, 'Breadcrumbs use folder IDs and make only ancestors clickable, including repeated names and names containing slashes');
    assert(leftPath.getAttribute('title').endsWith(`${top.title} / ${middle.title} / ${leaf.title}`) && leftPath.textContent.trim() === leftPath.getAttribute('title'), 'Clickable breadcrumbs preserve the complete folder path and separators in their original order');
    checkbox(left, leafBookmark.title).click();
    row(right, leafBookmark.title).focus();
    await until(() => document.activeElement === row(right, leafBookmark.title));
    path(right).querySelector('[aria-current="page"]').click();
    assert(right.querySelector('h2').textContent === leaf.title && document.activeElement === row(right, leafBookmark.title), 'The current breadcrumb is plain text and does not navigate');
    await clickCrumb(left, middle);
    assert(document.activeElement === row(left, leaf.title) && checkbox(left, middleBookmark.title).checked && right.querySelector('h2').textContent === leaf.title, 'Clicking an inactive pane breadcrumb activates that pane, restores parent focus and marks, and leaves the other pane in place');
    await open(left, leaf);
    assert(checkbox(left, leafBookmark.title).checked && !checkbox(right, leafBookmark.title).checked, 'Breadcrumb navigation preserves independent saved marks when revisiting a folder');
    await clickCrumb(left, top);
    assert(row(left, middle.title) && right.querySelector('h2').textContent === leaf.title, 'An ancestor breadcrumb can jump across multiple folder levels in its own panel');
    await open(left, middle);
    await open(left, leaf);
    const renamed = { ...top, title: 'Renamed ancestor / path' };
    await browser.bookmarks.update(top.id, { title: renamed.title });
    await until(() => crumb(left, top.id)?.textContent === renamed.title && crumb(right, top.id)?.textContent === renamed.title);
    await clickCrumb(right, renamed);
    assert(left.querySelector('h2').textContent === leaf.title, 'Renamed ancestor breadcrumbs keep their destination IDs and navigate correctly in the right panel');
    container = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Breadcrumb new container' });
    await browser.bookmarks.move(top.id, { parentId: container.id });
    await until(() => crumb(left, container.id) && crumb(right, container.id));
    await clickCrumb(right, container);
    assert(row(right, renamed.title) && left.querySelector('h2').textContent === leaf.title, 'Moving an ancestor updates breadcrumb destinations and allows navigation to its new parent');
    await clickCrumb(left, fixtures);
    await clickCrumb(right, fixtures);
    assert(crumb(left, fixtures.id) === null && path(left).querySelector('[aria-current="page"]').textContent === fixtures.title, 'After breadcrumb navigation the new current folder is no longer clickable');
    return results;
  } finally {
    if (container) await browser.bookmarks.removeTree(container.id);
    else await browser.bookmarks.removeTree(top.id);
  }
}
