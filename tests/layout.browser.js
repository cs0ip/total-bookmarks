export async function verifyManagerLayout(context) {
  await new Promise(requestAnimationFrame);
  const bar = document.querySelector('button[aria-controls="create-menu"]').closest('[role="group"]');
  const panes = [...document.querySelectorAll('[data-bookmark-pane]')];
  const visible = (element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1;
  };
  if (!visible(bar) || document.documentElement.scrollHeight > innerHeight + 1) {
    throw new Error(`${context}: commands extend beyond the viewport: ${JSON.stringify({ bottom: bar.getBoundingClientRect().bottom, viewport: innerHeight, page: document.documentElement.scrollHeight })}`);
  }
  for (const pane of panes) {
    const bounds = pane.getBoundingClientRect();
    for (const child of [pane.querySelector('header'), pane.querySelector('[data-bookmark-list]'), pane.querySelector('footer')]) {
      const childBounds = child.getBoundingClientRect();
      if (!visible(child) || childBounds.top < bounds.top - 1 || childBounds.bottom > bounds.bottom + 1) {
        throw new Error(`${context}: a pane header, list or breadcrumb is clipped`);
      }
    }
  }
  const status = document.querySelector('[role="status"]');
  if (status && !visible(status)) throw new Error(`${context}: the permission banner is clipped`);
  return `${context}: commands, pane headers, lists and breadcrumbs remain visible without scrolling the page`;
}
