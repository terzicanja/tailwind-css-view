import { type ResolvedUtilityCss } from "../tailwind/resolveTailwindClasses";

export interface TailwindCssBlock {
  id: string;
  tagName: string;
  source: {
    documentUri: string;
    startLine: number;
    endLine: number;
    classNameStart: number;
    classNameEnd: number;
    originalClassNames: string[];
  };
  generated: {
    anchorStartLine: number;
    anchorEndLine: number;
    cssStartLine: number;
    cssEndLine: number;
  };
  utilities: ResolvedUtilityCss[];
  anchorLines: string[];
}

export interface LineChange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
}

export function lineDelta(change: LineChange): number {
  const insertedLines =
    change.text.length === 0 ? 0 : change.text.split(/\r\n|\r|\n/).length - 1;
  return insertedLines - (change.endLine - change.startLine);
}

export function changeTouchesAnchor(
  change: LineChange,
  block: TailwindCssBlock,
): boolean {
  const { anchorStartLine, anchorEndLine } = block.generated;
  if (change.endLine < anchorStartLine || change.startLine > anchorEndLine) {
    return false;
  }

  const lastAnchorLine = block.anchorLines[block.anchorLines.length - 1] ?? "";
  const insertsAfterAnchor =
    change.startLine === anchorEndLine &&
    change.endLine === anchorEndLine &&
    change.startCharacter >= lastAnchorLine.length &&
    change.endCharacter >= lastAnchorLine.length;

  return !insertsAfterAnchor;
}

export function changeTouchesCss(
  change: LineChange,
  block: TailwindCssBlock,
): boolean {
  const { cssStartLine, cssEndLine, anchorEndLine } = block.generated;
  if (cssStartLine <= cssEndLine) {
    return change.endLine >= cssStartLine && change.startLine <= cssEndLine;
  }

  return (
    change.startLine === cssStartLine ||
    (change.startLine === anchorEndLine &&
      change.startCharacter >= (block.anchorLines.at(-1)?.length ?? 0))
  );
}

export function applyLineChangesToBlocks(
  blocks: TailwindCssBlock[],
  changes: readonly LineChange[],
): TailwindCssBlock[] {
  const ordered = [...changes].sort((left, right) => {
    if (left.startLine !== right.startLine) {
      return right.startLine - left.startLine;
    }
    return right.startCharacter - left.startCharacter;
  });

  return ordered.reduce(
    (current, change) => current.map((block) => applyLineChangeToBlock(block, change)),
    blocks,
  );
}

export function findBlocksTouchedByChange(
  blocks: readonly TailwindCssBlock[],
  change: LineChange,
): TailwindCssBlock[] {
  return blocks.filter((block) => changeTouchesCss(change, block));
}

function applyLineChangeToBlock(
  block: TailwindCssBlock,
  change: LineChange,
): TailwindCssBlock {
  return {
    ...block,
    generated: {
      anchorStartLine: shiftStart(
        block.generated.anchorStartLine,
        change,
      ),
      anchorEndLine: shiftEnd(block.generated.anchorEndLine, change),
      cssStartLine: shiftStart(block.generated.cssStartLine, change),
      cssEndLine: shiftEnd(block.generated.cssEndLine, change),
    },
  };
}

function shiftStart(line: number, change: LineChange): number {
  if (change.endLine < line) {
    return line + lineDelta(change);
  }
  return line;
}

function shiftEnd(line: number, change: LineChange): number {
  if (line < change.startLine) {
    return line;
  }
  return line + lineDelta(change);
}
