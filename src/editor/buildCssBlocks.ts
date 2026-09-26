import { type SemanticDiffBlockLayout } from "../poc/renderSemanticDiffDocument";
import { type TailwindElement } from "../parser/parseTsx";
import { type ResolvedUtilityCss } from "../tailwind/resolveTailwindClasses";
import { type TailwindCssBlock } from "./trackCssBlocks";

export function buildCssBlocks(
  layouts: SemanticDiffBlockLayout[],
  elements: TailwindElement[],
  utilitiesByElement: ResolvedUtilityCss[][],
  sourceUri: string,
): TailwindCssBlock[] {
  return layouts.map((layout, index) => {
    const element = elements[index];
    return {
      id: `block-${index}`,
      tagName: layout.tagName,
      source: {
        documentUri: sourceUri,
        startLine: element.startLine,
        endLine: element.endLine,
        classNameStart: element.classNameStart,
        classNameEnd: element.classNameEnd,
        originalClassNames: [...layout.originalClassNames],
      },
      generated: {
        anchorStartLine: layout.anchorStartLine,
        anchorEndLine: layout.anchorEndLine,
        cssStartLine: layout.cssStartLine,
        cssEndLine: layout.cssEndLine,
      },
      utilities: utilitiesByElement[index] ?? [],
      anchorLines: [...layout.anchorLines],
    };
  });
}

export function sliceLines(
  text: string,
  startLine: number,
  endLine: number,
): string[] {
  if (endLine < startLine) {
    return [];
  }
  return text.split(/\r\n|\r|\n/).slice(startLine, endLine + 1);
}
