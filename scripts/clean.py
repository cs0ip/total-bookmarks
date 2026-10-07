"""Remove generated builds and archives before packaging."""
import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent


def clean(target):
    dist = ROOT / 'dist'
    directory = dist if target == 'all' else dist / target
    if directory.is_symlink():
        directory.unlink()
    elif directory.exists():
        shutil.rmtree(directory)
    if target != 'all':
        for archive in (dist / 'packages').glob(f'total-bookmarks-*-{target}.zip'):
            archive.unlink()
    print(f'Cleaned package outputs: {target}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', nargs='?', default='all', choices=['all', 'firefox', 'chrome'])
    clean(parser.parse_args().target)
