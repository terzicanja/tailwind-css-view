import { type TailwindElement } from "../parser/parseTsx";

export interface SemanticDiffBlockLayout {
  elementIndex: number;
  tagName: string;
  originalClassNames: string[];
  anchorStartLine: number;
  anchorEndLine: number;
  cssStartLine: number;
  cssEndLine: number;
  anchorLines: string[];
}

export interface SemanticDiffRenderResult {
  text: string;
  blocks: SemanticDiffBlockLayout[];
}

export function renderSemanticDiffDocument(
  sourceText: string,
  elements: TailwindElement[],
  cssLinesByElement: string[][],
): SemanticDiffRenderResult {
  const newline = detectNewline(sourceText);
  const sourceLines = sourceText.split(/\r\n|\r|\n/);
  const indentUnit = detectIndentUnit(sourceLines);
  const result: string[] = [];
  const blocks: SemanticDiffBlockLayout[] = [];
  let sourceLine = 0;

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const anchorStartLine = result.length;
    while (sourceLine <= element.endLine && sourceLine < sourceLines.length) {
      result.push(sourceLines[sourceLine]);
      sourceLine += 1;
    }
    const anchorEndLine = result.length - 1;
    const cssStartLine = result.length;

    const openingLine = sourceLines[element.startLine] ?? "";
    const indent = leadingWhitespace(openingLine) + indentUnit;
    for (const line of cssLinesByElement[index] ?? []) {
      result.push(line.length === 0 ? line : `${indent}${line}`);
    }

    blocks.push({
      elementIndex: index,
      tagName: element.tagName,
      originalClassNames: [...element.classNames],
      anchorStartLine,
      anchorEndLine,
      cssStartLine,
      cssEndLine: result.length - 1,
      anchorLines: result.slice(anchorStartLine, anchorEndLine + 1),
    });
  }

  while (sourceLine < sourceLines.length) {
    result.push(sourceLines[sourceLine]);
    sourceLine += 1;
  }

  return {
    text: result.join(newline),
    blocks,
  };
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
