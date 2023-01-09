from fractions import Fraction
from enum import Enum


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


class NodeRange:
    """A range of consecutive nodes."""

    def __init__(self, start, end):
        """Initialize NodeRange.

        Args:
            start (int): Starting node index.
            end (int): Ending node index.

        """
        self.start = start
        self.end = end

    def __repr__(self):
        return f'({self.start}, {self.end})'


class Tie(NodeRange):
    """A tie."""

    def __init__(self, start, end):
        """Initialize Tie."""
        super().__init__(start, end)


class Slur(NodeRange):
    """A slur."""

    def __init__(self, start, end):
        """Initialize Slur."""
        super().__init__(start, end)
