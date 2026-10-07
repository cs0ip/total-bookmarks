# Total Bookmarks — Firefox build instructions

This archive contains the original Svelte and TypeScript sources, local assets,
build scripts, and the npm dependency lockfile for Total Bookmarks. The Firefox
extension package is generated from these sources by Svelte, Vite, and Tailwind
CSS. No private packages, credentials, or external build services are required.

## Build environment

The release build was verified on:

- Linux Mint 22.3 (Ubuntu 24.04 base), x86_64.
- Node.js 24.12.0.
- npm 11.6.2.
- Python 3.12.3 (used for ZIP packaging; Python 3 is required).

Use these versions to reproduce the submitted package. All JavaScript dependency
versions are recorded in `package-lock.json`; install them with `npm ci`.

## 1. Install the build tools

Obtain Node.js 24.12.0 from the [official Node.js release archive](https://nodejs.org/dist/v24.12.0/)
and follow the installation instructions for your platform. Ensure that `node`
and `npm` are on `PATH`. If the npm version differs, install the release's npm
version with:

```sh
npm install --global npm@11.6.2
```

On Ubuntu 24.04 or Linux Mint 22.x, Python 3 and the ZIP extraction tool can be
installed with:

```sh
sudo apt-get update
sudo apt-get install python3 unzip
```

Verify the tools:

```sh
node --version
npm --version
python3 --version
```

The expected versions are `v24.12.0`, `11.6.2`, and `Python 3.12.3`.

## 2. Extract the source archive

Extract the submitted `total-bookmarks-<version>-source.zip` into an empty
directory and open a terminal in that directory. `package.json`,
`package-lock.json`, and `vite.config.ts` must be in the current directory.
Run all npm commands below from that source root, not from `docs/build/`.

## 3. Install the locked dependencies

```sh
npm ci
```

This step needs an internet connection to download the public dependencies from
the npm registry. Do not update dependencies or regenerate the lockfile.

## 4. Build and package the Firefox extension

```sh
npm run package:firefox
```

This command removes previous Firefox build outputs and source archives, checks
TypeScript and Svelte types, builds the extension, packages it, and creates a new
source archive. It does not launch Firefox or modify browser profiles.

The results are:

- `dist/firefox/`: the complete unpacked Firefox extension.
- `dist/packages/total-bookmarks-<version>-firefox.zip`: the extension package.
- `dist/packages/total-bookmarks-<version>-source.zip`: the accompanying sources.

The version is read from the project metadata and Firefox manifest. `manifest.json`
is at the root of the extension package. The package is unsigned; signing is
performed by Mozilla.

Compare the extracted contents of the generated Firefox ZIP with the submitted
extension ZIP. ZIP timestamps and compression metadata are not part of this
comparison. Do not compare the source archive with the extension package.

## Other build commands

```sh
npm run build:firefox  # Check types and generate dist/firefox/ without packaging
npm run package       # Clean dist/ and package Firefox, Chrome, and sources
npm run package:source # Package sources only; preserve browser builds and ZIPs
```

The standard build uses the checked-in PNG icon assets. Regenerating icons is
unnecessary; building the extension does not require image conversion libraries.

## Notes for code review

`src/` contains the original application code; `build/` contains manifest
generation; `public/` contains local icon assets. `vite.config.ts` selects the
Firefox compatibility implementations and generates extension metadata.

Svelte's runtime uses `innerHTML` to instantiate static compiler-generated
templates. Bookmark titles, bookmark URLs, and translations are rendered through
Svelte text expressions; the application does not use `{@html}` to insert them.

For the Chrome version, see [Chrome build instructions](chrome.md).
