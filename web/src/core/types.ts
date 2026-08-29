/**
 * Core data types and AST representations for Numbered Musical Notation (简谱).
 */

export class Fraction {
  readonly num: number;
  readonly den: number;

  constructor(num: number, den: number = 1) {
    if (den === 0) {
      throw new Error('Denominator cannot be zero');
    }
    if (den < 0) {
      num = -num;
      den = -den;
    }
    const g = Fraction.gcd(Math.abs(num), den);
    this.num = num / g;
    this.den = den / g;
  }

  private static gcd(a: number, b: number): number {
    return b === 0 ? a : Fraction.gcd(b, a % b);
  }

  add(other: Fraction | number): Fraction {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(other: Fraction | number): Fraction {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  mul(other: Fraction | number): Fraction {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return new Fraction(this.num * o.num, this.den * o.den);
  }

  div(other: Fraction | number): Fraction {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return new Fraction(this.num * o.den, this.den * o.num);
  }

  equals(other: Fraction | number): boolean {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return this.num === o.num && this.den === o.den;
  }

  greaterThan(other: Fraction | number): boolean {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return this.num * o.den > o.num * this.den;
  }

  lessThan(other: Fraction | number): boolean {
    const o = typeof other === 'number' ? new Fraction(other) : other;
    return this.num * o.den < o.num * this.den;
  }

  toNumber(): number {
    return this.num / this.den;
  }

  toString(): string {
    return this.den === 1 ? `${this.num}` : `${this.num}/${this.den}`;
  }
}

export enum Accidental {
  Flat = -1,
  Natural = 0,
  Sharp = 1,
}

export interface TimeSignature {
  upper: number; // e.g. 4
  lower: number; // e.g. 4
  hyphen?: number;
}

export class Note {
  static readonly REST = 0;
  static readonly REST_AT_END = -1;
  static readonly REST_TO_MATCH_LYRICS = -2;

  acc: Accidental | null;
  _name: number; // 0-7, or negative for special rest types
  octave: number; // -2, -1, 0, 1, 2
  duration: Fraction;
  lines: number | null; // >0: dash count; <0: -underlines count
  dots: number | null;
  tie: [boolean, boolean]; // [tied with prev, tied with next]

  constructor(
    acc: Accidental | null,
    name: number,
    octave: number = 0,
    duration: Fraction = new Fraction(1),
    dashes: number | null = null,
    underlines: number = 0,
    dots: number = 0,
    tie: [boolean, boolean] = [false, false]
  ) {
    this.acc = acc;
    this._name = name;
    this.octave = octave;
    this.duration = duration;
    if (dashes === null) {
      this.lines = null;
      this.dots = null;
    } else {
      this.lines = dashes > 0 ? dashes : -underlines;
      this.dots = dots;
    }
    this.tie = [tie[0], tie[1]];
  }

  get name(): number {
    return this._name >= 0 ? this._name : 0;
  }

  get isRest(): boolean {
    return this._name <= 0;
  }

  get hasLyrics(): boolean {
    return this._name > 0 || this._name === Note.REST_TO_MATCH_LYRICS;
  }

  get isFirstInTie(): boolean {
    return !this.tie[0];
  }

  get isLastInTie(): boolean {
    return !this.tie[1];
  }

  get toMatchLyrics(): boolean {
    return this.isFirstInTie && this.hasLyrics;
  }

  get mayStartNewLine(): boolean {
    return this._name !== Note.REST_AT_END && !this.tie[0];
  }

  copy(): Note {
    const note = new Note(this.acc, this._name, this.octave, this.duration);
    note.lines = this.lines;
    note.dots = this.dots;
    note.tie = [this.tie[0], this.tie[1]];
    return note;
  }
}

export enum NodeType {
  NOTE = 0,
  DASH = 1,
  DOT = 2,
}

export class NodeElement {
  type: NodeType;
  value: Note | '-' | '.';
  lines: number | null;
  dots: number | null;
  text: string | null = null; // Associated lyric character

  constructor(note: Note | '-' | '.') {
    if (note instanceof Note) {
      this.type = NodeType.NOTE;
      this.value = note;
      this.lines = note.lines;
      this.dots = note.dots;

      if (this.lines === null || this.dots === null) {
        const dur = note.duration;
        if (dur.toNumber() <= 0) {
          throw new Error(`Duration <= 0 for note`);
        }
        const num = dur.num;
        const den = dur.den;
        // Check power of 2
        if ((den & (den - 1)) !== 0) {
          throw new Error(`Duration denominator ${den} is not a power of 2`);
        }
        const oneGroups = num.toString(2).split('0').filter(Boolean);
        if (oneGroups.length !== 1) {
          throw new Error(`Duration ${dur} cannot be represented as a single note`);
        }
        const n = Math.log2(den);
        const m = Math.floor(Math.log2(num));
        if (dur.toNumber() % 1 === 0) {
          this.lines = dur.toNumber() - 1;
          this.dots = 0;
        } else {
          if (m > n) {
            throw new Error(`Duration ${dur} is not integral, but too long for a note`);
          }
          this.lines = m - n;
          this.dots = oneGroups[0].length - 1;
        }
      }
    } else if (note === '-') {
      this.type = NodeType.DASH;
      this.value = note;
      this.lines = null;
      this.dots = null;
    } else if (note === '.') {
      this.type = NodeType.DOT;
      this.value = note;
      this.lines = null;
      this.dots = null;
    } else {
      throw new Error(`Unknown node type for ${note}`);
    }
  }
}

export interface NodeRange {
  start: number;
  end: number;
}

export interface TripletRange extends NodeRange {
  middle: number;
}

export interface BarInfo {
  time: TimeSignature;
  beat: Fraction;
  nodeIndex: number;
}

export class OutputLine {
  nodes: NodeElement[] = [];
  bars: BarInfo[] = [];
  ties: NodeRange[] = [];
  slurs: NodeRange[] = [];
  underlinesList: NodeRange[][] = []; // depth k -> ranges
  triplets: TripletRange[] = [];
}

export interface Section {
  tag: string; // e.g. "主歌", "副歌"
  lines: OutputLine[];
}

export interface SongAST {
  key: string;
  time: TimeSignature;
  sections: Section[];
}

export interface SheetSlide {
  slideIndex: number;
  sectionTag: string | null; // e.g. "主歌", null if continuation slide
  line1: OutputLine;
  line2: OutputLine | null;
}
