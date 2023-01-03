#!/usr/bin/env python3
import logging
import subprocess
from pathlib import Path


ROOT_PATH = Path(__file__).resolve().parent.parent
MAIN_PATH = ROOT_PATH / 'src/main.py'


def get_songs():
    songs_path = ROOT_PATH / 'songs'
    data_path = ROOT_PATH / 'tests/data'
    for song_path in sorted(songs_path.glob('song*')):
        output_path = data_path / song_path.name
        yield song_path, output_path


def _update(song_path, output_path):
    output = subprocess.check_output(f'{MAIN_PATH} {song_path}',
                                     shell=True, encoding='utf-8')
    with output_path.open('w') as f:
        f.write(output)
    logging.info(f'Written to {output_path.relative_to(ROOT_PATH)}')


def main():
    """Update test data."""
    for song_path, output_path in get_songs():
        _update(song_path, output_path)
    return 0


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    main()
