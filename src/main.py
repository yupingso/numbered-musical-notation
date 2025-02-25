#!/usr/bin/env python3
import os
import argparse

import nmn


def main(input_dir, latex_dir=None):
    cur_dir = os.path.abspath('.')
    input_dir = os.path.join(cur_dir, input_dir)
    melody_file = os.path.join(input_dir, 'melody.txt')
    lyrics_file = os.path.join(input_dir, 'lyrics.txt')

    song = nmn.load_song(melody_file, lyrics_file)

    if latex_dir:
        song.output_to_tex(os.path.join(cur_dir, latex_dir))
    else:
        song.print()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir')
    parser.add_argument('latex_dir', nargs='?')
    args = parser.parse_args()
    main(args.input_dir, args.latex_dir)
