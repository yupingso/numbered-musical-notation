import re
from fractions import Fraction
from collections import namedtuple

from core import Note, Node, NodeType, Tie, Slur, Triplet, OutputLine
from writer import LatexWriter


Time = namedtuple('Time', ['upper', 'lower', 'hyphen'])


def _get_key_scale(key):
    """Get the scale (a set of notes) for `key`.

    Args:
        key (tuple)

    Returns:
        tuple: A 8-tuple `scale`. For example:
            - D major: (?, 1,  0,  0,  1,  0,  0,  0)
            - A flat major: (?, 0, -1, -1,  0,  0, -1, -1)
            Note that `scale[0]` is not defined.

    """
    flat = [0, 7, 3, 6, 2, 5, 1, 4]
    sharp = [0, 4, 1, 5, 2, 6, 3, 7]
    key2sym = {}
    for x in [-1, 1]:       # flat or sharp
        a = [0] * 8
        for n in range(8):  # number of x
            pitch = (4 * x * n) % 7 + 1
            tmp = 0
            if x == -1 and n >= 2:
                tmp = -1
            elif x == 1 and n >= 6:
                tmp = 1
            if x == -1:
                a[flat[n]] = -1
            else:
                a[sharp[n]] = 1
            key2sym[(pitch, tmp)] = tuple(a)
    return key2sym[key]


def parse_pitch(key, s):
    key_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
    extended_upper_digit_name_dict = {'8': 1, '9': 2}
    extended_upper_name_dict = dict(zip('qwertyu', range(1, 8)))
    extended_upper_name_dict.update(extended_upper_digit_name_dict)
    extended_lower_name_dict = dict(zip('zxcvbnm', range(1, 8)))
    acc_dict = {'': None, '#': 1, '$': -1, '%': 0}
    match = re.fullmatch(r"([#$%]?)([0-9a-zA-Z])([',]*)", s)
    if match is None:
        raise ValueError('wrong format for pitch {}'.format(s))
    acc, name, octave = match.groups()
    acc = acc_dict[acc]
    octave = octave.count("'") - octave.count(',')
    if name == '0':
        acc, name, octave = None, Note.REST, 0
    elif name == 'o':
        acc, name, octave = None, Note.REST_AT_END, 0
    elif name == 'O':
        acc, name, octave = None, Note.REST_TO_MATCH_LYRICS, 0
    elif key == 'solfa':
        if name in '1234567':
            name = int(name)
        elif name in extended_upper_name_dict:
            name = extended_upper_name_dict[name]
            octave += 1
        elif name in extended_lower_name_dict:
            name = extended_lower_name_dict[name]
            octave -= 1
        else:
            raise ValueError('{!r} is not allowed in <key> solfa'.format(s))
    else:
        if name in '1234567':
            name = int(name)
        elif name in 'cdefgabCDEFGAB':
            name = key_dict[name.upper()]
        elif name in extended_upper_digit_name_dict:
            name = extended_upper_digit_name_dict[name]
            octave += 1
        else:
            raise ValueError('{!r} is not allowed in key {}'.format(name, key))
        scale = _get_key_scale(key)
        if acc is not None:
            acc -= scale[name]         # relative to key
        if key[0] <= 4:                 # <= #F major
            if name < key[0]:
                octave -= 1
        else:                           # >= G major
            if name >= key[0]:
                octave += 1
        name = (name - key[0]) % 7 + 1  # movable
    assert acc in [None, -1, 0, 1]
    assert name in [1, 2, 3, 4, 5, 6, 7, Note.REST, Note.REST_AT_END,
                    Note.REST_TO_MATCH_LYRICS]
    assert octave in [-1, 0, 1]
    if name in (Note.REST, Note.REST_AT_END, Note.REST_TO_MATCH_LYRICS):
        assert acc is None
        assert octave == 0
    return acc, name, octave


class Song:
    """Member variables.

    key: (name, accidental, 8-tuple)
        tuple[i] indicates whether i is flat or sharp. For example,
        key = (2,  0, (?, 1,  0,  0,  1,  0,  0,  0)) stands for D major.
    melody: list of bars
        bar: (time, start_beat, [notes])
    lyrics: list of sections
        section: (tag, [strings])
    """
    def __init__(self):
        self.key = None
        self.melody = []
        self.lyrics = []
        self.slur_starts_at_leading_note = True

    def __str__(self):
        lines = [
            '<key> {}'.format(self.key),
            '<melody> {}'.format(self.melody),
            '<lyrics> {}'.format(self.lyrics),
        ]
        return '\n'.join(lines)

    def append_time_signature(self, time, s):
        """Append bars to self.melody.

        Split s into bars by '|'. If the duration of a bar exceeds time, split
        it further based on whether it is the first bar.
        """
        if not time:
            raise ValueError('unknown <time>')
        if not s:
            return

        pattern_pitch = r"[#$%]?[0-9a-zA-Z][',]*"
        pattern_pitches = r'\[(?:{})+\]'.format(pattern_pitch)
        pattern_duration = r'(?:[_=]+|-*)\.*(?:/3)?'
        pattern = ('(~?)'
                   + '({}|{})({})'.format(pattern_pitch, pattern_pitches,
                                          pattern_duration)
                   + '(~?)')

        bars = s.split('|')
        for i, bar in enumerate(bars):
            if not bar:
                continue

            bar_duration = Fraction(0)
            note_list = []

            # parse notes in bar
            notes = re.findall(pattern, bar)
            if ''.join([''.join(note) for note in notes]) != bar:
                raise ValueError('wrong format for {} (notes = {})'
                                 .format(bar, notes))
            for tie0, pitches, duration, tie1 in notes:
                tie0, tie1 = (tie0 != ''), (tie1 != '')
                dots = duration.count('.')
                dashes = duration.count('-')
                underlines = duration.count('=') * 2 + duration.count('_')
                if dashes > 0 and underlines > 0:
                    raise ValueError('wrong format for {}'.format(notes))
                triplet = Fraction(1)
                if '/3' in duration:
                    triplet = Fraction(2, 3)
                if time.hyphen:
                    if pitches.startswith('[') and pitches.endswith(']'):
                        duration = (Fraction(dashes + 1, 1 << underlines)
                                    * (Fraction(2) - Fraction(1, 1 << dots))
                                    * triplet)
                    else:
                        if dots or underlines or (triplet != 1):
                            raise ValueError('dots, underlines and triplets '
                                             'are not allowed without '
                                             'brackets in '
                                             '<time> {}/{} hyphen={}'
                                             .format(*time))
                        duration = Fraction(dashes + 1, time.hyphen // 4)
                        dashes, underlines, dots = None, None, None
                else:
                    duration = (Fraction(dashes + 1, 1 << underlines)
                                * (Fraction(2) - Fraction(1, 1 << dots))
                                * triplet)
                pitches = pitches.lstrip('[').rstrip(']')
                pitches = re.findall('({})'.format(pattern_pitch), pitches)

                for k, pitch in enumerate(pitches):
                    acc, name, octave = parse_pitch(self.key, pitch)
                    tie = [tie0, tie1]
                    if k > 0:
                        tie[0] = False
                    if k < len(pitches) - 1:
                        tie[1] = False
                    # new Note
                    note = Note(acc, name, octave, duration, dashes,
                                underlines, dots, tie)
                    note_list.append(note)
                    bar_duration += duration
            assert note_list

            # append to self.melody
            if time.upper is None:
                time_duration = bar_duration
            elif time.lower == 4:
                time_duration = Fraction(time.upper)
            else:
                time_duration = Fraction(time.upper, 2)
            if i == 0 and len(bars) > 1:        # first bar but not last
                beat = ((time_duration - (bar_duration % time_duration))
                        % time_duration)
            else:
                beat = Fraction(0)
            if beat > 0:
                self.melody.append((time, beat, []))            # new bar
            for note in note_list:
                assert note.duration > 0
                remaining_duration = note.duration
                first = True
                while remaining_duration > 0:
                    if beat == 0:
                        self.melody.append((time, beat, []))    # new bar
                    sub_duration = min(remaining_duration,
                                       time_duration - beat)
                    if not time.hyphen and sub_duration != remaining_duration:
                        raise ValueError('{} goes beyond one bar with time '
                                         '{}/{}'
                                         .format(note, time.upper, time.lower))
                    sub_note = note.copy()
                    sub_note.duration = sub_duration
                    if not first:
                        sub_note.tie[0] = True
                    self.melody[-1][-1].append(sub_note)
                    remaining_duration -= sub_duration
                    beat += sub_duration
                    assert beat <= time_duration
                    if beat == time_duration:
                        beat = 0
                    first = False

    def make_ties_consistent(self):
        """If note0 and note1 are consecutive, make sure that
        (note0.tie[1] == note1.tie[0])."""
        if not self.melody:
            return
        prev_tie = False
        for time, start_beat, notes in self.melody:
            if not notes:
                raise ValueError('empty bar in self.melody')
            for note in notes:
                if prev_tie:
                    note.tie[0] = True
                if note.is_rest:
                    note.tie = [False, False]
                prev_tie = note.tie[1]
        self.melody[0][-1][0].tie[0] = False    # first note
        self.melody[-1][-1][-1].tie[1] = False  # last note

    def try_split_notes(self):
        """Try to split note, and modify self.melody in place.

        If note.lines or note.dots is None, splitting is necessary.
        For these sub-notes, perform a 2nd-staged grouping.
        """
        for time, start_beat, notes in self.melody:
            if not time.hyphen:
                continue
            subnotes = []
            beat = start_beat
            for note in notes:
                if note.lines is None or note.dots is None:
                    subnotes += Note.split_note(time, beat, note)
                else:
                    subnotes.append(note)
                beat += note.duration
            notes[:] = subnotes

    def merge_melody_lyrics(self):
        """Return a list of sections.

        section: (tag, lines)
        line: OutputLine
        bar: (time, start_beat, node indices)
        tie: (node_idx1, node_idx2)
        """
        # calculate split indices according to self.lyrics
        sum_len = 0
        split_sections = {}
        split_lines = []
        for i, (tag, lyrics) in enumerate(self.lyrics):
            split_sections[sum_len] = tag
            for j, s in enumerate(lyrics):
                if s.startswith('~'):
                    raise ValueError("a line of lyrics cannot start with '~' "
                                     "({})".format(s))
                split_lines.append(sum_len)
                sum_len += len(s)
        all_lyrics = ''.join([''.join(section[1]) for section in self.lyrics])
        num_words = len(all_lyrics)     # contains '~'

        # split melody
        lyrics_idx = 0
        # whether these are added for this lyrics_idx
        section_added, line_added = False, False
        line_node_idx_prev = -1
        potential_slur_start_line_node_idx = None
        sections = []
        for time, start_beat, notes in self.melody:
            beat = start_beat
            for k, note in enumerate(notes):
                # new section
                tag = split_sections.get(lyrics_idx)
                if tag and not section_added:
                    if note.may_start_new_line:
                        sections.append((tag, []))
                        section_added = True
                # new line
                if lyrics_idx in split_lines and not line_added:
                    if note.may_start_new_line:
                        sections[-1][1].append(OutputLine())
                        line_added = True
                        line_node_idx_prev = -1
                        potential_slur_start_line_node_idx = None
                line = sections[-1][1][-1]
                nodes = line.nodes
                bars = line.bars
                ties = line.ties
                slurs = line.slurs
                line_node_idx = len(nodes)
                # new bar
                if k == 0 or not bars:
                    bars.append((time, beat, []))
                # handle slurs
                if note.is_rest:
                    # rest cannot in a slur
                    potential_slur_start_line_node_idx = None
                else:
                    if note.to_match_lyrics and all_lyrics[lyrics_idx] == '~':
                        # check if lyrics_idx is the slur end node
                        if (lyrics_idx == num_words - 1
                                or all_lyrics[lyrics_idx + 1] != '~'):
                            if potential_slur_start_line_node_idx is None:
                                raise ValueError(
                                        'start note of slur not found')
                            slurs.append(
                                Slur(potential_slur_start_line_node_idx,
                                     line_node_idx))
                            potential_slur_start_line_node_idx = None
                    # update potential_slur_start_line_node_idx
                    cur_lyrics_idx = (lyrics_idx if note.to_match_lyrics
                                      else lyrics_idx - 1)
                    assert cur_lyrics_idx >= 0
                    if (cur_lyrics_idx < num_words
                            and all_lyrics[cur_lyrics_idx] != '~'):
                        if self.slur_starts_at_leading_note:
                            if note.is_first_in_tie:
                                potential_slur_start_line_node_idx = \
                                        line_node_idx
                        else:
                            if note.is_last_in_tie:
                                potential_slur_start_line_node_idx = \
                                        line_node_idx
                # append note Node
                node = Node(note)
                bars[-1][-1].append(line_node_idx)
                if note.tie[0]:
                    ties.append(Tie(line_node_idx_prev, line_node_idx))
                    node.value.tie[0] = True
                    nodes[line_node_idx_prev].value.tie[1] = True
                else:
                    if note.to_match_lyrics:
                        if lyrics_idx >= num_words:
                            raise ValueError('#notes > {} words'
                                             .format(num_words))
                        lyrics = all_lyrics[lyrics_idx]
                        if note.is_rest:
                            if lyrics != 'O':
                                raise ValueError(
                                    f'note O cannot match lyrics "{lyrics}"')
                        elif lyrics != '~':
                            node.text = lyrics
                        lyrics_idx += 1
                        section_added, line_added = False, False
                nodes.append(node)
                line_node_idx_prev = line_node_idx
                # append dash Node's
                for _ in range(node.lines):
                    bars[-1][-1].append(len(nodes))
                    nodes.append(Node('-'))
                # append dot Node's
                for _ in range(node.dots):
                    bars[-1][-1].append(len(nodes))
                    nodes.append(Node('.'))
                beat += note.duration
        if lyrics_idx != num_words:
            raise ValueError('{} notes != {} words'
                             .format(lyrics_idx, num_words))

        return sections

    @classmethod
    def group_underlines(cls, sections):
        """Group underlines shared by contiguous notes.

        Also find triplets by modifying sections in place.

        section: (tag, lines)
        line: OutputLine
        bar: (time, start_beat, node indices)
        tie: (node_idx1, node_idx2)
        underlines_list: list of underlines
            underlines[k]: list of underlines in depth k
            underline: [node_idx1, node_idx2]
        triplet: [node_idx1, node_idx2, node_idx3]
        """
        for tag, lines in sections:
            for line in lines:
                underlines_list = [None]
                triplets = []
                triplet_duration = None
                for time, start_beat, idx_list in line.bars:
                    beat = start_beat
                    assert beat >= 0
                    idx_prev = None
                    for idx in idx_list:
                        node = line.nodes[idx]
                        note = node.value
                        if node.type != NodeType.NOTE:
                            continue
                        # triplet
                        if (time.lower == 4 and beat % Fraction(1) == 0) or \
                           (time.lower == 8 and beat % Fraction(3, 2) == 0):
                            new_group = True
                            triplet_duration = None
                        else:
                            new_group = False
                        if note.duration.denominator % 3 == 0:       # triplet
                            if (new_group or not triplets
                                    or note.duration != triplet_duration):
                                if triplets and len(triplets[-1]) != 3:
                                    raise ValueError('triplet with less than '
                                                     '3 notes')
                                triplets.append([idx])
                            elif len(triplets[-1]) == 3:
                                triplets.append([idx])
                            else:
                                triplets[-1].append(idx)
                            triplet_duration = note.duration
                        # underline
                        if node.lines < 0:
                            depth = -node.lines        # number of underlines
                            for _ in range(depth - len(underlines_list) + 1):
                                underlines_list.append([])
                            for k in range(1, depth + 1):
                                if new_group or not underlines_list[k]:
                                    underlines_list[k].append([idx, idx])
                                elif underlines_list[k][-1][1] == idx_prev:
                                    underlines_list[k][-1][1] = idx
                                else:
                                    underlines_list[k].append([idx, idx])
                        beat += note.duration
                        idx_prev = idx
                line.underlines_list = underlines_list
                line.triplets = [Triplet(*triplet) for triplet in triplets]

    def print(self):
        """Print the song to stdout."""
        sections = self.merge_melody_lyrics()
        self.group_underlines(sections)

        for tag, lines in sections:
            print('{:=^80}'.format(' ' + tag + ' '))
            for line in lines:
                nodes = line.nodes
                print('-' * 50)
                for time, start_beat, a in line.bars:
                    print('<time> {}/{} beat={}'
                          .format(time.upper, time.lower, start_beat))
                    for idx in a:
                        try:
                            print('    <node {:02d}> {}'
                                  .format(idx, nodes[idx]))
                        except UnicodeEncodeError:
                            nodes[idx].text = '?'
                            print('    <node {:02d}> {}'
                                  .format(idx, nodes[idx]))
                print('<ties> {}'.format(line.ties))
                print('<slurs> {}'.format(line.slurs))
                print('<underlines>')
                for k, underlines in enumerate(line.underlines_list):
                    if k >= 1:
                        print('    depth {}: {}'.format(k, underlines))
                print('<triplets> {}'.format(line.triplets))

    def output_to_tex(self, output_dir):
        """Output the song to latex files.

        The tikzpicture package is used to draw the nodes.
        """
        sections = self.merge_melody_lyrics()
        self.group_underlines(sections)

        writer = LatexWriter(sections)
        writer.save(output_dir)


def parse_key(s):
    """Convert key string to ([1-7], 0 or 1 or -1).

    Args:
        s (str): A key of pattern [#$]?[a-gA-G]|[0-7][#$]?. For example:
            - `$D`: D flat major
            - `3#`: A major

    Returns:
        tuple: A pair `(pitch, sharp or flat)`. For example, `(2, 0)` for D
            major, and `(6, -1)` for A flat major.

    """
    # construct table
    flat = [0, 7, 3, 6, 2, 5, 1, 4]
    sharp = [0, 4, 1, 5, 2, 6, 3, 7]
    sym2key = {}
    for x in [-1, 1]:       # flat or sharp
        a = [0] * 8
        for n in range(8):  # number of x
            pitch = (4 * x * n) % 7 + 1
            tmp = 0
            if x == -1 and n >= 2:
                tmp = -1
            elif x == 1 and n >= 6:
                tmp = 1
            if x == -1:
                a[flat[n]] = -1
            else:
                a[sharp[n]] = 1
            sym2key[(n, x)] = (pitch, tmp)

    # parse
    if not s:
        raise ValueError('empty key')
    elif s == 'solfa':
        return s
    if re.search(r'\d', s):     # s contains digits
        if len(s) == 1:
            if s[0] != '0':
                raise ValueError('wrong format for <key> {}'.format(s))
            return 1, 0
        if len(s) != 2 or s[0] not in '01234567' or s[1] not in '#$':
            raise ValueError('wrong format for <key> {}'.format(s))
        if s[1] == '#':
            x = 1
        else:
            x = -1
        return sym2key[(int(s[0]), x)]
    else:
        pitch = s[-1].upper()
        pitch_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
        if pitch not in pitch_dict:
            raise ValueError('wrong format for <key> {}'.format(s))
        pitch = pitch_dict[pitch]
        tmp = 0
        if len(s) == 2:
            if s[0] == '#':
                tmp = 1
            elif s[0] == '$':
                tmp = -1
            else:
                raise ValueError('wrong format for <key> {}'.format(s))
        return pitch, tmp


def parse_time(s):
    """Convert time signature string to a pair of integers."""
    hyphen = None
    ss = s.split(maxsplit=1)
    if len(ss) > 1:
        hyphen = ss[1].replace(' ', '')
        if not hyphen.startswith('hyphen='):
            raise ValueError('wrong format for <time> {}'.format(s))
        hyphen = hyphen[7:]
        if hyphen not in ['4', '8', '16']:
            raise ValueError('only hyphen=[4,8,16] is allowed')
        hyphen = int(hyphen)
    ss = ss[0].replace(' ', '').split('/')
    if not ss:
        raise ValueError('empty <time>')
    if len(ss) != 2:
        raise ValueError('wrong format for <time> {}'.format(s))
    if ss[0] == '?':
        a, b = None, int(ss[1])
    else:
        a, b = int(ss[0]), int(ss[1])
    if (a, b) not in [(2, 4), (3, 4), (4, 4), (6, 8), (9, 8), (12, 8),
                      (None, 4), (None, 8)]:
        raise ValueError('unrecognizable <time> {}/{}'.format(a, b))
    if hyphen and hyphen < b:
        raise ValueError('hyphen must >= {} for <time> {}/{}'.format(b, a, b))
    return Time(a, b, hyphen)


def load_song(melody_file, lyrics_file=None):
    """Load numbered musical notation and lyrics, and return Song."""
    song = Song()

    key_cfg = '<key>'
    time_cfg = '<time>'
    slur_cfg = '<slur_starts_at_leading_note>'

    # melody
    with open(melody_file) as f:
        time = None
        s = ''
        for line in f:
            line = line.strip()
            if line == 'break':
                break
            elif not line or line.startswith('//'):     # blank or comment
                continue
            elif line.startswith(key_cfg):
                if song.key:
                    raise ValueError('only one <key> is allowed')
                song.key = parse_key(line[len(key_cfg):].strip())
            elif line.startswith(time_cfg):
                if time:
                    song.append_time_signature(time, s)
                time = parse_time(line[len(time_cfg):].strip())
                s = ''
            elif line.startswith(slur_cfg):
                value = bool(int(line[len(slur_cfg):].strip()))
                song.slur_starts_at_leading_note = value
            else:
                s += line.replace(' ', '')
        song.append_time_signature(time, s)
    song.try_split_notes()
    song.make_ties_consistent()

    # lyrics
    with open(lyrics_file, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            s = line
            for c in ' ,.!?' + '　。，、！？':
                s = s.replace(c, '')
            if s == 'break':
                break
            elif not s or s.startswith('//'):
                continue
            elif s.startswith('<tag>'):
                tag = s[5:]
                song.lyrics.append((tag, []))
            else:
                if not song.lyrics:
                    raise ValueError('no <tag> specified before {}'
                                     .format(line))
                song.lyrics[-1][1].append(s)

    return song
