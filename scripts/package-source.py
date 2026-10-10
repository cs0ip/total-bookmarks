"""Package original sources and English build instructions for both browsers."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILES = (
    'docs/build/firefox.md', 'docs/build/chrome.md', 'LICENSE', '.gitignore',
    'package.json', 'package-lock.json', 'index.html',
    'vite.config.ts', 'svelte.config.ts', 'tsconfig.json',
)
SOURCE_DIRECTORIES = ('src', 'public', 'build', 'scripts', 'tests')
EXCLUDED_DIRECTORIES = {'.git', 'node_modules', '__pycache__', 'dist', '.vite'}
SOURCE_README = """# Total Bookmarks — source code and build instructions

This archive contains the original sources, local assets, build scripts, and
npm dependency lockfile for Total Bookmarks.

Follow the English step-by-step instructions for the browser being reviewed:

- [Firefox](docs/build/firefox.md)
- [Chrome](docs/build/chrome.md)

Both guides specify the build environment, tool installation, dependency
installation, packaging commands, and output locations. Run npm commands from
the directory containing this README and package.json.
"""


def package_source():
    metadata = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    files = [ROOT / name for name in SOURCE_FILES]
    for name in SOURCE_DIRECTORIES:
        directory = ROOT / name
        if not directory.is_dir() or directory.is_symlink():
            raise RuntimeError(f'Missing or invalid source directory: {name}')
        for path in directory.rglob('*'):
            relative = path.relative_to(ROOT)
            if EXCLUDED_DIRECTORIES.intersection(relative.parts) or path.suffix == '.pyc':
                continue
            if path.is_symlink():
                raise RuntimeError(f'Source archive cannot include a symbolic link: {relative}')
            if path.is_file():
                files.append(path)
    for path in files:
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f'Missing or invalid source file: {path.relative_to(ROOT)}')
    output = ROOT / 'dist/packages'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'total-bookmarks-{metadata["version"]}-source.zip'
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(files):
            bundle.write(path, path.relative_to(ROOT).as_posix())
        bundle.writestr('README.md', SOURCE_README)
    print(f'Packaged sources: {archive.relative_to(ROOT)}')


if __name__ == '__main__':
    package_source()
