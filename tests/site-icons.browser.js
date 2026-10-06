export async function runIconTests(origin) {
  const results = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
    results.push(message);
  }
  async function until(check) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for background work');
  }
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('total-bookmarks-site-icons', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  function record(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('icons', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('icons');
      const request = value ? store.put(value) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  }
  const get = (url) => browser.runtime.sendMessage({ type: 'site-icons:get', url });
  const mode = (value) => fetch(`${origin}/mode?value=${value}`);
  const stats = async () => (await fetch(`${origin}/stats`)).json();
  async function maintain(check) {
    browser.alarms.create('site-icons:maintenance', { when: Date.now() + 100, periodInMinutes: 1440 });
    return until(check);
  }
  try {
    for (const name of ['folder.svg', 'defaultFavicon.svg']) {
      const loaded = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = `chrome://global/skin/icons/${name}`;
      });
      assert(loaded, `Firefox resource ${name} loads`);
    }
    const alarm = await browser.alarms.get('site-icons:maintenance');
    assert(alarm?.periodInMinutes === 1440, 'Daily maintenance alarm is registered');
    const first = await Promise.all(Array.from({ length: 12 }, (_, index) => get(`${origin}/page/${index}`)));
    assert(first.every((icon) => icon === null), 'Cache misses return immediately with a default icon');
    const saved = await until(async () => { const value = await record(origin); return value?.icon && value; });
    assert(saved.icon.startsWith('data:image/png;base64,'), 'Downloaded image is persisted in IndexedDB');
    assert((await stats()).favicon === 1, 'Concurrent requests for one origin share a single download');
    assert(saved.nextRefreshAt - saved.updatedAt >= 28 * 86400000, 'Successful icons are scheduled a calendar month ahead');
    assert(await get(`${origin}/another/path?query=1`) === saved.icon, 'Different paths use the same cached origin');
    assert((await stats()).favicon === 1, 'Fresh cached icons do not trigger network requests');
    const other = origin.replace('127.0.0.1', 'localhost');
    await get(`${other}/page`);
    await until(async () => (await record(other))?.icon);
    assert((await stats()).favicon === 2, 'A different hostname has its own origin record');

    await mode('html');
    const beforeRefresh = await record(origin);
    beforeRefresh.nextRefreshAt = 0;
    await record(origin, beforeRefresh);
    let notified = false;
    const onUpdate = (message) => {
      if (message?.type === 'site-icons:updated' && message.origin === origin) notified = true;
    };
    browser.runtime.onMessage.addListener(onUpdate);
    const refreshed = await maintain(async () => {
      const value = await record(origin);
      return value?.updatedAt > beforeRefresh.updatedAt && value;
    });
    await until(() => notified);
    browser.runtime.onMessage.removeListener(onUpdate);
    assert(refreshed.icon.startsWith('data:image/svg+xml'), 'HTML icon discovery resolves relative links and base href');
    assert(refreshed.lastAccessedAt === beforeRefresh.lastAccessedAt, 'Scheduled refresh does not count as user access');
    assert(notified, 'Successful background refresh notifies open extension pages');
    assert((await stats()).external === 0, 'Only favicon and declared icon resources are requested');

    await mode('missing');
    refreshed.nextRefreshAt = 0;
    await record(origin, refreshed);
    await maintain(async () => (await stats()).favicon >= 4);
    await until(async () => (await record(origin))?.nextRefreshAt > Date.now());
    // Wait until the request and HTML fallback finish before checking the data.
    await until(async () => (await stats()).home >= 2);
    const failed = await record(origin);
    assert(failed.icon === refreshed.icon, 'A failed refresh preserves the previous icon');
    assert(failed.updatedAt === refreshed.updatedAt, 'A failed refresh does not mark the icon as updated');
    const afterFailure = (await stats()).favicon;
    await get(`${origin}/offline`);
    assert((await stats()).favicon === afterFailure, 'Failed downloads are throttled until the next day');

    const old = await record(other);
    old.lastAccessedAt = Date.now() - 400 * 86400000;
    old.nextRefreshAt = 0;
    await record(other, old);
    const beforeCleanup = (await stats()).favicon;
    await maintain(async () => !(await record(other)));
    assert(!(await record(other)), 'Records unused for more than a year are removed');
    assert((await stats()).favicon === beforeCleanup, 'Expired records are deleted before any refresh request');
    assert(Boolean(await record(origin)), 'Recently accessed records survive cleanup');

    for (const url of ['file:///tmp/test', 'about:blank', 'javascript:alert(1)', 'invalid URL']) {
      assert(await get(url) === null, `Unsupported URL uses the default icon: ${url}`);
    }

    await mode('redirect');
    const redirectRecord = await record(origin);
    await record(origin, { ...redirectRecord, nextRefreshAt: 0 });
    assert(await get(`${origin}/page`) === redirectRecord.icon, 'A stale icon remains visible during a new download');
    const redirected = await until(async () => {
      const value = await record(origin);
      return value?.updatedAt > redirectRecord.updatedAt && value;
    });
    assert(redirected.icon.startsWith('data:image/svg+xml'), 'Favicon HTTP redirects are followed');

    await mode('cdn');
    await record(origin, { ...redirected, nextRefreshAt: 0 });
    await get(`${origin}/page`);
    await until(async () => (await record(origin))?.updatedAt > redirected.updatedAt);
    assert(true, 'Icons hosted on the CDN declared by the site are downloaded');

    for (const [scenario, message] of [
      ['home-redirect', 'Relative icons are resolved against the redirected home page URL'],
      ['corrupt', 'Corrupt PNG pixel data is rejected and a valid declared icon is used']
    ]) {
      await mode(scenario);
      const previous = await record(origin);
      await record(origin, { ...previous, nextRefreshAt: 0 });
      await get(`${origin}/page`);
      const value = await until(async () => {
        const value = await record(origin);
        return value?.updatedAt > previous.updatedAt && value;
      });
      assert(value.icon.startsWith('data:image/svg+xml'), message);
    }

    await mode('image');
    await record(other, {
      origin: other, icon: null, updatedAt: null, nextRefreshAt: Date.now() + 86400000,
      lastAccessedAt: Date.now()
    });
    await get(`${other}/page`);
    const retried = await until(async () => {
      const value = await record(other);
      return value?.icon && value;
    });
    assert(retried.icon.startsWith('data:image/png'), 'Failures cached by the old downloader are retried after the fix');

    // Mount the real production UI. The service alone cannot prove that the
    // downloaded image actually replaced the default icon in a bookmark row.
    const tree = await browser.bookmarks.getTree();
    const toolbar = tree[0].children.find((node) => node.id === 'toolbar_____') ?? tree[0].children[0];
    const bookmark = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Favicon UI fixture', url: `${other}/page` });
    const asyncBookmark = await browser.bookmarks.create({ parentId: toolbar.id, title: 'Favicon async fixture', url: `${origin}/page` });
    await mode('slow-image');
    const corruptLegacyIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=';
    await record(origin, {
      ...(await record(origin)), icon: corruptLegacyIcon, downloadVersion: undefined,
      nextRefreshAt: Date.now() + 30 * 86400000
    });
    try {
      const index = await (await fetch(browser.runtime.getURL('index.html'))).text();
      const page = new DOMParser().parseFromString(index, 'text/html');
      await Promise.all([...page.querySelectorAll('link[rel="stylesheet"]')].map((source) => new Promise((resolve, reject) => {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = new URL(source.getAttribute('href'), browser.runtime.getURL('index.html')).href;
        stylesheet.onload = resolve;
        stylesheet.onerror = () => reject(new Error('Failed to load the production UI stylesheet'));
        document.head.append(stylesheet);
      })));
      const script = index.match(/<script[^>]*src="([^"]+)"/)[1];
      document.body.className = page.body.className;
      document.body.innerHTML = '<div id="app"></div>';
      await import(script);
      const toolbarRow = await until(() => [...document.querySelectorAll('button[aria-pressed]')].find((button) =>
        button.textContent.includes(toolbar.title)
      ));
      toolbarRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await until(() => [...document.querySelectorAll('img')].find((img) =>
        img.parentElement.parentElement.textContent.includes('Favicon async fixture') && img.src.startsWith('chrome:')
      ));
      assert(true, 'A bookmark initially displays the default icon while its favicon downloads');
      const image = await until(() => [...document.querySelectorAll('img')].find((img) =>
        img.parentElement.parentElement.textContent.includes('Favicon UI fixture') && img.complete && img.naturalWidth > 0 && img.src.startsWith('data:')
      ));
      assert(image.src === retried.icon, 'The rendered bookmark displays the downloaded favicon');
      const downloaded = await until(() => [...document.querySelectorAll('img')].find((img) =>
        img.parentElement.parentElement.textContent.includes('Favicon async fixture') && img.complete && img.naturalWidth === 16 && img.src.startsWith('data:')
      ));
      assert(downloaded.src === (await record(origin)).icon, 'An async background update replaces the default icon in the visible bookmark');
      assert(downloaded.src !== corruptLegacyIcon, 'A corrupt icon cached by the old downloader is replaced immediately');
    } finally {
      await browser.bookmarks.remove(bookmark.id);
      await browser.bookmarks.remove(asyncBookmark.id);
    }
    await mode('image');
    await browser.permissions.remove({ origins: ['http://*/*', 'https://*/*'] });
    await until(() => document.querySelector('[role="status"] button')?.textContent === 'Разрешить загрузку иконок');
    assert(true, 'Missing host access displays an actionable permission button');
    const beforePermission = await stats();
    await record(origin, { ...(await record(origin)), icon: null, nextRefreshAt: 0 });
    assert(await get(`${origin}/page`) === null, 'An unpermitted origin uses the default icon');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert((await stats()).favicon === beforePermission.favicon, 'No icon request is sent before host access is granted');
    assert((await record(origin)).nextRefreshAt === 0, 'Missing permission does not postpone the next download');
    // Simulate a failed request from before the user granted site access.
    await record(origin, { ...(await record(origin)), nextRefreshAt: Date.now() + 86400000 });
    return results;
  } finally { db.close(); }
}

export async function verifyPermissionRetry(origin) {
  const deadline = Date.now() + 15_000;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('total-bookmarks-site-icons', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    while (Date.now() < deadline) {
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction('icons').objectStore('icons').get(origin);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (value?.icon && !document.querySelector('[role="status"] button')) {
        return ['Granting host access dismisses the banner and immediately retries a previously failed icon'];
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Granting host access did not retry the missing icon');
  } finally { db.close(); }
}
