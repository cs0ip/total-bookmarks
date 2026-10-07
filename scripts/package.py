"""Package built browser extensions as ZIP files with manifest.json at the root."""
import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent


def package(target):
    source = ROOT / 'dist' / target
    manifest_path = source / 'manifest.json'
    if not manifest_path.is_file():
        raise RuntimeError(f'Missing {target} build; run npm run build:{target} first')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    output = ROOT / 'dist' / 'packages'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'total-bookmarks-{manifest["version"]}-{target}.zip'
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(source.rglob('*')):
            if path.is_file():
                bundle.write(path, path.relative_to(source).as_posix())
    print(f'Packaged {target}: {archive.relative_to(ROOT)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', nargs='?', default='all', choices=['all', 'firefox', 'chrome'])
    target = parser.parse_args().target
    for browser in (['firefox', 'chrome'] if target == 'all' else [target]):
        package(browser)
