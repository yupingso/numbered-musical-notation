#! /usr/bin/env python3

import nmn
import sys

def test():
    song = nmn.load_song('input/nmn1.txt', 'input/lyrics1.txt')
    song.to_tex_tikzpicture()

if __name__ == '__main__':
    test()
