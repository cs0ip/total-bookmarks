# Total Bookmarks

Total Bookmarks is a dual-pane bookmark manager for Firefox and Chrome, inspired by Total Commander. It lets you browse different folders side by side and open saved pages.

- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/total-bookmarks/)
- [Chrome Web Store](https://chromewebstore.google.com/detail/total-bookmarks/lcnkhfjmdkbjinejjlkmejkimielebai)

## Building

You need Node.js and npm. Run the following commands in the project directory:

```sh
npm install
npm run build
```

The built extensions are in `dist/firefox/` and `dist/chrome/`. To build for a single browser, use `npm run build:firefox` or `npm run build:chrome`. To run type checking separately, use `npm run check`.

## Packaging

Packaging also requires Python 3. This command first removes all contents of `dist/`, then rebuilds both versions and creates ZIP archives:

```sh
npm run package
```

Output (`<version>` comes from `package.json`):

- `dist/packages/total-bookmarks-<version>-firefox.zip`
- `dist/packages/total-bookmarks-<version>-chrome.zip`
- `dist/packages/total-bookmarks-<version>-source.zip`

To package for a single browser, use `npm run package:firefox` or `npm run package:chrome`. These commands first remove the build and ZIP archives for the selected browser, preserving the other browser's output. The version from `package.json` is automatically included in both browser manifests and archive names. Each browser archive has `manifest.json` at its root, with no enclosing folder.

For the next release, run `npm version patch --no-git-tag-version`: npm increments the patch version and synchronizes `package-lock.json` without creating a commit or tag. Then run `npm run package`.

You can submit the Firefox archive to [Mozilla Add-ons for signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), choosing either a store listing or self-distribution (unlisted). Permanent installation in standard Firefox requires the resulting signed `.xpi` file; packaging alone does not sign the extension.

Upload the `source.zip` archive to Mozilla's separate source code field. It is created by `npm run package` and `npm run package:firefox`; you can also create it separately with `npm run package:source`, preserving the packaged extensions. The archive includes source code, the lock file, assets, scripts, and separate step-by-step build instructions in English for [Firefox](docs/build/firefox.md) and [Chrome](docs/build/chrome.md). The archive's root `README.md` links to both guides. Dependencies in `node_modules`, built extensions, and Git metadata are excluded.

The Chrome archive is suitable for [uploading to the Chrome Web Store](https://developer.chrome.com/docs/webstore/prepare). To test it locally, extract it and load the resulting folder using **Load unpacked**, as described below.

## Installing and running

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
3. Click the Total Bookmarks button on the browser toolbar to open the manager in a tab.
4. If the **Allow site icon downloads** button appears, click it and confirm website access in the Firefox permission prompt.

You need to load the temporary add-on again after restarting Firefox.

### Chrome

Chrome 148 or later is required. Local testing uses an **unpacked extension**, similar to loading a temporary add-on in Firefox, without publishing to the Chrome Web Store.

1. Run `npm install`, then `npm run build:chrome` in the project directory.
2. Open `chrome://extensions` and enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `dist/chrome/` directory containing `manifest.json`. Select the directory itself, rather than the manifest file.
4. Find Total Bookmarks in the extensions menu (the puzzle icon on the browser toolbar) and click it to open the manager in a tab. You can also pin its button using the pin icon.

The extension stays installed after restarting Chrome. When you have finished testing, click **Remove** on its card in `chrome://extensions`.

To test changes, run `npm run dev:chrome`. After rebuilding, click the **Reload** icon on the Total Bookmarks card in `chrome://extensions`, then refresh the manager tab. You do not need to select the directory again.

To inspect interface errors, press F12 in the manager tab. For background script errors, click the **service worker** link on the extension's card. Loading and reloading are also covered in the [official Chrome guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

Site icons come from Chrome's built-in cache. If an icon is missing from the cache, the browser displays a default icon. This build does not require access to all websites.

## Development

`npm run dev` automatically rebuilds the Firefox version when files change; `npm run dev:chrome` does the same for Chrome. These commands do not start a development server.

After rebuilding, reload the extension on `about:debugging` or `chrome://extensions`, then refresh the manager tab. This also applies changes to permissions and the background script.

## Tests

After building, run:

```sh
npm run test:i18n
npm run test:platform
python3 tests/run-site-icons.py
CHROME_BIN=/path/to/chrome-for-testing/chrome node tests/run-chrome.mjs
```

Browser tests run in separate temporary profiles and do not affect your bookmarks. Chrome tests require Chrome for Testing or a Chromium build that supports loading extensions from the command line.

## License

The Total Bookmarks source code is licensed under the [Mozilla Public License 2.0](LICENSE) (MPL-2.0).
