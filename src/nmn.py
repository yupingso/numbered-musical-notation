import os
import re
from fractions import Fraction
from enum import Enum
from collections import namedtuple


Time = namedtuple('Time', ['upper', 'lower', 'hyphen'])


class Note:
    """Musical note.

    Member variables:
        line: # dash or underline
            line = 0: duration = 1
            line < 0: duration = 2 ** line
            line > 0: dash = line

    """

    REST = 0
    REST_AT_END = -1
    REST_TO_MATCH_LYRICS = -2

    possible_ends = {}

    def __init__(self, acc, name, octave=0, duration=Fraction(1), dashes=0,
                 underlines=0, dots=0, tie=(False, False)):
        """Initialize a note.

        Args:
            acc: accidental
                None, -1 (flat), 1 (sharp), 0 (natural)
            name: 1-7 as in numbered musical notation
                0 (REST) for a rest, which may be placed at the beginning of a
                line
                -1 (REST_AT_END) for a rest, which may be placed at the end of
                a line
                -2 (REST_TO_MATCH_LYRICS) for a rest, which will be matched to
                lyrics
            octave (int)
            duration (Fraction)
            dashes (int): Number of dashes
            underlines (int): Number of underlines
            dots (int): Number of dots
            tie (tuple):
                tie[0] = True: tied with the previous Note
                tie[1] = True: tied with the next Note

        """

        self.acc = acc
        self._name = name
        self.octave = octave
        self.duration = duration
        if dashes is None:
            self.lines = None
            self.dots = None
        else:
            if dashes > 0:
                self.lines = dashes
            else:
                self.lines = -underlines
            self.dots = dots
        self.tie = list(tie)

    @property
    def name(self):
        return self._name if self._name >= 0 else 0

    @property
    def is_rest(self):
        return self._name <= 0

    @property
    def to_match_lyrics(self):
        return (not self.tie[0]
                and (self._name > 0
                     or self._name == self.REST_TO_MATCH_LYRICS))

    @property
    def may_start_new_line(self):
        return self._name != self.REST_AT_END and not self.tie[0]

    def copy(self):
        note = Note(self.acc, self._name, self.octave, self.duration)
        note.lines = self.lines
        note.dots = self.dots
        note.tie = self.tie.copy()
        return note

    @classmethod
    def init_possible_ends(cls, n, m):
        """Each beat is divided into (2**n) intervals, and there are m beats.

        Every duration consists of main duration and dots duration.
        The main duration consists of (2**k) intervals.
        """
        if (n, m) in cls.possible_ends:
            return
        num = m << n
        ends = [set() for _ in range(num)]
        # k < n
        for k in range(n):
            for a in range(0, num, 1 << k):
                start = a
                end = a + (1 << k)
                if end > num:
                    break
                ends[start].add(end)
                if (a >> k) % 2 == 0 and k > 0 and end + (1 << (k - 1)) < num:
                    ends[start + (1 << (k - 1))].add(end + (1 << (k - 1)))
                if (a >> k) % 2 == 1:
                    for j in range(k - 1, -1, -1):
                        start -= (1 << j)
                        if start < 0:
                            break
                        ends[start].add(end)
                else:
                    for j in range(k - 1, -1, -1):
                        end += (1 << j)
                        if end > num:
                            break
                        ends[start].add(end)
        # k >= n
        for k in range(n, n + m.bit_length()):
            for a in range(0, num, 1 << n):
                start = a
                end = a + (1 << k)
                if end > num:
                    break
                ends[start].add(end)
                if k > 0 and end + (1 << (k - 1)) < num:
                    ends[start + (1 << (k - 1))].add(end + (1 << (k - 1)))
                for j in range(k - 1, -1, -1):
                    start -= (1 << j)
                    if start < 0:
                        break
                    ends[start].add(end)
                start = a
                for j in range(k - 1, -1, -1):
                    end += (1 << j)
                    if end > num:
                        break
                    ends[start].add(end)
        for i in range(num):
            ends[i] = sorted(ends[i])
        cls.possible_ends[(n, m)] = ends

    @classmethod
    def split_note(cls, time, start_beat, note, _debug=False):
        debug_log = []
        if not time.hyphen:
            raise ValueError('no need to split note for time {}'.format(time))
        if time.upper is None:
            raise ValueError('cannot split note for time ?/{}'
                             .format(time.lower))
        note.lines, note.dots = None, None      # ignore lines and dots
        duration = note.duration
        p = time.hyphen.bit_length() - 3

        if time.lower == 4:
            unit = (1 << p)
            if time.upper == 2:
                n, m = p + 1, 1
            elif time.upper == 3:
                n, m = p, 3
            elif time.upper == 4:
                n, m = p + 2, 1
            else:
                raise ValueError('unknown time.upper {}'.format(time.upper))
            n_unit, m_unit = 0, time.upper
        else:
            unit = int(Fraction(3, 2) * (1 << p))
            n, m = p - 1, 3
            if time.upper == 6:
                n_unit, m_unit = 0, 2
            elif time.upper == 9:
                n_unit, m_unit = 0, 3
            elif time.upper == 12:
                n_unit, m_unit = 2, 1
            else:
                raise ValueError('unknown time.upper {}'.format(time.upper))

        cls.init_possible_ends(n, m)
        ends = cls.possible_ends[(n, m)]
        cls.init_possible_ends(n_unit, m_unit)
        ends_unit = cls.possible_ends[(n_unit, m_unit)]
        end = int((start_beat + duration) * (1 << p))
        subnotes = []
        beat = start_beat
        debug_log.append('note {}'.format(note))

        while beat < start_beat + duration:
            start = int(beat * (1 << p))
            subend = None
            # multiple of units
            if start % unit == 0:
                for e_rel in ends_unit[start // unit]:
                    e = e_rel * unit
                    if e > end:
                        break
                    # only a unit is allowed for <time> X/8
                    if time.lower == 8 and e != start + unit:
                        continue
                    subend = e
                    debug_log.append('      E {}'
                                     .format(Fraction(subend - start, 1 << p)))
            # contains 'dots'
            base = start - start % (1 << n)
            for e_rel in ends[start % (1 << n)]:
                e = base + e_rel
                if e > end:
                    break
                length = e - start
                if (time.lower == 4 and length >= unit * 2) or \
                   (time.lower == 8 and length > unit):
                    break
                debug_log.append('      e {}'.format(Fraction(length, 1 << p)))
                if subend is None or e > subend:
                    subend = e
            if subend is None:
                raise ValueError('cannot find ending point in ({}, {}]'
                                 .format(start, end))
            end_beat = Fraction(subend, 1 << p)
            subnote = note.copy()
            subnote.duration = end_beat - beat
            if not subnotes:                            # first
                if end_beat != start_beat + duration:   # not last
                    subnote.tie[1] = True
            else:
                subnote.tie[0] = True
                if note._name == Note.REST_TO_MATCH_LYRICS:
                    subnote._name = Note.REST
            subnotes.append(subnote)
            debug_log.append('   > {}'.format(subnote))
            beat = end_beat

        for i, subnote in enumerate(subnotes):
            if note.is_rest:
                subnote.tie[0] = False
                subnote.tie[1] = False
            else:
                if i > 0:
                    subnote.tie[0] = True
                if i < len(subnotes) - 1:
                    subnote.tie[1] = True

        if _debug:
            with open('log/split_note.log', 'w') as f:
                f.write('\n'.join(debug_log))
        return subnotes

    def __repr__(self):
        acc_str = {-1: 'b', 0: '%', 1: '#', None: ' '}
        oct_str = {-2: ',,', -1: ',', 0: '', 1: "'", 2: '"'}
        return '{}{}{:2} {:4}'.format(
                acc_str[self.acc], self.name, oct_str[self.octave],
                str(self.duration))


class NodeType(Enum):
    """Type of node."""

    NOTE = 0
    DASH = 1
    DOT = 2


class Node:
    def __init__(self, note):
        if isinstance(note, Note):
            self.type = NodeType.NOTE
            self.value = note
            self.lines = note.lines
            self.dots = note.dots
            # calculate self.lines and self.dots from note.duration
            if self.lines is None or self.dots is None:
                duration = note.duration
                if duration <= 0:
                    raise ValueError('duration <= 0 for note {}'.format(note))
                numerator, denominator = (duration.numerator,
                                          duration.denominator)
                n = denominator.bit_length() - 1
                if (1 << n) != denominator:
                    raise ValueError('duration.denominator is not '
                                     'a power of 2 for note {}'.format(note))
                one_groups = list(filter(None,
                                         '{:b}'.format(numerator).split('0')))
                if len(one_groups) != 1:
                    raise ValueError('duration {} cannot be represented as a '
                                     'single note'.format(note.duration))
                m = numerator.bit_length() - 1
                if duration % Fraction(1) == 0:
                    self.lines = int(duration) - 1
                    self.dots = 0
                else:
                    # not allowed (e.g., duration = 7/2)
                    if m > n:
                        raise ValueError('duration {} is not integral, '
                                         'but too long for a note'
                                         .format(note.duration))
                    # self.lines <= 0
                    self.lines = m - n
                    # (number of dots) = (number of ones) - 1
                    self.dots = len(one_groups[0]) - 1
        else:
            if note == '-':
                self.type = NodeType.DASH
            elif note == '.':
                self.type = NodeType.DOT
            else:
                raise ValueError('unknown node type for {}'.format(note))
            self.value = note
            self.lines = None
            self.dots = None
        self.text = None

    def __str__(self):
        if self.type == NodeType.NOTE:
            underlines = max(-self.lines, 0)
            if self.value.tie[1]:
                return '{} u{}  {} ~'.format(self.value, underlines, self.text)
            else:
                return '{} u{}  {}'.format(self.value, underlines, self.text)
        else:
            return ' {}'.format(self.value)


def parse_pitch(key, s):
    key_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
    extended_upper_name_dict = dict(zip('qwertyu', range(1, 8)))
    extended_upper_name_dict.update({'8': 1, '9': 2})
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
        else:
            raise ValueError('{!r} is not allowed in key {}'.format(name, key))
        if acc is not None:
            acc -= key[2][name]         # relative to key
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

        pattern_pitch = r"[#$%]?[0-7a-zA-Z][',]*"
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
        line: [nodes, list of bars, list of ties, list of slurs]
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
                        # (nodes, bars, ties, slurs)
                        sections[-1][1].append([[], [], [], []])
                        line_added = True
                        line_node_idx_prev = -1
                        potential_slur_start_line_node_idx = None
                line = sections[-1][1][-1]
                nodes, bars, ties, slurs = line
                line_node_idx = len(nodes)
                # new bar
                if k == 0 or not bars:
                    bars.append((time, beat, []))
                # handle slurs
                if not note.is_rest:
                    if not note.tie[0]:
                        if all_lyrics[lyrics_idx] == '~':
                            # check if lyrics_idx is the slur end node
                            if (lyrics_idx == num_words - 1
                                    or all_lyrics[lyrics_idx + 1] != '~'):
                                if potential_slur_start_line_node_idx is None:
                                    raise ValueError(
                                            'start note of slur not found')
                                slurs.append(
                                        (potential_slur_start_line_node_idx,
                                         line_node_idx))
                                potential_slur_start_line_node_idx = None
                        else:
                            potential_slur_start_line_node_idx = line_node_idx
                else:
                    # rest cannot in a slur
                    potential_slur_start_line_node_idx = None
                # append note Node
                node = Node(note)
                bars[-1][-1].append(line_node_idx)
                if note.tie[0]:
                    ties.append((line_node_idx_prev, line_node_idx))
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
        line: [nodes, bars, ties, slurs, underlines_list, triplets]
        bar: (time, start_beat, node indices)
        tie: (node_idx1, node_idx2)
        underlines_list: list of underlines
            underlines[k]: list of underlines in depth k
            underline: [node_idx1, node_idx2]
        triplet: [node_idx1, node_idx2, node_idx3]
        """
        for tag, lines in sections:
            for line in lines:
                nodes, bars, ties, slurs = line
                underlines_list = [None]
                triplets = []
                triplet_duration = None
                for time, start_beat, idx_list in bars:
                    beat = start_beat
                    assert beat >= 0
                    idx_prev = -9
                    for idx in idx_list:
                        node = nodes[idx]
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
                line.append(underlines_list)
                line.append(triplets)

    def to_tex_tikzpicture(self, output_dir=''):
        """Write environment tikzpicture source code to file if provided."""
        slides_file = os.path.join(output_dir, 'slides.tex')
        slides_output = []
        line_file_format = os.path.join(output_dir, 'line-{:02d}-{:d}.tex')
        page_count = 0

        sections = self.merge_melody_lyrics()
        self.group_underlines(sections)

        for i, (tag, lines) in enumerate(sections):
            # new section
            line_count = 0
            for j, (nodes, bars, ties, slurs, underlines_list,
                    triplets) in enumerate(lines):
                # new page
                if line_count % 2 == 0:
                    page_count += 1
                    if page_count > 1:
                        slides_output.append('\n')
                    slides_output.append('%%%%% PAGE {} %%%%%'
                                         .format(page_count))
                    slides_output.append(r'\newpage')
                    slides_output.append('')
                    if j == 0:      # first page in section
                        slides_output.append('% <{}>'.format(tag))
                        slides_output.append(r'\begin{nmntag}')
                        slides_output.append(r'\textmd{$<$\hspace{-0pt}' + tag
                                             + r'\hspace{-0pt}$>$}')
                        slides_output.append(r'\end{nmntag}')
                    else:
                        slides_output.append(r'\begin{nmnblank}')
                        slides_output.append(r'\end{nmnblank}')

                # new line
                line_lyrics = ''
                line_output = []
                line_output.append(r'\begin{tikzpicture}')
                line_output.append(r"""\tikzstyle{every node}=[inner sep=0pt]
\tikzstyle{dot}=[circle,fill=white,inner sep=0pt,text width=1.5pt]
\tikzstyle{lyrics}=[node distance=15pt]
\tikzstyle{tie}=[line width=0.5pt,bend left=45,min distance=4pt,
                 max distance=5pt]
\tikzstyle{slur}=[line width=0.5pt,bend left=45,min distance=4pt,
                  max distance=8pt]
\tikzstyle{underline}=[line width=0.5pt]
\tikzstyle{tie0}=[line width=0.5pt,out=50,in=180,max distance=20pt]
\tikzstyle{tie1}=[line width=0.5pt,out=130,in=0,max distance=20pt]""")
                line_output.append('\n\n% nodes')
                line_output.append(r'\node at (0pt, 12pt) {};'
                                   ' % for space adjustment')

                pos = 0
                first_text_idx = None
                for k, (time, start_beat, idx_list) in enumerate(bars):
                    # new bar
                    if k > 0:
                        pos -= 2.5
                        line_output.append(r'\node at ({}pt,0) {{|}};'
                                           .format(pos))
                        pos += 7.5
                    for idx in idx_list:
                        node = nodes[idx]
                        note = node.value
                        line_output.append('')
                        if node.type != NodeType.NOTE:
                            pos -= 2.5
                            if node.type == NodeType.DASH:
                                line_output.append(
                                        r'\node at ({}pt,-1pt) {{-}};'
                                        .format(pos))
                            elif node.type == NodeType.DOT:
                                line_output.append(
                                        r'\node[dot] at ({}pt,0) {{}};'
                                        .format(pos))
                            pos += 7.5
                            continue
                        # name
                        line_output.append(r'\node (a{}) at ({}pt,0) {{{}}};'
                                           .format(idx, pos, note.name))
                        # acc
                        acc_dict = {-1: 'flat', 0: 'natural', 1: 'sharp'}
                        if note.acc is not None:
                            line_output.append(
                                    r'\node at ($(a{}.north west)+(-1pt,0)$)'
                                    r'{{\tiny$\{}$}};'
                                    .format(idx, acc_dict[note.acc]))
                        # octave
                        if note.octave > 0:
                            line_output.append(
                                    r'\node'
                                    r'[dot,above of=a{},node distance=6pt]'
                                    r' {{}};'.format(idx))
                        elif note.octave < 0:
                            node_distance = 7
                            if node.lines <= -3:
                                node_distance = 10
                            elif node.lines == -2:
                                node_distance = 9
                            elif node.lines == -1:
                                node_distance = 8
                            line_output.append(r'\node[dot,below of=a{},'
                                               r'node distance={}pt] {{}};'
                                               .format(idx, node_distance))
                        # text
                        height = -17
                        if node.text:
                            if node.text in '每悔毒':
                                height += 1
                            elif node.text in '海':
                                height += 1.5
                            text = '{0}{1}{0}'.format(r'\phantom{|}',
                                                      node.text)
                            if first_text_idx is None:
                                first_text_idx = idx
                            line_output.append(r'\node[lyrics] (t{0}) at '
                                               r'($(a{0})+(0,{2}pt)$) {{{1}}};'
                                               .format(idx, text, height))
                            line_lyrics += node.text
                        elif first_text_idx is None:
                            text = r'\phantom{{{}}}'.format('天')
                            line_output.append(r'\node[lyrics] (t{0}) at '
                                               r'($(a{0})+(0,{2}pt)$) {{{1}}};'
                                               .format(idx, text, height))
                            first_text_idx = idx
                        pos += 10

                # ties
                line_output.append('\n\n% ties')
                for idx0, idx1 in ties:
                    dis = 2
                    if nodes[idx0].value.octave >= 1:
                        dis = 5
                    line_output.append(r'\draw[tie] ([xshift=+.2pt]a{}.north) '
                                       r'++(0,{}pt) coordinate (tmp) to '
                                       r'([xshift=-.2pt]a{}.north |- tmp);'
                                       .format(idx0, dis, idx1))

                # slurs
                line_output.append('\n\n% slurs')
                for idx0, idx1 in slurs:
                    dis = 3
                    if nodes[idx0].value.octave >= 1:
                        dis = 6
                    line_output.append(r'\draw[slur] (a{}.north) ++(0,{}pt) '
                                       r'coordinate (tmp) to '
                                       r'(a{}.north |- tmp);'
                                       .format(idx0, dis, idx1))

                # underlines
                line_output.append('\n\n% underlines')
                for depth, underlines in enumerate(underlines_list):
                    if depth == 0:
                        continue
                    for idx0, idx1 in underlines:
                        line_output.append(
                                r'\draw[underline] '
                                r'(a{}.south west) ++(0,-{}pt)'
                                .format(idx0, depth * 1.5)
                                + (r' coordinate (tmp) to '
                                   r'(a{}.south east |- tmp);'.format(idx1)))

                # triplets
                line_output.append('\n\n% triplets')
                for triplet in triplets:
                    dis0, dis1 = 2, 9
                    if (nodes[triplet[0]].value.octave >= 1
                            or nodes[triplet[2]].value.octave >= 1):
                        dis0 = 5
                    if nodes[triplet[1]].value.octave >= 1:
                        dis1 = 12
                    line_output.append(
                            r'\node[above of=a{},node distance={}pt] (tri) '
                            r'{{\tiny{{3}}}};'
                            .format(triplet[1], dis1))
                    line_output.append(
                            r'\draw[tie0] (a{}.north) +(0,{}pt) to '
                            r'($(tri.west)+(-1pt,0)$);'
                            .format(triplet[0], dis0))
                    line_output.append(
                            r'\draw[tie1] (a{}.north) +(0,{}pt) to '
                            r'($(tri.east)+(+1pt,0)$);'
                            .format(triplet[2], dis0))

                line_output.append('')
                line_output.append(r'\end{tikzpicture}')
                line_output.append('')
                assert line_output[0] == r'\begin{tikzpicture}' and pos > 0
                line_output[0] = (line_output[0]
                                  + '[xscale={}]'.format(95 / pos))

                line_file = line_file_format.format(i, j)
                with open(line_file, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(line_output))
                line_count += 1

                slides_output.append('\n% {}'.format(line_lyrics))
                slides_output.append(r'\begin{nmnline}')
                slides_output.append(r'\input{{{}}}'
                                     .format(line_file.split('/')[-1]))
                slides_output.append(r'\end{nmnline}')

        with open(slides_file, 'w', encoding='utf8') as f:
            f.write('\n'.join(slides_output))

    @classmethod
    def print(cls, sections):
        for tag, lines in sections:
            print('{:=^80}'.format(' ' + tag + ' '))
            for nodes, bars, ties, slurs, underlines_list, triplets in lines:
                print('-' * 50)
                for time, start_beat, a in bars:
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
                print('<ties> {}'.format(ties))
                print('<slurs> {}'.format(slurs))
                print('<underlines>')
                for k, underlines in enumerate(underlines_list):
                    if k >= 1:
                        print('    depth {}: {}'.format(k, underlines))
                print('<triplets> {}'.format(triplets))


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
        key = s[-1].upper()
        key_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5]))
        if key not in key_dict:
            raise ValueError('wrong format for <key> {}'.format(s))
        key = key_dict[key]
        tmp = 0
        if len(s) == 2:
            if s[0] == '#':
                tmp = 1
            elif s[0] == '$':
                tmp = -1
            else:
                raise ValueError('wrong format for <key> {}'.format(s))
        return key, tmp, key2sym[(key, tmp)][2]


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
            elif line.startswith('<key>'):
                if song.key:
                    raise ValueError('only one <key> is allowed')
                song.key = parse_key(line[5:].strip())
            elif line.startswith('<time>'):
                if time:
                    song.append_time_signature(time, s)
                time = parse_time(line[6:].strip())
                s = ''
            else:
                s += line.replace(' ', '')
        song.append_time_signature(time, s)
    song.make_ties_consistent()
    song.try_split_notes()

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
