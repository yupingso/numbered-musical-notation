/**
 * Structured parser diagnostics.
 *
 * The parser reports each problem as a code with typed parameters, instead of a
 * ready-made message, so that callers can tell problems apart and present them
 * in their own way. formatDiagnostic() gives the English message for each code.
 */

export enum DiagnosticCode {
  // <key> and <time>
  KeyEmpty = 'key-empty',
  KeyFormat = 'key-format',
  KeyRepeated = 'key-repeated',
  TimeFormat = 'time-format',
  TimeHyphenValue = 'time-hyphen-value',
  TimeUnrecognized = 'time-unrecognized',
  TimeHyphenTooSmall = 'time-hyphen-too-small',
  TimeMissingBeforeNotes = 'time-missing-before-notes',
  TimeMissing = 'time-missing',

  // Melody
  PitchFormat = 'pitch-format',
  PitchNotInSolfa = 'pitch-not-in-solfa',
  PitchNotInKey = 'pitch-not-in-key',
  DashesWithUnderlines = 'dashes-with-underlines',
  HyphenTimeNeedsBrackets = 'hyphen-time-needs-brackets',
  BarFormat = 'bar-format',
  NoteBeyondBar = 'note-beyond-bar',
  EmptyBar = 'empty-bar',
  TieDifferentPitch = 'tie-different-pitch',
  IncompleteTriplet = 'incomplete-triplet',

  // Lyrics
  LyricLineStartsWithTilde = 'lyric-line-starts-with-tilde',

  // Matching melody with lyrics
  SlurStartNotFound = 'slur-start-not-found',
  MoreNotesThanWords = 'more-notes-than-words',
  MoreWordsThanNotes = 'more-words-than-notes',
  TripletSplitByLine = 'triplet-split-by-line',
}

/** Parameters of each diagnostic code. */
export interface DiagnosticParams {
  [DiagnosticCode.KeyEmpty]: Record<string, never>;
  [DiagnosticCode.KeyFormat]: { key: string };
  [DiagnosticCode.KeyRepeated]: Record<string, never>;
  [DiagnosticCode.TimeFormat]: { time: string };
  [DiagnosticCode.TimeHyphenValue]: Record<string, never>;
  [DiagnosticCode.TimeUnrecognized]: { upper: number; lower: number };
  [DiagnosticCode.TimeHyphenTooSmall]: { upper: number; lower: number };
  [DiagnosticCode.TimeMissingBeforeNotes]: Record<string, never>;
  [DiagnosticCode.TimeMissing]: Record<string, never>;

  [DiagnosticCode.PitchFormat]: { pitch: string };
  [DiagnosticCode.PitchNotInSolfa]: { pitch: string };
  [DiagnosticCode.PitchNotInKey]: { name: string; key: string };
  [DiagnosticCode.DashesWithUnderlines]: { bar: string };
  [DiagnosticCode.HyphenTimeNeedsBrackets]: Record<string, never>;
  [DiagnosticCode.BarFormat]: { bar: string };
  [DiagnosticCode.NoteBeyondBar]: { note: string; upper: number; lower: number };
  [DiagnosticCode.EmptyBar]: Record<string, never>;
  [DiagnosticCode.TieDifferentPitch]: Record<string, never>;
  [DiagnosticCode.IncompleteTriplet]: Record<string, never>;

  [DiagnosticCode.LyricLineStartsWithTilde]: { line: string };

  [DiagnosticCode.SlurStartNotFound]: Record<string, never>;
  [DiagnosticCode.MoreNotesThanWords]: { notes: number; words: number };
  [DiagnosticCode.MoreWordsThanNotes]: { notes: number; words: number };
  [DiagnosticCode.TripletSplitByLine]: Record<string, never>;
}

export type Diagnostic = {
  [C in DiagnosticCode]: { code: C; params: DiagnosticParams[C] };
}[DiagnosticCode];

/** Codes whose diagnostics take no parameters. */
type CodeWithoutParams = {
  [C in DiagnosticCode]: DiagnosticParams[C] extends Record<string, never> ? C : never;
}[DiagnosticCode];

/** Builds a diagnostic, checking the parameters against the code. */
export function makeDiagnostic<C extends CodeWithoutParams>(code: C): Diagnostic;
export function makeDiagnostic<C extends DiagnosticCode>(code: C, params: DiagnosticParams[C]): Diagnostic;
export function makeDiagnostic(code: DiagnosticCode, params: object = {}): Diagnostic {
  return { code, params } as Diagnostic;
}

const MESSAGES: { [C in DiagnosticCode]: (p: DiagnosticParams[C]) => string } = {
  [DiagnosticCode.KeyEmpty]: () => 'Empty key',
  [DiagnosticCode.KeyFormat]: (p) => `Wrong format for <key> ${p.key}`,
  [DiagnosticCode.KeyRepeated]: () => 'Only one <key> is allowed',
  [DiagnosticCode.TimeFormat]: (p) => `Wrong format for <time> ${p.time}`,
  [DiagnosticCode.TimeHyphenValue]: () => 'Only hyphen=[4,8,16] is allowed',
  [DiagnosticCode.TimeUnrecognized]: (p) => `Unrecognizable <time> ${p.upper}/${p.lower}`,
  [DiagnosticCode.TimeHyphenTooSmall]: (p) => `Hyphen must >= ${p.lower} for <time> ${p.upper}/${p.lower}`,
  [DiagnosticCode.TimeMissingBeforeNotes]: () => 'Missing <time> before notes (defaulting to 4/4)',
  [DiagnosticCode.TimeMissing]: () => 'Missing <time> (defaulting to 4/4)',

  [DiagnosticCode.PitchFormat]: (p) => `Wrong format for pitch ${p.pitch}`,
  [DiagnosticCode.PitchNotInSolfa]: (p) => `'${p.pitch}' is not allowed in <key> solfa`,
  [DiagnosticCode.PitchNotInKey]: (p) => `'${p.name}' is not allowed in key ${p.key}`,
  [DiagnosticCode.DashesWithUnderlines]: (p) => `Wrong format for bar notes ${p.bar}`,
  [DiagnosticCode.HyphenTimeNeedsBrackets]: () =>
    'Dots, underlines and triplets are not allowed without brackets in hyphenated time',
  [DiagnosticCode.BarFormat]: (p) => `Wrong format for bar '${p.bar}'`,
  [DiagnosticCode.NoteBeyondBar]: (p) => `Note ${p.note} goes beyond one bar in time ${p.upper}/${p.lower}`,
  [DiagnosticCode.EmptyBar]: () => 'Empty bar in melody',
  [DiagnosticCode.TieDifferentPitch]: () => 'Tie (~) in melody must connect notes of the same pitch',
  [DiagnosticCode.IncompleteTriplet]: () => 'triplet with less than 3 notes',

  [DiagnosticCode.LyricLineStartsWithTilde]: (p) => `A line of lyrics cannot start with '~' (${p.line})`,

  [DiagnosticCode.SlurStartNotFound]: () => 'Start note of slur not found',
  [DiagnosticCode.MoreNotesThanWords]: (p) => `${p.notes} notes != ${p.words} words`,
  [DiagnosticCode.MoreWordsThanNotes]: (p) => `${p.notes} notes != ${p.words} words`,
  [DiagnosticCode.TripletSplitByLine]: () => 'triplet with less than 3 notes',
};

/** English message of a diagnostic. */
export function formatDiagnostic(d: Diagnostic): string {
  return (MESSAGES[d.code] as (p: DiagnosticParams[typeof d.code]) => string)(d.params);
}

/** Collects the diagnostics found while parsing, in the order found. */
export class DiagnosticSink {
  readonly diagnostics: Diagnostic[] = [];

  report<C extends CodeWithoutParams>(code: C): void;
  report<C extends DiagnosticCode>(code: C, params: DiagnosticParams[C]): void;
  report(code: DiagnosticCode, params: object = {}): void {
    this.diagnostics.push({ code, params } as Diagnostic);
  }

  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }
}

/** Error thrown by the standalone parsing helpers (parseKey, parseTime, parsePitch). */
export class DiagnosticError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(formatDiagnostic(diagnostic));
    this.name = 'DiagnosticError';
  }
}
