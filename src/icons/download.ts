const MAX_ICON_BYTES = 256 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;

async function fetchResource(url: string, limit: number): Promise<{ blob: Blob; url: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      cache: 'no-cache'
    });
    if (!response.ok || !response.body) throw new Error(`Resource unavailable: HTTP ${response.status}, ${url}`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Resource exceeds the size limit');
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('Resource exceeds the size limit');
        chunks.push(new Uint8Array(value));
      }
    } finally {
      await reader.cancel();
    }
    return {
      blob: new Blob(chunks, { type: response.headers.get('content-type') ?? '' }),
      url: response.url
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function iconData(url: string): Promise<string> {
  const { blob } = await fetchResource(url, MAX_ICON_BYTES);
  // Some servers send ICO files as application/octet-stream. Image decoding
  // also rejects a successful HTTP response containing an HTML error page.
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.src = '';
      reject(new Error('Favicon decoding timed out'));
    }, TIMEOUT_MS);
    image.onload = () => {
      // onload alone can succeed for an image with corrupt pixel data.
      void image.decode().then(() => { clearTimeout(timeout); resolve(); }, (cause) => {
        clearTimeout(timeout);
        reject(cause);
      });
    };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Invalid favicon image format')); };
    image.src = data;
  });
  return data;
}

export async function downloadIcon(origin: string): Promise<string | null> {
  let failure: unknown;
  try {
    return await iconData(`${origin}/favicon.ico`);
  } catch (cause) {
    failure = cause;
    // If the conventional location is absent, discover icons on the home page.
  }
  try {
    const page = await fetchResource(`${origin}/`, MAX_PAGE_BYTES);
    const document = new DOMParser().parseFromString(await page.blob.text(), 'text/html');
    const base = new URL(document.querySelector('base[href]')?.getAttribute('href') ?? '.', page.url);
    const urls = new Set<string>();
    for (const link of document.querySelectorAll('link[rel][href]')) {
      const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
      if (!rel.some((token) => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(token))) continue;
      try {
        const url = new URL(link.getAttribute('href')!, base);
        // Follow the site's own icon declaration, including its CDN, instead
        // of using an external favicon lookup service. The cache key stays origin.
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) urls.add(url.href);
      } catch { /* Ignore invalid links. */ }
    }
    for (const url of [...urls].slice(0, 5)) {
      try { return await iconData(url); } catch (cause) { failure = cause; }
    }
  } catch (cause) { failure = cause; }
  console.debug('Failed to download the favicon', origin, failure);
  return null;
}
