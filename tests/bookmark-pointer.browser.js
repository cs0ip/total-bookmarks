let folder;
let panels;
let lists;
let originalStyles;
let clicked;
let range;

async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Pointer fixture did not reach the expected state');
}

export async function prepare() {
  const tree = await browser.bookmarks.getTree();
  const toolbar = tree[0].children.find((node) => node.id === 'toolbar_____') ?? tree[0].children[0];
  folder = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Pointer scroll fixtures' });
  for (let index = 0; index < 40; index++) {
    await browser.bookmarks.create({ parentId: folder.id, title: `Pointer bookmark ${index}`, url: 'about:blank' });
  }
  panels = [0, 1].map((side) => document.querySelector(`[data-bookmark-pane="${side}"]`));
  for (const pane of panels) {
    await until(() => [...pane.querySelectorAll('button[aria-pressed]')].some((button) => button.textContent.includes(toolbar.title)));
    [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.includes(toolbar.title)).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => [...pane.querySelectorAll('button[aria-pressed]')].some((button) => button.textContent.includes(folder.title)));
    [...pane.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.includes(folder.title)).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => pane.querySelectorAll('button[aria-pressed]').length === 41);
  }
  lists = panels.map((pane) => pane.querySelector('[aria-label="Список закладок"]'));
  originalStyles = lists.map((list) => list.getAttribute('style'));
  for (const list of lists) {
    list.style.flex = 'none';
    list.style.height = '160px';
  }
}

export async function reset(side) {
  for (const pane of panels) {
    const first = pane.querySelector('button[aria-pressed]');
    first.focus({ preventScroll: true });
    await until(() => first.getAttribute('aria-pressed') === 'true' && document.activeElement === first);
  }
  panels[0].querySelector('button[aria-pressed]').focus({ preventScroll: true });
  await until(() => document.activeElement === panels[0].querySelector('button[aria-pressed]'));
  const bounds = lists[side].getBoundingClientRect();
  return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) };
}

export async function position(side, kind) {
  await until(() => lists[side].scrollTop > 200);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const viewport = lists[side].getBoundingClientRect();
  const buttons = [...lists[side].querySelectorAll('button[aria-pressed]')];
  const button = buttons.filter((row) => {
    const bounds = row.getBoundingClientRect();
    return bounds.top >= viewport.top + 6 && bounds.bottom <= viewport.bottom - 6;
  }).at(-1);
  if (!button) throw new Error('No fully visible pointer test row');
  const checkbox = button.parentElement.querySelector('input[type="checkbox"]');
  const bounds = (kind === 'row' ? button : checkbox).getBoundingClientRect();
  clicked = { button, checkbox, checked: checkbox.checked, scrollTop: lists[side].scrollTop };
  return {
    x: Math.round(kind === 'gap' ? bounds.right + 2 : kind === 'row' ? bounds.left + 80 : bounds.left + bounds.width / 2),
    y: Math.round(bounds.top + bounds.height / 2)
  };
}

export async function verify(side, kind) {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const first = panels[side].querySelector('button[aria-pressed]');
  const focusCorrect = kind === 'checkbox' ? document.activeElement === first && first.getAttribute('aria-pressed') === 'true' :
    document.activeElement === clicked.button && clicked.button.getAttribute('aria-pressed') === 'true';
  if (!focusCorrect || Math.abs(lists[side].scrollTop - clicked.scrollTop) > 1 ||
      (kind === 'checkbox' && clicked.checkbox.checked === clicked.checked)) {
    throw new Error(`Native ${kind} click changed scroll or failed selection in pane ${side}: ${lists[side].scrollTop} instead of ${clicked.scrollTop}`);
  }
  return `Native ${kind} click after wheel scrolling preserves the viewport and updates selection in ${side === 0 ? 'active' : 'inactive'} pane`;
}

export async function rangePosition(side, kind, repeated = false) {
  if (!repeated) {
    for (const pane of panels) {
      for (const checkbox of pane.querySelectorAll('input:checked')) {
        checkbox.click();
        await until(() => !checkbox.checked);
      }
    }
    await until(() => panels.every((pane) => !pane.querySelector('input:checked')));
  }
  const rows = [...lists[side].querySelectorAll('button[aria-pressed]')];
  let from = kind === 'checkbox' ? 8 : 3;
  let to = kind === 'checkbox' ? 3 : 8;
  if (repeated) [from, to] = [to, from];
  else rows.at(-1).parentElement.querySelector('input').click();
  rows[from].focus({ preventScroll: true });
  await until(() => rows[from].getAttribute('aria-pressed') === 'true' && document.activeElement === rows[from]);
  if (side === 1) {
    panels[0].querySelector('button[aria-pressed]').focus({ preventScroll: true });
    await until(() => panels[0].contains(document.activeElement));
  }
  const viewport = lists[side].getBoundingClientRect();
  lists[side].scrollTop += rows[to].parentElement.getBoundingClientRect().top - viewport.top - 10;
  await new Promise((resolve) => setTimeout(resolve, 100));
  const button = rows[to];
  const checkbox = button.parentElement.querySelector('input');
  const bounds = (kind === 'row' ? button : checkbox).getBoundingClientRect();
  range = { from, to, rows, button, repeated, scrollTop: lists[side].scrollTop };
  return {
    x: Math.round(kind === 'gap' ? bounds.right + 2 : kind === 'row' ? bounds.left + 80 : bounds.left + bounds.width / 2),
    y: Math.round(bounds.top + bounds.height / 2)
  };
}

export async function verifyRange(side, kind) {
  await until(() => document.activeElement === range.button && range.button.getAttribute('aria-pressed') === 'true');
  const expected = range.repeated ? [] : range.rows.slice(Math.min(range.from, range.to), Math.max(range.from, range.to) + 1);
  expected.push(range.rows.at(-1));
  const checked = range.rows.filter((button) => button.parentElement.querySelector('input:checked'));
  if (checked.length !== expected.length || expected.some((button) => !checked.includes(button)) ||
      panels[1 - side].querySelector('input:checked') || Math.abs(lists[side].scrollTop - range.scrollTop) > 1) {
    throw new Error(`Native Shift-${kind} click failed inclusive selection or moved the viewport in pane ${side}`);
  }
  return `Native Shift-${kind} click ${range.repeated ? 'unmarks the range on repeat' : 'selects the inclusive range'} in ${side === 0 ? 'active' : 'inactive'} pane and preserves other marks and scroll`;
}

export async function cleanup() {
  for (const [index, list] of lists.entries()) {
    if (originalStyles[index] === null) list.removeAttribute('style');
    else list.setAttribute('style', originalStyles[index]);
  }
  await browser.bookmarks.removeTree(folder.id);
}
