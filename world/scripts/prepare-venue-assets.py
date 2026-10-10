"""Stage original generated GLBs without reducing their textures or geometry.

Usage: python3 scripts/prepare-venue-assets.py RAW_DIRECTORY OUTPUT_DIRECTORY
The installed file is byte-for-byte identical to the Higgsfield download.
"""
from pathlib import Path
import shutil
import sys


def prepare(source: Path, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != target.resolve():
        shutil.copyfile(source, target)
    print(f'{source.name}: preserved {target.stat().st_size:,} original bytes')


if __name__ == '__main__':
    source_dir, output_dir = map(Path, sys.argv[1:3])
    for file in sorted(source_dir.glob('*.glb')):
        prepare(file, output_dir / file.name)
