import os
import itertools

from core import NodeType, Slur, Triplet


class Curve:
    """A curve such as tie, slur or triplet."""

    def __init__(self, node_range):
        """Initialize Curve."""
        self.range = node_range
        self.hidden = False
        # For tie/slur/triplet
        self.dis_y = None
        self.dis_x = None
        # For triplet
        self.dis_y_middle = None

    def equals(self, other):
        """Check if the node ranges are equal."""
        return (self.range.start == other.range.start
                and self.range.end == other.range.end)

    def contains(self, other):
        """Check if `self` contains `other`."""
        return (self.range.start <= other.range.start
                and other.range.end <= self.range.end)

    def contains_properly(self, other):
        """Check if `self` properly contains `other` (no common endpoints)."""
        return (self.range.start < other.range.start
                and other.range.end < self.range.end)

    def intersects(self, other):
        """Check if `self` intersects `other`.

        Node ranges are considered as open intervals.

        """
        return (self.range.start < other.range.end
                and other.range.start < self.range.end)

    def crosses(self, other):
        """Check if `self` crosses `other`."""
        return (self.intersects(other)
                and not self.contains(other)
                and not other.contains(self))


class LatexWriter:
    """Latex writer."""

    def __init__(self, sections):
        """Initialize LatexWriter."""
        self._sections = sections

    def _calc_distance(self, curves, nodes):
        """Calculate curve distances."""
        for c0, c1 in itertools.combinations(curves, 2):
            if not isinstance(c1.range, Triplet):
                continue
            verb = None
            if c0.contains(c1):
                verb = 'contains'
            elif c0.crosses(c1):
                verb = 'crosses'
            if verb:
                if isinstance(c0.range, Slur):
                    c0.hidden = True
                else:
                    raise ValueError(f'{c0.range} {verb} a triplet {c1.range}')

        def calc_dis_y(k):
            c = curves[k]
            if c.hidden:
                return None
            if c.dis_y is not None:
                return c.dis_y

            dis = 2
            dis_middle = 9
            if (nodes[c.range.start].value.octave >= 1
                    or nodes[c.range.end].value.octave >= 1):
                dis += 3
                dis_middle += 3

            for kk, cc in enumerate(curves):
                if kk == k or cc.hidden:
                    continue
                if c.equals(cc):
                    raise ValueError(
                            f'duplicate curves: {c.range} and {cc.range}')
                elif c.contains_properly(cc):
                    dis = max(dis, calc_dis_y(kk))
                elif c.contains(cc):
                    dis = max(dis, calc_dis_y(kk) + 1)

            c.dis_y = dis
            if isinstance(c.range, Triplet):
                c.dis_y_middle = dis_middle
            return dis

        def calc_dis_x(k):
            c = curves[k]
            if c.hidden:
                return None
            if c.dis_x is not None:
                return c.dis_x

            dis = 0.2
            for kk, cc in enumerate(curves):
                if kk == k or cc.hidden:
                    continue
                if cc.contains(c) and not cc.contains_properly(c):
                    dis = max(dis, calc_dis_x(kk) + 0.2)
            c.dis_x = dis
            return dis

        for i in range(len(curves)):
            calc_dis_y(i)
        for i in range(len(curves)):
            calc_dis_x(i)

    def _save_line(self, line, line_file):
        nodes = line.nodes

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
        line_output.append(r'\node at (0pt, 12pt) {}; % for space adjustment')

        pos = 0
        first_text_idx = None
        for k, (time, start_beat, idx_list) in enumerate(line.bars):
            # new bar
            if k > 0:
                pos -= 2.5
                line_output.append(r'\node at ({}pt,0) {{|}};'.format(pos))
                pos += 7.5
            for idx in idx_list:
                node = nodes[idx]
                note = node.value
                line_output.append('')
                if node.type != NodeType.NOTE:
                    pos -= 2.5
                    if node.type == NodeType.DASH:
                        line_output.append(r'\node at ({}pt,-1pt) {{-}};'
                                           .format(pos))
                    elif node.type == NodeType.DOT:
                        line_output.append(r'\node[dot] at ({}pt,0) {{}};'
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
                            r'\node[dot,above of=a{},node distance=6pt]'
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
                    text = '{0}{1}{0}'.format(r'\phantom{|}', node.text)
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

        # curves: ties, slurs, triplets
        ties = [Curve(tie) for tie in line.ties]
        slurs = [Curve(slur) for slur in line.slurs]
        triplets = [Curve(triplet) for triplet in line.triplets]
        curves = []
        curves += ties
        curves += slurs
        curves += triplets
        self._calc_distance(curves, nodes)

        # ties
        line_output.append('\n\n% ties')
        for c in ties:
            if c.hidden:
                continue
            r = c.range
            line_output.append(r'\draw[tie] ([xshift=+{3}pt]a{0}.north) '
                               r'++(0,{2}pt) coordinate (tmp) to '
                               r'([xshift=-{3}pt]a{1}.north |- tmp);'
                               .format(r.start, r.end, c.dis_y, c.dis_x))

        # slurs
        line_output.append('\n\n% slurs')
        for c in slurs:
            if c.hidden:
                continue
            r = c.range
            line_output.append(r'\draw[slur] ([xshift=+{3}pt]a{0}.north) '
                               r'++(0,{2}pt) coordinate (tmp) to '
                               r'([xshift=-{3}pt]a{1}.north |- tmp);'
                               .format(r.start, r.end, c.dis_y, c.dis_x))

        # underlines
        line_output.append('\n\n% underlines')
        for depth, underlines in enumerate(line.underlines_list):
            if depth == 0:
                continue
            for idx0, idx1 in underlines:
                line_output.append(
                        (r'\draw[underline] (a{}.south west) ++(0,-{}pt)'
                         .format(idx0, depth * 1.5))
                        + (r' coordinate (tmp) to '
                           r'(a{}.south east |- tmp);'.format(idx1)))

        # triplets
        line_output.append('\n\n% triplets')
        for c in triplets:
            if c.hidden:
                continue
            triplet = c.range
            line_output.append(
                    r'\node[above of=a{0},node distance={1}pt] (tri) '
                    r'{{\tiny{{3}}}};'
                    .format(triplet[1], c.dis_y_middle))
            line_output.append(
                    r'\draw[tie0] ([xshift=+{2}pt]a{0}.north) +(0,{1}pt) to '
                    r'($(tri.west)+(-1pt,0)$);'
                    .format(triplet[0], c.dis_y, c.dis_x))
            line_output.append(
                    r'\draw[tie1] ([xshift=-{2}pt]a{0}.north) +(0,{1}pt) to '
                    r'($(tri.east)+(+1pt,0)$);'
                    .format(triplet[2], c.dis_y, c.dis_x))

        line_output.append('')
        line_output.append(r'\end{tikzpicture}')
        line_output.append('')
        assert line_output[0] == r'\begin{tikzpicture}' and pos > 0
        line_output[0] = (line_output[0]
                          + '[xscale={}]'.format(95 / pos))

        with open(line_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(line_output))

        return line_lyrics

    def save(self, output_dir):
        """Save latex code to `output_dir`."""
        slides_file = os.path.join(output_dir, 'slides.tex')
        line_file_format = os.path.join(output_dir, 'line-{:02d}-{:d}.tex')
        slides_output = []
        page_count = 0

        for i, (tag, lines) in enumerate(self._sections):
            # new section
            for j, line in enumerate(lines):
                # new page
                if j % 2 == 0:
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

                line_file = line_file_format.format(i, j)
                line_lyrics = self._save_line(line, line_file)

                slides_output.append('\n% {}'.format(line_lyrics))
                slides_output.append(r'\begin{nmnline}')
                slides_output.append(r'\input{{{}}}'
                                     .format(line_file.split('/')[-1]))
                slides_output.append(r'\end{nmnline}')

        with open(slides_file, 'w', encoding='utf8') as f:
            f.write('\n'.join(slides_output))
