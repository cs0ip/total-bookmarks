let fixtures;
let source;
let target;
let empty;
let nested;
let panes;
let styles;
let expectedMarker;
let scrollBefore;
let currentCase;

async function until(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Drag fixture did not reach the expected state in ${currentCase}: ${panes.map(order).join('; ')}; checks: ${panes.map((pane) => [...pane.querySelectorAll('input:checked')].map((input) => input.getAttribute('aria-label')).join(',')).join('; ')}`);
}
const rows = (side) => [...panes[side].querySelectorAll('button[aria-pressed]')];
const row = (side, title) => rows(side).find((button) => button.querySelector('.font-semibold').textContent.trim() === title);
const list = (side) => panes[side].querySelector('[data-bookmark-list]');
const selected = (side) => panes[side].querySelector('button[aria-pressed="true"]');
const checkbox = (side, title) => row(side, title).parentElement.querySelector('input');
function order(pane) {
  return [...pane.querySelectorAll('[data-bookmark-row]')].filter((node) => node.dataset.bookmarkId !== '..')
    .map((node) => node.querySelector('.font-semibold').textContent.trim());
}
const matches = (side, titles) => JSON.stringify(order(panes[side])) === JSON.stringify(titles);
function assert(condition, message) {
  if (!condition) throw new Error(message);
  return message;
}
async function open(side, title) {
  await until(() => row(side, title));
  row(side, title).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await until(() => panes[side].querySelector('h2').textContent === title);
}
async function parent(side) {
  const previous = panes[side].querySelector('h2').textContent;
  row(side, '..').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await until(() => panes[side].querySelector('h2').textContent !== previous);
}
async function check(side, title, value) {
  const input = checkbox(side, title);
  if (input.checked !== value) input.click();
  await until(() => input.checked === value);
}
function position(side, title, edge) {
  const bounds = row(side, title).parentElement.getBoundingClientRect();
  const button = row(side, title).getBoundingClientRect();
  if (edge) expectedMarker = { side, y: edge === 'before' ? bounds.top : bounds.bottom };
  return { x: Math.round(button.left + 60), y: Math.round(edge === 'before' ? bounds.top + 8 : edge === 'after' ? bounds.bottom - 8 : (bounds.top + bounds.bottom) / 2) };
}

export async function prepare() {
  panes = [0, 1].map((side) => document.querySelector(`[data-bookmark-pane="${side}"]`));
  await until(() => !row(0, '..') && !row(1, '..'));
  const tree = await browser.bookmarks.getTree();
  const toolbar = tree[0].children.find((node) => node.id === 'toolbar_____') ?? tree[0].children[0];
  fixtures = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Drag fixtures' });
  source = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Drag source' });
  target = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Drag target' });
  empty = await browser.bookmarks.create({ parentId: fixtures.id, title: 'Drag empty' });
  for (const title of ['Drag A', 'Drag B', 'Drag C', 'Drag D']) {
    const node = await browser.bookmarks.create({ parentId: source.id, title, ...(title === 'Drag B' ? {} : { url: 'about:blank' }) });
    if (title === 'Drag B') nested = await browser.bookmarks.create({ parentId: node.id, title: 'Drag nested' });
  }
  for (const title of ['Drag T1', 'Drag T2']) await browser.bookmarks.create({ parentId: target.id, title, url: 'about:blank' });
  for (const side of [0, 1]) {
    await open(side, toolbar.title);
    await open(side, fixtures.title);
    await open(side, side === 0 ? source.title : target.title);
  }
  styles = [0, 1].map((side) => list(side).getAttribute('style'));
  for (const side of [0, 1]) { list(side).style.flex = 'none'; list(side).style.height = '350px'; }
}

export async function startCase(name) {
  currentCase = name;
  expectedMarker = undefined;
  if (name === 'reorder') {
    await check(0, 'Drag B', true);
    await check(0, 'Drag D', true);
    return { start: position(0, 'Drag D'), end: position(0, 'Drag A', 'before') };
  }
  if (name === 'right') {
    row(1, 'Drag T1').focus();
    await until(() => selected(1) === row(1, 'Drag T1'));
    return { start: position(0, 'Drag B'), end: position(1, 'Drag T2', 'before') };
  }
  if (name === 'left') return { start: position(1, 'Drag D'), end: position(0, 'Drag A', 'before') };
  if (name === 'empty') {
    await check(0, 'Drag B', false);
    await check(0, 'Drag D', false);
    await parent(1);
    await open(1, empty.title);
    const bounds = list(1).getBoundingClientRect();
    expectedMarker = { side: 1, y: row(1, '..').parentElement.getBoundingClientRect().bottom };
    return { start: position(0, 'Drag C'), end: { x: Math.round(bounds.left + 100), y: Math.round(bounds.top + 100) } };
  }
  if (name === 'cycle') {
    await parent(1);
    await open(1, source.title);
    await open(1, 'Drag B');
    await open(1, nested.title);
    return { start: position(0, 'Drag B'), end: position(1, '..') };
  }
  if (name === 'escape') return { start: position(0, 'Drag A'), end: position(0, 'Drag B', 'before') };
  if (name === 'outside') {
    const bounds = panes[1].querySelector('header').getBoundingClientRect();
    return { start: position(0, 'Drag A'), end: { x: Math.round(bounds.left + 100), y: Math.round(bounds.top + 20) } };
  }
  if (name === 'parent') return { start: position(0, '..'), end: position(0, 'Drag A') };
  if (name === 'same-folder') {
    await parent(1);
    await parent(1);
    await check(0, 'Drag B', true);
    await check(0, 'Drag A', true);
    await check(1, 'Drag D', true);
    return { start: position(0, 'Drag A'), end: position(1, 'Drag D', 'before') };
  }
  if (name === 'scroll') {
    await check(0, 'Drag B', false);
    await check(0, 'Drag A', false);
    for (let index = 0; index < 30; index++) await browser.bookmarks.create({ parentId: source.id, title: `Drag long ${index}`, url: 'about:blank' });
    await until(() => row(0, 'Drag long 29'));
    list(0).style.height = '160px';
    row(0, 'Drag B').focus();
    await until(() => document.activeElement === row(0, 'Drag B'));
    const start = position(0, 'Drag B');
    const bounds = list(0).getBoundingClientRect();
    scrollBefore = list(0).scrollTop;
    return { start, end: { x: Math.round(bounds.left + 150), y: Math.round(bounds.bottom - 4) } };
  }
  throw new Error(`Unknown native drag case: ${name}`);
}

export async function verifyHover(name) {
  await new Promise((resolve) => setTimeout(resolve, name === 'scroll' ? 300 : 30));
  const marker = document.querySelector('[data-drop-marker]');
  const preview = document.querySelector('[data-drag-preview]');
  if (name === 'parent') return assert(!marker && !preview, 'The parent entry cannot start a mouse drag');
  if (name === 'cycle' || name === 'outside') return assert(preview && !marker, `A ${name} drag target has no insertion marker`);
  if (name === 'scroll') return assert(marker && preview && list(0).scrollTop > scrollBefore + 20, 'Holding a dragged row near the viewport edge scrolls only its destination list and updates the marker');
  return assert(marker && preview && panes[expectedMarker.side].contains(marker) && Math.abs(marker.getBoundingClientRect().top - expectedMarker.y) < 2,
    `Native ${name} dragging displays an insertion line at the exact row boundary`);
}

export async function verifyDrop(name) {
  await until(() => !document.querySelector('[data-drag-preview]') && !document.querySelector('[data-drop-marker]'));
  const busy = () => [...document.querySelectorAll('[aria-label="Команды"] button')].every((button) => button.disabled);
  if (name === 'reorder') {
    await until(() => matches(0, ['Drag B', 'Drag D', 'Drag A', 'Drag C']) && !busy());
    return assert(checkbox(0, 'Drag B').checked && checkbox(0, 'Drag D').checked && document.activeElement === row(0, 'Drag D'), 'Native within-pane dragging packs nonadjacent folder and bookmark marks in order while preserving focus');
  }
  if (name === 'right') {
    await until(() => matches(1, ['Drag T1', 'Drag B', 'Drag D', 'Drag T2']) && checkbox(1, 'Drag B').checked && !busy());
    return assert(matches(0, ['Drag A', 'Drag C']) && checkbox(1, 'Drag D').checked && document.activeElement === row(0, 'Drag A') && selected(1) === row(1, 'Drag T1'), 'Native left-to-right dragging inserts at the pointer boundary, transfers marks and keeps source focus at its position');
  }
  if (name === 'left') {
    await until(() => matches(0, ['Drag B', 'Drag D', 'Drag A', 'Drag C']) && checkbox(0, 'Drag D').checked && !busy());
    return assert(matches(1, ['Drag T1', 'Drag T2']) && checkbox(0, 'Drag B').checked && document.activeElement === row(1, 'Drag T2'), 'Native right-to-left dragging preserves group order and selects the nearest source row');
  }
  if (name === 'empty') {
    await until(() => matches(1, ['Drag C']) && !busy());
    return assert(matches(0, ['Drag B', 'Drag D', 'Drag A']) && !checkbox(1, 'Drag C').checked && document.activeElement === row(0, 'Drag A'), 'A single unmarked row can be dragged into an empty folder without creating a checkbox mark');
  }
  if (name === 'same-folder') {
    await until(() => matches(0, ['Drag B', 'Drag A', 'Drag D']) && checkbox(1, 'Drag A').checked && !busy());
    return assert(matches(1, ['Drag B', 'Drag A', 'Drag D']) && checkbox(0, 'Drag B').checked && checkbox(0, 'Drag A').checked && checkbox(1, 'Drag D').checked, 'Dragging between panels showing the same folder preserves both sets of marks and reorders only once');
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  return assert(name === 'scroll' ? order(panes[0]).length === 33 : matches(0, ['Drag B', 'Drag D', 'Drag A']), `Native ${name} drag completion leaves bookmark order unchanged`);
}

export async function cleanup() {
  for (const side of [0, 1]) {
    if (styles[side] === null) list(side).removeAttribute('style');
    else list(side).setAttribute('style', styles[side]);
  }
  await browser.bookmarks.removeTree(fixtures.id);
}
