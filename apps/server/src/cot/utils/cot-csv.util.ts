/**
 * The CFTC releases have no header row and quote any market name containing a
 * comma ("CRUDE OIL, LIGHT SWEET-WTI", "... - COINBASE DERIVATIVES, LLC"), so a
 * plain split on commas silently shifts every field of those rows.
 */
export class CotCsvUtil {
  static parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line.charAt(index);

      if (quoted) {
        if (char !== '"') {
          current += char;
          continue;
        }

        if (line.charAt(index + 1) === '"') {
          current += '"';
          index += 1;
          continue;
        }

        quoted = false;
        continue;
      }

      if (char === '"') {
        quoted = true;
        continue;
      }

      if (char === ',') {
        fields.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    fields.push(current.trim());
    return fields;
  }

  static toNumber(raw: string | undefined): number {
    const value = this.toNullableNumber(raw);
    return value ?? 0;
  }

  static toNullableNumber(raw: string | undefined): number | null {
    if (raw === undefined) {
      return null;
    }

    const cleaned = raw.replace(/,/g, '').trim();

    if (cleaned.length === 0 || cleaned === '.') {
      return null;
    }

    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }
}
