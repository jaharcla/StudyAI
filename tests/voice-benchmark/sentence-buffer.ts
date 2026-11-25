const ABBREVIATIONS = new Set(["fig", "dr", "mr", "mrs", "ms", "prof", "vs", "etc", "e.g", "i.e", "approx"]);

/**
 * Turns a stream of LLM tokens into sentence/clause chunks so TTS can start
 * before the full answer exists. Commas only cut a clause once it is long
 * enough to be worth speaking on its own.
 */
export class SentenceBuffer {
  private pending = "";
  private readonly minClauseChars: number;

  constructor(options: { minClauseChars?: number } = {}) {
    this.minClauseChars = options.minClauseChars ?? 24;
  }

  push(token: string): string[] {
    if (!/[A-Za-z0-9]/.test(token)) return [];
    this.pending += token;
    const out: string[] = [];
    let cursor = 0;
    for (let index = 0; index < this.pending.length; index += 1) {
      const character = this.pending[index]!;
      if (!".!?;\n,".includes(character)) continue;
      if (character === "." && this.isAbbreviation(index)) continue;
      if (character === "," && this.pending.slice(cursor, index + 1).trim().length < this.minClauseChars) continue;
      const piece = this.pending.slice(cursor, index + 1).trim();
      if (piece) out.push(piece);
      cursor = index + 1;
    }
    this.pending = this.pending.slice(cursor);
    return out;
  }

  flush(): string[] {
    const rest = this.pending.trim();
    this.pending = "";
    return rest ? [rest] : [];
  }

  private isAbbreviation(dotIndex: number): boolean {
    let start = dotIndex;
    while (start > 0 && !/\s/.test(this.pending[start - 1]!)) start -= 1;
    const word = this.pending.slice(start, dotIndex).toLowerCase();
    return ABBREVIATIONS.has(word);
  }
}
