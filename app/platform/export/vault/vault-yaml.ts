/**
 * X-04 — a small, deliberately conservative YAML frontmatter emitter.
 *
 * Frontmatter is the portable convention Obsidian, Jekyll, Pandoc and every
 * other Markdown tool already understand, so it is where an exported record's
 * metadata belongs. But YAML is a large, forgiving format with a famous supply
 * of foot-guns (`NO` is a boolean, `1.0` is a float, `12:30` is a sexagesimal
 * number, a leading `@` is reserved, a stray `:` splits a mapping). An export
 * that emits metadata "mostly correctly" is worse than one that emits it
 * verbosely and exactly.
 *
 * So this emitter has exactly one rule for strings: **always double-quote, and
 * always escape**. `title: "true"` is unambiguous; `title: true` is a boolean.
 * The cost is a few quote characters; the benefit is that no title, tag, id or
 * timezone the owner ever typed can change the meaning of the document.
 *
 * It emits a flat mapping of scalars and scalar arrays — the whole shape the
 * vault needs. There is no nested-object support, because nothing here needs it
 * and an unused branch is an untested branch.
 */

/** A value a frontmatter field may carry. */
export type YamlScalar = string | number | boolean | null;

/** One frontmatter field. Arrays become YAML flow sequences. */
export type YamlValue = YamlScalar | readonly YamlScalar[];

/**
 * Escape and quote a string as a YAML double-quoted scalar.
 *
 * Double-quoted style is the only YAML scalar style with full escape support, so
 * it is the only one that can carry an arbitrary title losslessly. Control
 * characters become `\x..` escapes rather than being stripped: the frontmatter
 * should report what is actually stored.
 */
export function yamlString(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    switch (character) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        if (code < 0x20 || code === 0x7f) {
          out += `\\x${code.toString(16).padStart(2, "0")}`;
        } else {
          out += character;
        }
    }
  }
  return `"${out}"`;
}

/** Render one scalar. */
function yamlScalar(value: YamlScalar): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    // A non-finite number is not representable in YAML 1.2 core schema in a way
    // every parser agrees on; `null` is honest and parseable everywhere.
    return Number.isFinite(value) ? String(value) : "null";
  }
  return yamlString(value);
}

/** Render a value, using a flow sequence for arrays. */
export function yamlValue(value: YamlValue): string {
  if (Array.isArray(value)) {
    return `[${(value as readonly YamlScalar[]).map(yamlScalar).join(", ")}]`;
  }
  return yamlScalar(value as YamlScalar);
}

/**
 * A frontmatter key. Restricted to the identifier shape DalyHub actually emits,
 * so a key never needs quoting and the block can never become ambiguous.
 */
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** One ordered frontmatter field. */
export interface YamlField {
  readonly key: string;
  readonly value: YamlValue;
}

/**
 * Build a complete `---`-delimited frontmatter block.
 *
 * Fields are emitted in the order given — frontmatter order is part of the
 * export's determinism — and a field whose value is `undefined` is skipped by
 * the caller rather than emitted as an empty key. An empty field list produces
 * an empty string rather than an empty block, so a file never opens with two
 * meaningless delimiters.
 */
export function frontmatter(fields: readonly YamlField[]): string {
  const usable = fields.filter((field) => KEY_PATTERN.test(field.key));
  if (usable.length === 0) return "";
  const lines = usable.map(
    (field) => `${field.key}: ${yamlValue(field.value)}`,
  );
  return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * Helper for building a field list, skipping absent values.
 *
 * `null` is KEPT (an explicit null is information: "this record has no due
 * date"), while `undefined` means "this field does not apply to this record
 * type" and is dropped.
 */
export function fields(
  entries: readonly (readonly [string, YamlValue | undefined])[],
): readonly YamlField[] {
  const out: YamlField[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    out.push({ key, value });
  }
  return out;
}
