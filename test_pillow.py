from math import pi as PI, sin, cos, asin
from pathlib import Path

from PIL import Image, ImageFont, ImageDraw


font_path = Path('latex/fonts').resolve()
text_font_file = font_path / 'kaiu.ttf'
en_font_file = font_path / 'times.ttf'
enbd_font_file = font_path / 'timesbd.ttf'
enbi_font_file = font_path / 'timesbi.ttf'
eni_font_file = font_path / 'timesi.ttf'


if __name__ == '__main__':
    image = Image.new('RGB', [1500, 1125], color=(0, 0, 100))
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
        """Hack that looks similar to PIL's draw.arc(), but can specify a line width."""
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

        # ellips radii
        rx = (bbox[2] - bbox[0]) / 2
        ry = (bbox[3] - bbox[1]) / 2

        # box centre
        cx = bbox[0] + rx
        cy = bbox[1] + ry

        # segment length
        l = (rx + ry) * da / 2.0

        for i in range(segments):

            # angle centre
            a = start + (i+0.5) * da

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
        # https://stackoverflow.com/questions/7070912/creating-an-arc-with-a-given-thickness-using-pils-imagedraw
        draw_arc(draw, ((x_c - r, y_c - r), (x_c + r, y_c + r)),
                 270 - angle, 270 + angle, fill=(255, 255, 255), width=4, segments=1000)

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

    # lyrics
    draw_lyrics(draw, 155, 500, '每')
    draw_lyrics(draw, 155+150, 500, '個')
    draw_lyrics(draw, 155+300, 500, '狂')
    draw_lyrics(draw, 155+450, 500, '風')
    sharp_im = Image.open('figure/sharp.png').resize((40, 40))
    # image.paste(sharp_im, mask=None)  # TODO

    # save to file
    filename = Path.home() / 'htdocs' / 'test.png'
    image.save(str(filename))
    print('Save to {}'.format(filename))
