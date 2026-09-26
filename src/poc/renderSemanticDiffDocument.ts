import { type TailwindElement } from "../parser/parseTsx";

export function renderSemanticDiffDocument(
  sourceText: string,
  elements: TailwindElement[],
  cssLinesByElement: string[][],
): string {
  const newline = detectNewline(sourceText);
  const sourceLines = sourceText.split(/\r\n|\r|\n/);
  const indentUnit = detectIndentUnit(sourceLines);
  const result: string[] = [];
  let sourceLine = 0;

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    while (sourceLine <= element.endLine && sourceLine < sourceLines.length) {
      result.push(sourceLines[sourceLine]);
      sourceLine += 1;
    }

    const openingLine = sourceLines[element.startLine] ?? "";
    const indent = leadingWhitespace(openingLine) + indentUnit;
    for (const line of cssLinesByElement[index] ?? []) {
      result.push(line.length === 0 ? line : `${indent}${line}`);
    }
  }

  while (sourceLine < sourceLines.length) {
    result.push(sourceLines[sourceLine]);
    sourceLine += 1;
  }

  return result.join(newline);
}

function detectNewline(text: string): string {
  if (text.includes("\r\n")) {
    return "\r\n";
  }
  if (text.includes("\r")) {
    return "\r";
  }
  return "\n";
}

function leadingWhitespace(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? "";
}

function detectIndentUnit(sourceLines: string[]): string {
  for (const line of sourceLines) {
    if (line.startsWith("\t")) {
      return "\t";
    }
    if (line.startsWith("  ")) {
      return "  ";
    }
  }

  return "  ";
}
