import os

from core import NodeType


class LatexWriter:
    """Latex writer."""

    def __init__(self, sections):
        """Initialize LatexWriter."""
        self._sections = sections

    def save(self, output_dir):
        """Save latex code to `output_dir`."""
        slides_file = os.path.join(output_dir, 'slides.tex')
        line_file_format = os.path.join(output_dir, 'line-{:02d}-{:d}.tex')
        slides_output = []
        page_count = 0

        for i, (tag, lines) in enumerate(self._sections):
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
