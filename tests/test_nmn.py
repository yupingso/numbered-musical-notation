from nmn import parse_pitch


def test_parse_pitch():
    assert parse_pitch('solfa', '2') == (None, 2, 0)
    assert 0
