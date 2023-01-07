import inspect

import pytest

from nmn import Time, Note, parse_pitch, parse_time


@pytest.mark.parametrize('key,s,expected_acc,expected_name,expected_octave', [
    ('solfa', '2', None, 2, 0),
    ('solfa', '0', None, Note.REST, 0),
    ('solfa', 'o', None, Note.REST_AT_END, 0),
    ('solfa', 'O', None, Note.REST_TO_MATCH_LYRICS, 0),
    ('C', '0', None, Note.REST, 0),
    ('D', 'o', None, Note.REST_AT_END, 0),
    ('G', 'O', None, Note.REST_TO_MATCH_LYRICS, 0),
])
def test_parse_pitch(key, s, expected_acc, expected_name, expected_octave):
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
