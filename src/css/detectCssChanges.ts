export interface CssDeclaration {
  property: string;
  value: string;
}

export interface CssDeclarationChange {
  property: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface CssBlockChange {
  blockId: string;
  tagName: string;
  originalClassNames: string[];
  changes: CssDeclarationChange[];
}

const DECLARATION =
  /^([a-zA-Z_][\w-]*)\s*:\s*(.*?)\s*;?\s*$/;

export function parseCssDeclarations(lines: string[]): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length === 0 ||
      trimmed === "{" ||
      trimmed === "}" ||
      trimmed.startsWith("@") ||
      trimmed.startsWith("&") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }

    const withoutBrace = trimmed.endsWith("{")
      ? trimmed.slice(0, -1).trim()
      : trimmed;
    const match = withoutBrace.match(DECLARATION);
    if (!match) {
      continue;
    }

    declarations.push({
      property: match[1],
      value: match[2].replace(/;$/, "").trim(),
    });
  }

  return declarations;
}

export function detectCssDeclarationChanges(
  beforeLines: string[],
  afterLines: string[],
): CssDeclarationChange[] {
  const before = groupValues(parseCssDeclarations(beforeLines));
  const after = groupValues(parseCssDeclarations(afterLines));
  const properties = new Set([...before.keys(), ...after.keys()]);
  const changes: CssDeclarationChange[] = [];

  for (const property of properties) {
    const oldValues = before.get(property) ?? [];
    const newValues = after.get(property) ?? [];
    const count = Math.max(oldValues.length, newValues.length);

    for (let index = 0; index < count; index += 1) {
      const oldValue = oldValues[index] ?? null;
      const newValue = newValues[index] ?? null;
      if (oldValue === newValue) {
        continue;
      }
      changes.push({ property, oldValue, newValue });
    }
  }

  return changes;
}

function groupValues(declarations: CssDeclaration[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const declaration of declarations) {
    const values = grouped.get(declaration.property) ?? [];
    values.push(declaration.value);
    grouped.set(declaration.property, values);
  }
  return grouped;
}
