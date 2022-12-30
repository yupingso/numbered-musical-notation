import inspect

import pytest

from nmn import Time, parse_pitch, parse_time


def test_parse_pitch():
    assert parse_pitch('solfa', '2') == (None, 2, 0)


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
