"""Integration tests in a separate Firefox profile; requires Python 3 and Firefox.

Run npm run build, then python3 tests/run-site-icons.py.
Only the temporary profile and a local fixture server are used.
"""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import struct
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


PNG = (b'\x89PNG\r\n\x1a\n'
       + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 6, 0, 0, 0))
       + png_chunk(b'IDAT', zlib.compress((b'\x00' + b'\x30\x80\xc0\xff' * 16) * 16))
       + png_chunk(b'IEND', b''))
CORRUPT_PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=')
STATE = {'mode': 'image', 'favicon': 0, 'home': 0, 'external': 0}


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        status, mime = 200, 'text/plain'
        if url.path == '/mode':
            STATE['mode'] = parse_qs(url.query)['value'][0]
            body = b'ok'
        elif url.path == '/stats':
            mime, body = 'application/json', json.dumps(STATE).encode()
        elif url.path == '/favicon.ico':
            STATE['favicon'] += 1
            if STATE['mode'] == 'redirect':
                self.send_response(302)
                self.send_header('Location', '/assets/site.svg')
                self.end_headers()
                return
            if STATE['mode'] in ('image', 'slow-image'):
                if STATE['mode'] == 'slow-image':
                    time.sleep(.3)
                mime, body = 'image/png', PNG
            elif STATE['mode'] == 'corrupt':
                mime, body = 'image/png', CORRUPT_PNG
            else:
                mime, body = 'text/html', b'<html>Not an image</html>'
        elif url.path == '/':
            STATE['home'] += 1
            mime = 'text/html'
            if STATE['mode'] in ('html', 'corrupt'):
                body = b'<base href="/assets/"><link rel="shortcut icon" href="site.svg">'
            elif STATE['mode'] == 'home-redirect':
                self.send_response(302)
                self.send_header('Location', '/canonical/index.html')
                self.end_headers()
                return
            elif STATE['mode'] == 'cdn':
                body = f'<link rel="icon" href="http://localhost:{self.server.server_port}/assets/site.svg">'.encode()
            else:
                body = b'<html>No icon</html>'
        elif url.path == '/canonical/index.html':
            mime, body = 'text/html', b'<link rel="icon" href="icon.svg">'
        elif url.path in ('/assets/site.svg', '/canonical/icon.svg'):
            mime = 'image/svg+xml'
            body = b'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'
        else:
            STATE['external'] += 1
            status, body = 404, b'not found'
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def run():
    if not (ROOT / 'dist/background.js').exists():
        raise RuntimeError('Run npm run build before these tests')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix='total-bookmarks-icons-') as temporary:
            work = Path(temporary)
            extension = work / 'extension'
            shutil.copytree(ROOT / 'dist', extension)
            shutil.copy(ROOT / 'tests/site-icons.browser.js', extension / 'site-icons.browser.js')
            shutil.copy(ROOT / 'tests/bookmarks.browser.js', extension / 'bookmarks.browser.js')
            shutil.copy(ROOT / 'tests/bookmark-commands.browser.js', extension / 'bookmark-commands.browser.js')
            shutil.copy(ROOT / 'tests/bookmark-delete.browser.js', extension / 'bookmark-delete.browser.js')
            shutil.copy(ROOT / 'tests/bookmark-create.browser.js', extension / 'bookmark-create.browser.js')
            shutil.copy(ROOT / 'tests/bookmark-pointer.browser.js', extension / 'bookmark-pointer.browser.js')
            shutil.copy(ROOT / 'tests/bookmark-drag.browser.js', extension / 'bookmark-drag.browser.js')
            manifest = json.loads((extension / 'manifest.json').read_text())
            manifest['browser_specific_settings']['gecko']['id'] = 'site-icons-test@example.test'
            manifest['background']['scripts'].append('open-test.js')
            (extension / 'manifest.json').write_text(json.dumps(manifest))
            (extension / 'open-test.js').write_text('browser.tabs.create({url:browser.runtime.getURL("test.html")});')
            (extension / 'test.html').write_text('<!doctype html><html><body>Site icon tests</body></html>')
            profile = work / 'profile'
            profile.mkdir()
            with socket.socket() as free_port:
                free_port.bind(('127.0.0.1', 0))
                port = free_port.getsockname()[1]
            (profile / 'user.js').write_text(
                f'user_pref("marionette.port", {port});\n'
                'user_pref("browser.shell.checkDefaultBrowser", false);\n'
                'user_pref("browser.startup.homepage_override.mstone", "ignore");\n'
            )
            with (work / 'firefox.log').open('w+') as log:
                process = subprocess.Popen([
                    os.environ.get('FIREFOX_BIN', 'firefox'), '--headless', '--no-remote',
                    '--profile', str(profile), '--marionette', '--remote-allow-system-access'
                ], stdout=log, stderr=log)
                try:
                    connection = None
                    for _ in range(150):
                        if process.poll() is not None:
                            log.seek(0)
                            raise RuntimeError('Firefox exited before testing:\n' + log.read())
                        try:
                            connection = socket.create_connection(('127.0.0.1', port), timeout=1)
                            break
                        except OSError:
                            time.sleep(.1)
                    if connection is None:
                        raise RuntimeError('Firefox Marionette did not start')
                    with connection:
                        connection.settimeout(60)

                        def read():
                            length = b''
                            while not length.endswith(b':'):
                                byte = connection.recv(1)
                                if not byte:
                                    raise RuntimeError('Firefox closed the connection')
                                length += byte
                            data = b''
                            size = int(length[:-1])
                            while len(data) < size:
                                chunk = connection.recv(size - len(data))
                                if not chunk:
                                    raise RuntimeError('Firefox closed the connection')
                                data += chunk
                            return json.loads(data)

                        read()  # Protocol handshake.
                        sequence = 0

                        def command(name, args=None):
                            nonlocal sequence
                            sequence += 1
                            data = json.dumps([0, sequence, name, args or {}]).encode()
                            connection.sendall(str(len(data)).encode() + b':' + data)
                            response = read()
                            if response[2]:
                                raise RuntimeError(response[2])
                            return response[3]

                        command('WebDriver:NewSession')
                        command('Addon:Install', {'path': str(extension), 'temporary': True})
                        for _ in range(100):
                            found = False
                            for handle in command('WebDriver:GetWindowHandles'):
                                command('WebDriver:SwitchToWindow', {'handle': handle})
                                if command('WebDriver:GetCurrentURL')['value'].endswith('/test.html'):
                                    found = True
                                    break
                            if found:
                                break
                            time.sleep(.1)
                        else:
                            raise RuntimeError('The extension test page did not open')
                        for _ in range(100):
                            if command('WebDriver:ExecuteScript', {
                                'script': 'return document.readyState;', 'args': []
                            })['value'] == 'complete':
                                break
                            time.sleep(.05)
                        command('WebDriver:SetTimeouts', {'script': 60_000})
                        result = command('WebDriver:ExecuteAsyncScript', {
                            'script': '''
                                const done = arguments[arguments.length - 1];
                                import('./site-icons.browser.js')
                                    .then(module => module.runIconTests(arguments[0]))
                                    .then(results => done({results}))
                                    .catch(error => done({error: String(error), stack: error.stack}));
                            ''',
                            'args': [f'http://127.0.0.1:{server.server_port}']
                        })['value']
                        if 'error' in result:
                            raise RuntimeError(json.dumps(result, indent=2))
                        button = command('WebDriver:FindElement', {
                            'using': 'css selector', 'value': '[role="status"] button'
                        })['value']
                        command('WebDriver:ElementClick', {
                            'id': button['element-6066-11e4-a52e-4f735466cecf']
                        })
                        # Accept the native prompt only in this disposable test
                        # profile. The real extension uses the user's decision.
                        command('Marionette:SetContext', {'value': 'chrome'})
                        accepted = command('WebDriver:ExecuteAsyncScript', {
                            'script': '''
                                const done = arguments[arguments.length - 1];
                                const deadline = Date.now() + 10000;
                                function accept() {
                                    const notification = PopupNotifications.getNotification('addon-webext-permissions');
                                    if (notification) {
                                        notification.mainAction.callback();
                                        notification.remove();
                                        done(true);
                                    } else if (Date.now() < deadline) setTimeout(accept, 50);
                                    else done(false);
                                }
                                accept();
                            ''', 'args': []
                        })['value']
                        if not accepted:
                            raise RuntimeError('The permission button did not open the native Firefox prompt')
                        command('Marionette:SetContext', {'value': 'content'})
                        retried = command('WebDriver:ExecuteAsyncScript', {
                            'script': '''
                                const done = arguments[arguments.length - 1];
                                import('./site-icons.browser.js')
                                    .then(module => module.verifyPermissionRetry(arguments[0]))
                                    .then(results => done({results}))
                                    .catch(error => done({error: String(error), stack: error.stack}));
                            ''', 'args': [f'http://127.0.0.1:{server.server_port}']
                        })['value']
                        if 'error' in retried:
                            raise RuntimeError(json.dumps(retried, indent=2))
                        result['results'].extend(retried['results'])
                        command('WebDriver:SetWindowRect', {'width': 1200, 'height': 900})

                        def panel_layout():
                            return command('WebDriver:ExecuteScript', {
                                'script': '''
                                    const left = document.querySelector('[data-bookmark-pane="0"]');
                                    const right = document.querySelector('[data-bookmark-pane="1"]');
                                    const divider = document.querySelector('[role="separator"]');
                                    const bounds = divider.getBoundingClientRect();
                                    return {
                                        left: left.getBoundingClientRect().width,
                                        right: right.getBoundingClientRect().width,
                                        x: Math.round(bounds.left + bounds.width / 2),
                                        y: Math.round(bounds.top + 80),
                                        visible: getComputedStyle(divider).display !== 'none',
                                        dragging: divider.parentElement.classList.contains('resizing'),
                                        focusPreserved: document.activeElement === window.splitterTestFocus
                                    };
                                ''', 'args': []
                            })['value']

                        def pointer_actions(actions):
                            command('WebDriver:PerformActions', {'actions': [{
                                'type': 'pointer', 'id': 'splitter-mouse',
                                'parameters': {'pointerType': 'mouse'}, 'actions': actions
                            }]})

                        command('WebDriver:ExecuteScript', {
                            'script': 'window.splitterTestFocus = document.activeElement;', 'args': []
                        })
                        initial = panel_layout()
                        pointer_actions([
                            {'type': 'pointerMove', 'x': initial['x'], 'y': initial['y'], 'duration': 0},
                            {'type': 'pointerDown', 'button': 0},
                            {'type': 'pointerMove', 'x': initial['x'] + 140, 'y': initial['y'], 'duration': 150}
                        ])
                        expanded = panel_layout()
                        if not (expanded['left'] > initial['left'] + 100 and expanded['right'] < initial['right'] - 100 and expanded['dragging'] and expanded['focusPreserved']):
                            raise RuntimeError(f'Dragging the divider did not resize both panels while preserving focus: {expanded}')
                        result['results'].append('Native divider dragging resizes both panels and preserves row focus')
                        pointer_actions([
                            {'type': 'pointerMove', 'x': 0, 'y': 50, 'duration': 150},
                            {'type': 'pointerUp', 'button': 0}
                        ])
                        limited = panel_layout()
                        share = limited['left'] / (limited['left'] + limited['right'])
                        if not (abs(share - 0.2) < 0.01 and not limited['dragging'] and limited['focusPreserved']):
                            raise RuntimeError(f'Divider capture or minimum pane width failed outside its bounds: {limited}')
                        result['results'].append('Dragging beyond the divider keeps panels usable and releasing outside ends resizing')
                        pointer_actions([
                            {'type': 'pointerMove', 'x': limited['x'], 'y': limited['y'], 'duration': 0},
                            {'type': 'pointerDown', 'button': 0},
                            {'type': 'pointerMove', 'x': initial['x'], 'y': initial['y'], 'duration': 150},
                            {'type': 'pointerUp', 'button': 0}
                        ])
                        restored = panel_layout()
                        if not (abs(restored['left'] - initial['left']) < 3 and abs(restored['right'] - initial['right']) < 3 and restored['focusPreserved']):
                            raise RuntimeError(f'The divider did not resize back in the opposite direction: {restored}')
                        result['results'].append('The divider can resize back in the opposite direction without losing focus')
                        command('WebDriver:ReleaseActions')
                        command('WebDriver:SetWindowRect', {'width': 600, 'height': 900})
                        narrow = panel_layout()
                        command('WebDriver:SetWindowRect', {'width': 1200, 'height': 900})
                        wide = panel_layout()
                        if not (not narrow['visible'] and abs(narrow['left'] - narrow['right']) < 2 and wide['visible'] and abs(wide['left'] - restored['left']) < 3):
                            raise RuntimeError('Responsive layout did not hide the divider on a narrow window or restore pane widths')
                        result['results'].append('Narrow windows hide the divider and wide windows restore pane proportions')
                        command('WebDriver:ExecuteScript', {
                            'script': 'delete window.splitterTestFocus;', 'args': []
                        })
                        bookmarks = command('WebDriver:ExecuteAsyncScript', {
                            'script': '''
                                const done = arguments[arguments.length - 1];
                                import('./bookmarks.browser.js')
                                    .then(module => module.runBookmarkTests())
                                    .then(results => done({results}))
                                    .catch(error => done({error: String(error), stack: error.stack}));
                            ''', 'args': []
                        })['value']
                        if 'error' in bookmarks:
                            raise RuntimeError(json.dumps(bookmarks, indent=2))
                        result['results'].extend(bookmarks['results'])

                        def pointer_script(script, args=None):
                            checked = command('WebDriver:ExecuteAsyncScript', {
                                'script': f'''
                                    const done = arguments[arguments.length - 1];
                                    (async () => {{ {script} }})()
                                        .then(value => done({{value}}))
                                        .catch(error => done({{error: String(error), stack: error.stack}}));
                                ''', 'args': args or []
                            })['value']
                            if 'error' in checked:
                                raise RuntimeError(json.dumps(checked, indent=2))
                            return checked.get('value')

                        pointer_script("window.pointerTests = await import('./bookmark-pointer.browser.js'); await window.pointerTests.prepare();")
                        try:
                            for side in [0, 1]:
                                for kind in ['checkbox', 'row', 'gap']:
                                    wheel = pointer_script('return await window.pointerTests.reset(arguments[0]);', [side])
                                    command('WebDriver:PerformActions', {'actions': [{
                                        'type': 'wheel', 'id': 'list-wheel', 'actions': [{
                                            'type': 'scroll', 'origin': 'viewport', 'x': wheel['x'], 'y': wheel['y'],
                                            'deltaX': 0, 'deltaY': 5000, 'duration': 0
                                        }]
                                    }]})
                                    point = pointer_script('return await window.pointerTests.position(arguments[0], arguments[1]);', [side, kind])
                                    pointer_actions([
                                        {'type': 'pointerMove', 'x': point['x'], 'y': point['y'], 'duration': 0},
                                        {'type': 'pointerDown', 'button': 0},
                                        {'type': 'pointerUp', 'button': 0}
                                    ])
                                    result['results'].append(pointer_script('return await window.pointerTests.verify(arguments[0], arguments[1]);', [side, kind]))
                        finally:
                            command('WebDriver:ReleaseActions')
                            pointer_script('await window.pointerTests.cleanup(); delete window.pointerTests;')
                        pointer_script("window.dragTests = await import('./bookmark-drag.browser.js'); await window.dragTests.prepare();")
                        try:
                            pointer_script('''
                                window.creationTestFocus = document.activeElement;
                                document.querySelector('[aria-label="Команды"] button[aria-label="Папку"]').click();
                                const deadline = Date.now() + 10000;
                                while (Date.now() < deadline) {
                                    const dialog = document.querySelector('[data-bookmark-create-dialog]');
                                    if (dialog?.open && document.activeElement === dialog.querySelector('input[name="title"]')) return;
                                    await new Promise(resolve => setTimeout(resolve, 20));
                                }
                                throw new Error('The native creation dialog did not receive input focus');
                            ''')
                            command('WebDriver:PerformActions', {'actions': [{
                                'type': 'key', 'id': 'creation-keyboard', 'actions': [
                                    {'type': 'keyDown', 'value': '\ue014'},
                                    {'type': 'keyUp', 'value': '\ue014'},
                                    {'type': 'keyDown', 'value': '\ue004'},
                                    {'type': 'keyUp', 'value': '\ue004'}
                                ]
                            }]})
                            pointer_script('''
                                const dialog = document.querySelector('[data-bookmark-create-dialog]');
                                if (!dialog?.open || !dialog.contains(document.activeElement) || document.activeElement.textContent.trim() !== 'Отмена') {
                                    throw new Error('Native keyboard navigation escaped the creation dialog');
                                }
                            ''')
                            result['results'].append('Native arrow and Tab keys navigate the creation modal without switching bookmark panels')
                            command('WebDriver:PerformActions', {'actions': [{
                                'type': 'key', 'id': 'creation-keyboard', 'actions': [
                                    {'type': 'keyDown', 'value': '\ue00c'},
                                    {'type': 'keyUp', 'value': '\ue00c'}
                                ]
                            }]})
                            pointer_script('''
                                const deadline = Date.now() + 10000;
                                while (Date.now() < deadline) {
                                    if (!document.querySelector('[data-bookmark-create-dialog]') && document.activeElement === window.creationTestFocus) {
                                        delete window.creationTestFocus;
                                        return;
                                    }
                                    await new Promise(resolve => setTimeout(resolve, 20));
                                }
                                throw new Error('Escape did not close the creation modal and restore pane focus');
                            ''')
                            result['results'].append('Native Escape cancels the creation dialog and restores the previous focused pane row')
                            for case in ['reorder', 'right', 'left', 'empty', 'cycle', 'escape', 'outside', 'parent', 'same-folder', 'scroll']:
                                points = pointer_script('return await window.dragTests.startCase(arguments[0]);', [case])
                                pointer_actions([
                                    {'type': 'pointerMove', **points['start'], 'duration': 0},
                                    {'type': 'pointerDown', 'button': 0},
                                    {'type': 'pointerMove', **points['end'], 'duration': 200}
                                ])
                                result['results'].append(pointer_script('return await window.dragTests.verifyHover(arguments[0]);', [case]))
                                if case in ['escape', 'scroll']:
                                    command('WebDriver:PerformActions', {'actions': [{
                                        'type': 'key', 'id': 'drag-keyboard', 'actions': [
                                            {'type': 'keyDown', 'value': '\ue00c'},
                                            {'type': 'keyUp', 'value': '\ue00c'}
                                        ]
                                    }]})
                                pointer_actions([{'type': 'pointerUp', 'button': 0}])
                                result['results'].append(pointer_script('return await window.dragTests.verifyDrop(arguments[0]);', [case]))
                        finally:
                            command('WebDriver:ReleaseActions')
                            pointer_script('await window.dragTests.cleanup(); delete window.dragTests;')
                        for assertion in result['results']:
                            print('PASS', assertion)
                        print(f"Passed {len(result['results'])} assertions in Firefox")
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
