import os
from math import pi as PI, sin, cos, asin
from pathlib import Path

import numpy as np
from PIL import Image, ImageFont, ImageDraw
import cv2


font_path = Path('latex/fonts').resolve()
text_font_file = font_path / 'kaiu.ttf'
en_font_file = font_path / 'times.ttf'
enbd_font_file = font_path / 'timesbd.ttf'
enbi_font_file = font_path / 'timesbi.ttf'
eni_font_file = font_path / 'timesi.ttf'


def test_pillow():
    image = Image.new('RGB', [1500, 1125], color=(0, 100, 100))
    draw = ImageDraw.Draw(image)

    # fonts
    font_size = 120
    tag_font = ImageFont.truetype(str(text_font_file), 80)
    text_font = ImageFont.truetype(str(text_font_file), font_size)
    en_font = ImageFont.truetype(str(en_font_file), font_size)
    enbd_font = ImageFont.truetype(str(enbd_font_file), font_size)
    enbi_font = ImageFont.truetype(str(enbi_font_file), font_size)
    eni_font = ImageFont.truetype(str(eni_font_file), font_size)

    # tag
    draw.text((80, 50), '<主歌>', font=tag_font)

    def draw_token(draw, x, y, text, font):
        """Draw token given the center coordinate."""
        token_size = draw.textsize(text, font=font)
        if text in '每悔':
            y_offset = token_size[1] * 0.05
        else:
            y_offset = 0
        draw.text((x - token_size[0] / 2, y - token_size[1] / 2 + y_offset), text, font=font)

    def draw_melody(draw, x, y, text):
        draw_token(draw, x, y, text, font=enbd_font)

    def draw_lyrics(draw, x, y, text):
        draw_token(draw, x, y, text, font=text_font)

    def draw_circle(draw, x, y, r):
        draw.ellipse(((x - r, y - r), (x + r, y + r)), fill=(255, 255, 255))

    def draw_arc(draw, bbox, start, end, fill, width=1, segments=100):
        """Draw arc with line width specified."""
        if len(bbox) == 2:
            bbox = (bbox[0][0], bbox[0][1], bbox[1][0], bbox[1][1])

        # radians
        start *= PI / 180
        end *= PI / 180

        # angle step
        da = (end - start) / segments

        # shift end points with half a segment angle
        start -= da / 2
        end -= da / 2

        # ellipse radii
        rx = (bbox[2] - bbox[0]) / 2
        ry = (bbox[3] - bbox[1]) / 2

        # box centre
        cx = bbox[0] + rx
        cy = bbox[1] + ry

        # segment length
        l = (rx + ry) * da / 2.0

        for i in range(segments):

            # angle centre
            a = start + (i + 0.5) * da

            # x,y centre
            x = cx + cos(a) * rx
            y = cy + sin(a) * ry

            # derivatives
            dx = -sin(a) * rx / (rx + ry)
            dy = cos(a) * ry / (rx + ry)

            draw.line([(x - dx * l, y - dy * l), (x + dx * l, y + dy * l)], fill=fill, width=width)

    def draw_tie(draw, x1, x2, y, h):
        """Draw tie or slur from ``(x1, y)`` to ``(x2, y)`` with height ``h``."""
        d = x2 - x1
        r = (h * h + d * d / 4) / (h * 2)
        assert r > 0
        angle = asin(d / r / 2) * (180 / PI)
        x_c = (x1 + x2) / 2
        y_c = y - h + r
        draw_arc(draw, ((x_c - r, y_c - r), (x_c + r, y_c + r)),
                 270 - angle, 270 + angle, fill=(255, 255, 255), width=4, segments=100)

    def draw_tie_opencv(image, x1, x2, y, h, color=(255, 100, 255)):
        # convert
        img = np.array(np.asarray(image)[:, :, ::-1])

        # draw tie
        d = x2 - x1
        r = (h * h + d * d / 4) / (h * 2)
        assert r > 0
        angle = asin(d / r / 2) * (180 / PI)
        x_c = (x1 + x2) / 2
        y_c = y - h + r
        270 - angle, 270 + angle
        cv2.ellipse(img, (int(x_c), int(y_c)), (int(r), int(r)), 0,
                    270 - angle, 270 + angle, color, thickness=4)

        # convert back
        image = Image.fromarray(img[:, :, ::-1], 'RGB')
        draw = ImageDraw.Draw(image)
        return image, draw


    # melody
    y_m = 295
    draw_melody(draw, 155, y_m, '5')
    draw_melody(draw, 155+150, y_m, '1')
    draw_melody(draw, 155+300, y_m, '1')
    draw_melody(draw, 155+450, y_m, '3')

    size_m = draw.textsize('5', font=enbd_font)     # (60, 108)
    draw.line(((155 - size_m[0] / 2, y_m + size_m[1] / 2 + 20),
               (155+150 + size_m[0] / 2, y_m + size_m[1] / 2 + 20)), width=8)
    draw_circle(draw, 155, y_m + size_m[1] / 2 + 60, 8)
    draw_tie(draw, 155, 155 + 150, y_m - size_m[1] / 2, 30)
    image, draw = draw_tie_opencv(image, 155 + 300, 155 + 450, y_m - size_m[1] / 2, 30)


    # lyrics
    draw_lyrics(draw, 155, 500, '每')
    draw_lyrics(draw, 155+150, 500, '個')
    draw_lyrics(draw, 155+300, 500, '狂')
    draw_lyrics(draw, 155+450, 500, '風')
    sharp_im = Image.open('figure/sharp.png').resize((40, 40))
    # image.paste(sharp_im, mask=None)  # TODO

    # save to file
    if os.name == 'nt':
        filename = Path.home() / 'DeskTop' / 'test_pillow.png'
    else:
        filename = Path.home() / 'htdocs' / 'test_pillow.png'
    image.save(str(filename))
    print('Save to {}'.format(filename))


def test_opencv():
    img = np.zeros((1125, 1500, 3), np.uint8)
    color = (0, 100, 100)
    img[:] = tuple(reversed(color))

    # text
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, 'String!', (0, 100), font, 5, (255, 255, 255), 10, cv2.LINE_AA)

    if os.name == 'nt':
        filename = Path.home() / 'DeskTop' / 'test_opencv.png'
    else:
        filename = Path.home() / 'htdocs' / 'test_opencv.png'
    cv2.imwrite(str(filename), img)
    print('Save to {}'.format(filename))

    image = Image.fromarray(img[:, :, ::-1], 'RGB')
    image.save(filename.parent / 'test.png')


if __name__ == '__main__':
    test_pillow()
    # test_opencv()

    # PIL.Image image to ndarray img
    # img = np.asarray(image)[:, :, ::-1]   # read-only

    # ndarray img to PIL.Image image
    # image = Image.fromarray(img[:, :, ::-1], 'RGB')
