#! /usr/bin/env python3

import os
import sys

import nmn


def main(input_dir, to_tex=False):
    cur_dir = os.path.abspath('.')
    if input_dir:
        input_dir = os.path.join(cur_dir, input_dir)
    else:
        input_dir = os.path.join(cur_dir, 'input')
    melody_file = os.path.join(input_dir, 'melody.txt')
    lyrics_file = os.path.join(input_dir, 'lyrics.txt')

    song = nmn.load_song(melody_file, lyrics_file)

    if to_tex:
        song.to_tex_tikzpicture(os.path.join(cur_dir, 'latex/'))
    else:
        sections = song.merge_melody_lyrics(_debug=True)
        song.group_underlines(sections)
        song.print(sections)


if __name__ == '__main__':
    input_dir = None
    to_tex = False
    if len(sys.argv) > 1:
        input_dir = sys.argv[1]
        if len(sys.argv) > 2 and sys.argv[2] == 'latex':
            to_tex = True
    main(input_dir, to_tex)
