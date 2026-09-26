import { type TailwindElement } from "../parser/parseTsx";

export function renderAlignedView(
  sourceText: string,
  elements: TailwindElement[],
): string {
  if (elements.length === 0) {
    return "/* No supported static className attributes were found. */\n";
  }

  const lines: string[] = [];
  let extraHeight = 0;

  for (const element of elements) {
    const generatedLines = renderElementBlock(element);
    const sourceHeight = Math.max(1, element.endLine - element.startLine + 1);
    const generatedHeight = generatedLines.length;
    const visualHeight = Math.max(sourceHeight, generatedHeight);
    const desiredStart = element.startLine + extraHeight;
    const actualStart = Math.max(desiredStart, lines.length);

    padTo(lines, actualStart);
    lines.push(...generatedLines);
    padTo(lines, actualStart + visualHeight);

    extraHeight += Math.max(0, generatedHeight - sourceHeight);
  }

  padTo(lines, countLines(sourceText) + extraHeight);
  return lines.join("\n");
}

function renderElementBlock(element: TailwindElement): string[] {
  const header = `/* <${element.tagName}> */`;
  if (element.classNames.length === 0) {
    return [header];
  }

  return [header, ...element.classNames];
}

function padTo(lines: string[], length: number): void {
  while (lines.length < length) {
    lines.push("");
  }
}

function countLines(text: string): number {
  return text.split(/\r\n|\r|\n/).length;
}
