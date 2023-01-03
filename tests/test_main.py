import subprocess

from update_data import MAIN_PATH, get_songs


def test_songs(tmp_path):
    for song_path, exp_path in get_songs():
        output = subprocess.check_output(f'{MAIN_PATH} {song_path}',
                                         shell=True, encoding='utf-8')
        output_path = tmp_path / song_path.name
        with output_path.open('w') as f:
            f.write(output)
        subprocess.check_call(f'diff {output_path} {exp_path}', shell=True)
