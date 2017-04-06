import sys
from os.path import isfile
import re
from fractions import Fraction


class Note:
    """Member variables

    acc: accidental
        None, -1 (flat), 1 (sharp), 0 (natural)
    name: 0-7 as in numbered musical notation
    octave: int
    duration: Fraction
    line: # dash or underline
        line = 0: duration = 1
        line < 0: duration = 2 ** line
        line > 0: dash = line
    dot: # dots
    tie: 2-tuple of bool
        tie[0] = True: tied with the previous Note
        tie[1] = True: tied with the next Note
    """
    def __init__(self, acc, name, octave=0, duration=Fraction(1), dash=0, underline=0, dot=0, tie=(False, False)):
        self.acc = acc
        self.name = name
        self.octave = octave
        self.duration = duration
        if dash > 0:
            self.line = dash
        else:
            self.line = -underline
        self.dot = dot
        self.tie = list(tie)
    
    def __str__(self):
        acc_str = {-1: 'b', 0: '%', 1: '#', None: ' '}
        oct_str = {-2: ',,', -1: ',', 0: '', 1: "'", 2: "''"}
        return "{}{}{:2} {:4}".format(
                acc_str[self.acc], self.name, oct_str[self.octave], str(self.duration), self.tie)

    def __repr__(self):
        return "'{}'".format(self.__str__())


NOTE_NODE = 0
DASH_NODE = 1
DOT_NODE = 2


class Node:
    def __init__(self, note):
        if isinstance(note, Note):
            self.type = NOTE_NODE
        elif note == '-':
            self.type = DASH_NODE
        elif note == '.':
            self.type = DOT_NODE
        else:
            raise ValueError("unknown node type {}".format(note))
        self.value = note
        self.text = None

    def __str__(self):
        if self.type == NOTE_NODE:
            if self.value.tie[1]:
                return "{} {} ~".format(self.value, self.text)
            else:
                return "{} {}".format(self.value, self.text)
        else:
            return " {}".format(self.value)


def parse_pitch(key, s):
    key_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
    acc_dict = {'': None, '#': 1, '$': -1, '%': 0}
    acc, name, octave = re.fullmatch(r"([#$%]?)([0-7a-gA-G])([',]*)", s).groups()
    acc = acc_dict[acc]
    octave = octave.count("'") - octave.count(',')
    if name in '01234567':
        name = int(name)
    else:
        name = key_dict[name.upper()]   # fixed
        if acc is not None:
            acc -= key[2][name]    # relative to key
        if key[0] <= 3:                 # <= E major
            if name < key[0]:
                octave -= 1
        else:                           # >= F major
            if name <= key[0]:
                octave += 1
        name = (name - key[0]) % 7 + 1 # movable
    if not name:
        acc, octave = 0, 0
    return acc, name, octave


class Song:
    """Member variables
    
    key: (name, accidental, 8-tuple)
        tuple[i] indicates whether i is flat or sharp.
        For example, key = (2,  0, (?, 1,  0,  0,  1,  0,  0,  0)) stands for D major.
    melody: list of bars
        bar: (time, [notes])
    lyrics: list of sections
        section: (tag, [strings])
    """
    def __init__(self):
        self.key = None
        self.melody = []
        self.lyrics = []

    def __str__(self):
        return "<key> {}, <time> {}\n".format(self.key, self.time) \
             + "<first_bar> {}\n".format(self.first_bar_duration) \
             + "<melody> {}\n".format(self.melody) \
             + "<lyrics> {}".format(self.lyrics)
    
    def print(self):
        print("<key> {}".format(self.key))
        for time, notes in self.melody:
            print("{}".format("<time> {}/{}".format(*time)))
            for note in notes:
                print("    {}".format(note))
        for tag, lyrics in self.lyrics:
            print("<{}> {}".format(tag, lyrics))

    def append_time_signature(self, time, s):
        """Append bars to self.melody.
        
        Split s into bars by '|'.
        If the duration of a bar exceeds time, split it further based on whether it is the first bar.
        """
        if not time:
            raise ValueError("unknown <time>")
        if not s:
            return
        
        pattern_pitch = r"[#$%]?[0-7a-gA-G][',]*"
        pattern_pitches = r"\[(?:{})+\]".format(pattern_pitch)
        pattern_duration = r"(?:[_=]+|-*)\.*(?:/3)?"
        pattern = "(~?)" + r"({}|{})({})".format(pattern_pitch, pattern_pitches, pattern_duration) + "(~?)"

        bars = s.split('|')
        for i, bar in enumerate(bars):
            if not bar:
                continue
            
            bar_duration = Fraction(0)
            note_list = []
            
            notes = re.findall(pattern, bar)
            if ''.join([''.join(note) for note in notes]) != bar:
                raise ValueError("wrong format for {} (notes = {})".format(bar, notes))
            for tie0, pitches, duration, tie1 in notes:
                tie0, tie1 = (tie0 != ''), (tie1 != '')
                dots = duration.count('.')
                counts = duration.count('-') + 1
                unders = duration.count('=') * 2 + duration.count('_')
                if counts > 1 and unders > 0:
                    raise ValueError("wrong format for {}".format(notes))
                triplet = Fraction(1)
                if "/3" in duration:
                    triplet = Fraction(2, 3)
                duration = Fraction(counts, 1 << unders) * (Fraction(2) - Fraction(1, 1 << dots)) * triplet
                pitches = pitches.lstrip('[').rstrip(']')
                pitches = re.findall(r"({})".format(pattern_pitch), pitches)
                
                for k, pitch in enumerate(pitches):
                    acc, name, octave = parse_pitch(self.key, pitch)
                    tie = [tie0, tie1]
                    if k > 0:
                        tie[0] = False
                    if k < len(pitches) - 1:
                        tie[1] = False
                    # new Note
                    note = Note(acc, name, octave, duration, counts - 1, unders, dots, tie)
                    note_list.append(note)
                    bar_duration += duration
            
            # append to self.melody
            if time[1] == 4:
                time_duration = Fraction(time[0])
            else:
                time_duration = Fraction(time[0], 2)
            if i == 0 and len(bar) > 1:     # first bar but not last
                count = (time_duration - (bar_duration % time_duration)) % time_duration
            else:
                count = Fraction(0)
            if count > 0:
                self.melody.append((time, []))
            for note in note_list:
                if count == 0:
                    self.melody.append((time, []))
                count += note.duration
                if count > time_duration:
                    raise ValueError("{} goes beyond one bar".format(note))
                elif count == time_duration:
                    count = Fraction(0)
                self.melody[-1][1].append(note)

    def merge_melody_lyrics(self):
        """Return sections, a list of sections.
        
        section: (tag, lines)
        line: [nodes, list of bars, list of ties]
        bar: (time, node indices)
        tie: (node_idx1, node_idx2)
        """
        # calculate split indices according to self.lyrics
        sum_len = 0
        split_sections = {}
        split_lines = []
        for i, (tag, lyrics) in enumerate(self.lyrics):
            split_sections[sum_len] = tag
            for j, s in enumerate(lyrics):
                split_lines.append(sum_len)
                sum_len += len(s)
        all_lyrics = ''.join([''.join(section[1]) for section in self.lyrics])
        num_words = len(all_lyrics)     # contains '-'

        # split melody
        note_idx = 0
        line_note_idx = 0
        line_node_idx = 0
        line_node_idx_prev = -1
        prev_tie = False
        sections = []
        for time, notes in self.melody:
            for k, note in enumerate(notes):
                note_tied = (note.tie[0] or prev_tie) and (line_node_idx > 0)
                if not note_tied and note_idx >= num_words:
                    raise ValueError("#notes > {} words".format(num_words))
                # new section
                if not note_tied and note_idx in split_sections:
                    tag = split_sections[note_idx]
                    sections.append((tag, []))
                # new line
                if not note_tied and note_idx in split_lines:
                    sections[-1][1].append([[], [], []])    # (nodes, bars, ties)
                    line_note_idx = 0
                    line_node_idx_prev = -1
                    prev_tie = False
                line = sections[-1][1][-1]
                nodes, bars, ties = line
                # new bar
                if k == 0 or not bars:
                    bars.append((time, []))
                # append note Node
                node = Node(note)
                line_node_idx = len(nodes)
                bars[-1][1].append(line_node_idx)
                if note_tied:
                    ties.append((line_node_idx_prev, line_node_idx))
                    note.tie[0] = True
                    nodes[line_node_idx_prev].value.tie[1] = True
                else:
                    if all_lyrics[note_idx] != '-':
                        node.text = all_lyrics[note_idx]
                    note_idx += 1
                    line_note_idx += 1
                nodes.append(node)
                prev_tie = note.tie[1]
                line_node_idx_prev = line_node_idx
                # append dash Node's
                for _ in range(note.line):
                    bars[-1][1].append(len(nodes))
                    nodes.append(Node('-'))
                # append dot Node's
                for _ in range(note.dot):
                    bars[-1][1].append(len(nodes))
                    nodes.append(Node('.'))
        return sections
    
    def group_underlines(self, sections):
        """Group underlines shared by contiguous notes by modifying sections in place.
        
        section: (tag, lines)
        line: [nodes, list of bars, list of ties, level_underlines_list]
        bar: (time, node indices)
        tie: (node_idx1, node_idx2)
        level_underlines_list: list of level_underlines
            level_underlines[k]: list of underlines in level k
            underline: [node_idx1, node_idx2]
        """
        for tag, lines in sections:
            for line in lines:
                nodes, bars, ties = line
                underlines_list = [None]
                for time, idx_list in bars:
                    if time[1] == 4:
                        time_duration = Fraction(time[0])
                    else:
                        time_duration = Fraction(time[0], 2)
                    bar_duration = sum([nodes[idx].value.duration for idx in idx_list if nodes[idx].type == NOTE_NODE])
                    beat = time_duration - bar_duration
                    assert beat >= 0
                    for idx in idx_list:
                        node = nodes[idx]
                        note = node.value
                        if node.type != NOTE_NODE or note.line >= 0:
                            continue
                        level = -note.line        # number of underlines
                        for _ in range(level - len(underlines_list) + 1):
                            underlines_list.append([])
                        for k in range(1, level + 1):
                            if beat.denominator == 1 or not underlines_list[k]:
                                underlines_list[k].append([idx, idx])
                            elif underlines_list[k][-1][1] == idx - 1:
                                underlines_list[k][-1][1] = idx
                        beat += note.duration
                line.append(underlines_list)

    def to_tex_tikzpicture(self, filename=None):
        """Write environment tikzpicture source code to file if provided;
        otherwise write to stdout.
        """
        sections = self.merge_melody_lyrics()
        self.group_underlines(sections)
        for tag, lines in sections:
            print("{:=^80}".format(' ' + tag + ' '))
            for nodes, bars, ties, underlines_list in lines:
                print("-" * 50)
                #for k, note in enumerate(notes):
                #    print("<note {:02d}> {}".format(k, note))
                for time, a in bars:
                    print("<time> {}/{}".format(time[0], time[1]))
                    for idx in a:
                        print("    {}".format(nodes[idx]))
                print("<ties> {}".format(ties))
                print("<underlines>")
                for k, underlines in enumerate(underlines_list):
                    if k >= 1:
                        print("    level {}: {}".format(k, underlines))


def parse_key(s):
    """Convert key string to ([1-7], 0 or 1 or -1, list of sharps or flats).

    s = [#$]?[a-gA-G]|[0-7][#$]?
    For example,
    s = '$D': D flat major
    s = '3#': A major
    key = (2,  0, (?, 1,  0,  0,  1,  0,  0,  0)): D major
    key = (6, -1, (?, 0, -1, -1,  0,  0, -1, -1)): A flat major
    """
    # construct table
    flat = [0, 7, 3, 6, 2, 5, 1, 4]
    sharp = [0, 4, 1, 5, 2, 6, 3, 7]
    sym2key = {}
    key2sym = {}
    for x in [-1, 1]:       # flat or sharp
        a = [0] * 8
        for n in range(8):  # number of x
            key = (4 * x * n) % 7 + 1
            tmp = 0
            if x == -1 and n >= 2:
                tmp = -1
            elif x == 1 and n >= 6:
                tmp = 1
            if x == -1:
                a[flat[n]] = -1
            else:
                a[sharp[n]] = 1
            sym2key[(n, x)] = (key, tmp, tuple(a))
            key2sym[(key, tmp)] = (n, x, tuple(a))

    # parse
    if not s:
        raise ValueError("empty key")
    if re.search(r'\d', s):     # s contains digits
        if len(s) == 1:
            if s[0] != '0':
                raise ValueError("wrong format for <key> {}".format(s))
            return (1, 0)
        if len(s) != 2 or s[0] not in '01234567' or s[1] not in '#$':
            raise ValueError("wrong format for <key> {}".format(s))
        if s[1] == '#':
            x = 1
        else:
            x = -1
        return sym2key[(int(s[0]), x)]
    else:
        key = s[-1].upper()
        key_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
        if key not in key_dict:
            raise ValueError("wrong format for <key> {}".format(s))
        key = key_dict[key]
        tmp = 0
        if len(s) == 2:
            if s[0] == '#':
                tmp = 1
            elif s[0] == '$':
                tmp = -1
            else:
                raise ValueError("wrong format for <key> {}".format(s))
        return (key, tmp, key2sym[(key, tmp)][2])


def parse_time(s):
    """Convert time signature string to a pair of integers."""
    ss = s.replace(' ', '').split('/')
    if not ss:
        raise ValueError("empty <time>")
    if len(ss) != 2:
        raise ValueError("wrong format for <time> {}".format(s))
    a, b = int(ss[0]), int(ss[1])
    if (a, b) not in [(4, 4), (3, 4), (6, 8), (9, 8), (12, 8)]:
        raise ValueError("unrecognizable <time> {}/{}".format(a, b))
    return (a, b)


def load_song(melody_file, lyrics_file=None):
    """Load numbered musical notation and lyrics, and return Song."""
    song = Song()
    
    # melody
    with open(melody_file) as f:
        time = None
        s = ""
        for line in f:
            line = line.strip()
            if line == 'break':
                break
            elif not line or line.startswith("//"):     # blank or comment
                continue
            elif line.startswith("<key>"):
                if song.key:
                    raise ValueError("only one <key> is allowed")
                song.key = parse_key(line[5:].strip())
            elif line.startswith("<time>"):
                if time:
                    song.append_time_signature(time, s)
                time = parse_time(line[6:].strip())
                s = ""
            else:
                s += line.replace(' ', '')
        song.append_time_signature(time, s)

    # lyrics
    with open(lyrics_file) as f:
        for line in f:
            line = line.strip()
            s = line
            for c in " ,.!?" + "　。，、！？":
                s = s.replace(c, '')
            if s == 'break':
                break
            elif not s or s.startswith("//"):
                continue
            elif s.startswith("<tag>"):
                tag = s[5:]
                song.lyrics.append((tag, []))
            else:
                if not song.lyrics:
                    raise ValueError("no <tag> specified before {}".format(line))
                song.lyrics[-1][1].append(s)
    
    return song


if __name__ == '__main__':
    sys.exit()

