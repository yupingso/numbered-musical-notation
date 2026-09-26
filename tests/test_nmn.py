import inspect

import pytest

from nmn import Song, Time, Note, parse_pitch, parse_time


@pytest.mark.parametrize('key,s,expected_acc,expected_name,expected_octave', [
    ('solfa', '2', None, 2, 0),
    ('solfa', 'q', None, 1, 1),
    ('solfa', '9', None, 2, 1),
    ('solfa', 'b', None, 5, -1),
    ('solfa', '0', None, Note.REST, 0),
    ('solfa', 'o', None, Note.REST_AT_END, 0),
    ('C', '0', None, Note.REST, 0),
    ('D', 'o', None, Note.REST_AT_END, 0),
    ('C#', '1', None, 1, 0),
    ('Db', 'F', None, 3, 0),
    ('E', '%c', -1, 6, -1),
    ('A', '#d', 1, 4, 0),
    ('A', 'b', None, 2, 1),
    ('A', '8', None, 3, 1),
])
def test_parse_pitch(key, s, expected_acc, expected_name, expected_octave):
    if key != 'solfa':
        pitch_dict = dict(zip('ABCDEFG', [6, 7, 1, 2, 3, 4, 5], strict=True))
        pitch = pitch_dict[key[0]]
        tmp = 0
        if len(key) > 1:
            tmp = 1 if key[1] == '#' else -1
        key = pitch, tmp
    acc, name, octave = parse_pitch(key, s)
    assert acc == expected_acc
    assert name == expected_name
    assert octave == expected_octave


@pytest.mark.parametrize('time,expected_time', [
    ('4/4', Time(4, 4, None)),
    ('6/8', Time(6, 8, None)),
    ('4/5', ValueError),
    ('?/4', Time(None, 4, None)),
    ('4/?', ValueError),
    ('4/4 hyphen=4', Time(4, 4, 4)),
    ('4/4 hyphen=8', Time(4, 4, 8)),
    ('6/8 hyphen=4', ValueError),
    ('4/4 hyphen=9', ValueError),
])
def test_parse_time(time, expected_time):
    if inspect.isclass(expected_time) and issubclass(expected_time, Exception):
        with pytest.raises(expected_time):
            parse_time(time)
    else:
        assert parse_time(time) == expected_time


@pytest.mark.parametrize('time_str,melody_str', [
    ('4/4', '1~234'),
    ('4/4', '1~|2345'),
    ('4/4', '1|~2345'),
    ('4/4', '1~034'),
    ('4/4', '0~134'),
    ('4/4', '0~034'),
    ('4/4 hyphen=16', '1---~0---2---3---'),
    ('4/4 hyphen=16', '0---~1---2---3---'),
    ('4/4 hyphen=16', '0---~0---2---3---'),
])
def test_disallow_different_pitch_tie(time_str, melody_str):
    song = Song()
    song.key = 'solfa'
    time = parse_time(time_str)
    song.append_time_signature(time, melody_str)
    msg = 'Tie .* in melody must connect notes of the same pitch'
    with pytest.raises(ValueError, match=msg):
        song.make_ties_consistent()


@pytest.mark.parametrize('melody_str', [
    '1~%123',
    '%1~123',
])
def test_allow_courtesy_natural_tie(melody_str):
    song = Song()
    song.key = 'solfa'
    time = parse_time('4/4')
    song.append_time_signature(time, melody_str)
    song.make_ties_consistent()
    assert song.melody[0][2][0].tie[1] is True
    assert song.melody[0][2][1].tie[0] is True


def test_make_ties_consistent_empty_bar():
    song = Song()
    song.key = 'solfa'
    time = parse_time('4/4')
    song.melody = [(time, 0, [])]
    with pytest.raises(ValueError, match='empty bar in self.melody'):
        song.make_ties_consistent()
