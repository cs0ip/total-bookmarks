// Run against Chrome for Testing or Chromium; never use a personal browser profile.
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';

const binary = process.env.CHROME_BIN;
if (!binary) throw new Error('Set CHROME_BIN to Chrome for Testing or Chromium');
const work = await mkdtemp(join(tmpdir(), 'total-bookmarks-chrome-test-'));
let processHandle;
let socket;
let log = '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const extension = join(work, 'extension');
  await cp(new URL('../dist/chrome/', import.meta.url), extension, { recursive: true });
  await cp(new URL('./chrome.browser.js', import.meta.url), join(extension, 'chrome.browser.js'));
  await cp(new URL('./bookmark-drag.browser.js', import.meta.url), join(extension, 'bookmark-drag.browser.js'));
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const key = publicKey.export({ type: 'spki', format: 'der' });
  manifest.key = key.toString('base64');
  const extensionId = createHash('sha256').update(key).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + parseInt(char, 16)));
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const profile = join(work, 'profile');
  processHandle = spawn(binary, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--window-size=1440,1000', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--load-extension=${extension}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  processHandle.stderr.on('data', (chunk) => { log += chunk; });
  let port;
  for (let i = 0; i < 150; i++) {
    if (processHandle.exitCode !== null) throw new Error(`Chrome exited before testing: ${log}`);
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    await sleep(100);
  }
  if (!port) throw new Error(`Chrome DevTools did not start: ${log}`);
  const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  async function connect(target) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await once(ws, 'open');
    let sequence = 0;
    const pending = new Map();
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    return { ws, send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    } };
  }
  let worker;
  for (let i = 0; i < 100; i++) {
    worker = (await targets()).find((target) => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/background.js`);
    if (worker) break;
    await sleep(100);
  }
  if (!worker) throw new Error(`The Chrome extension service worker did not start: ${log}`);
  const background = await connect(worker);
  const opened = await background.send('Runtime.evaluate', {
    expression: "browser.tabs.create({url:browser.runtime.getURL('index.html')})", awaitPromise: true, returnByValue: true
  });
  background.ws.close();
  if (opened.exceptionDetails) throw new Error(JSON.stringify(opened.exceptionDetails));
  let page;
  for (let i = 0; i < 100; i++) {
    page = (await targets()).find((target) => target.type === 'page' && target.url === new URL('index.html', worker.url).href);
    if (page) break;
    await sleep(100);
  }
  if (!page) throw new Error('The bookmark manager tab did not open');
  const client = await connect(page);
  socket = client.ws;
  await client.send('Page.bringToFront');
  for (let i = 0; i < 100; i++) {
    const ready = await client.send('Runtime.evaluate', { expression: "document.readyState === 'complete' && Boolean(document.querySelector('[data-bookmark-pane]'))", returnByValue: true });
    if (ready.result?.value) break;
    if (i === 99) {
      const state = await client.send('Runtime.evaluate', { expression: "JSON.stringify({url:document.URL,ready:document.readyState,body:document.body?.innerText,browser:typeof browser})", returnByValue: true });
      throw new Error(`Chrome UI did not mount: ${JSON.stringify(state)}; opened: ${JSON.stringify(opened)}; ${log}`);
    }
    await sleep(100);
  }
  const result = await client.send('Runtime.evaluate', {
    expression: `import(${JSON.stringify(new URL('chrome.browser.js', page.url).href)}).then(module => module.runChromeTests())`,
    awaitPromise: true, returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  for (const assertion of result.result.value) console.log(`PASS ${assertion}`);
  await client.send('Page.reload');
  await sleep(500);
  const restored = await client.send('Runtime.evaluate', {
    expression: "document.documentElement.lang === 'ru' && document.querySelector('[data-bookmark-pane]') !== null", returnByValue: true
  });
  if (!restored.result.value) throw new Error('Chrome did not restore the saved locale on reload');
  let count = result.result.value.length + 1;
  async function evaluate(expression) {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await evaluate("import('./bookmark-drag.browser.js').then(async module => { window.dragTests = module; await module.prepare(); })");
  try {
    for (const name of ['reorder', 'right', 'left', 'empty', 'cycle', 'escape', 'outside', 'parent', 'same-folder', 'scroll']) {
      const { start, end } = await evaluate(`window.dragTests.startCase(${JSON.stringify(name)})`);
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: start.x + (end.x - start.x) * step / 8,
          y: start.y + (end.y - start.y) * step / 8, button: 'left', buttons: 1
        });
      }
      console.log(`PASS ${await evaluate(`window.dragTests.verifyHover(${JSON.stringify(name)})`)}`);
      if (name === 'escape' || name === 'scroll') {
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 });
      console.log(`PASS ${await evaluate(`window.dragTests.verifyDrop(${JSON.stringify(name)})`)}`);
      count += 2;
    }
  } finally {
    await evaluate('window.dragTests.cleanup()');
  }
  console.log(`Passed ${count} assertions in Chrome (including locale restoration on reload)`);
} finally {
  socket?.close();
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill('SIGTERM');
    await once(processHandle, 'exit');
  }
  await rm(work, { recursive: true, force: true });
}
