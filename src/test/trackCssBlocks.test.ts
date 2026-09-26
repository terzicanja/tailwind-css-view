import * as assert from "assert";
import {
  type TailwindCssBlock,
  applyLineChangesToBlocks,
  changeTouchesAnchor,
  findBlocksTouchedByChange,
} from "../editor/trackCssBlocks";

function block(
  id: string,
  tagName: string,
  anchorStart: number,
  anchorEnd: number,
  cssStart: number,
  cssEnd: number,
  anchorLines = ["    <div className=\"flex gap-4 p-4\">"],
): TailwindCssBlock {
  return {
    id,
    tagName,
    source: {
      documentUri: "file:///src/page.tsx",
      startLine: 0,
      endLine: 0,
      classNameStart: 0,
      classNameEnd: 0,
      originalClassNames: ["flex", "gap-4", "p-4"],
    },
    generated: {
      anchorStartLine: anchorStart,
      anchorEndLine: anchorEnd,
      cssStartLine: cssStart,
      cssEndLine: cssEnd,
    },
    utilities: [],
    anchorLines,
  };
}

suite("trackCssBlocks", () => {
  test("keeps a later block mapped after lines are inserted in an earlier block", () => {
    const blocks = [
      block("div", "div", 2, 2, 3, 5),
      block("span", "span", 7, 7, 8, 10, [
        "      <span className=\"text-sm\">",
      ]),
    ];

    const next = applyLineChangesToBlocks(blocks, [
      {
        startLine: 5,
        startCharacter: 18,
        endLine: 5,
        endCharacter: 18,
        text: "\n      margin-top: 20px;",
      },
    ]);

    assert.deepStrictEqual(next[0].generated, {
      anchorStartLine: 2,
      anchorEndLine: 2,
      cssStartLine: 3,
      cssEndLine: 6,
    });
    assert.deepStrictEqual(next[1].generated, {
      anchorStartLine: 8,
      anchorEndLine: 8,
      cssStartLine: 9,
      cssEndLine: 11,
    });
    assert.strictEqual(next[1].tagName, "span");
  });

  test("maps an @media line edit to the parent CSS block", () => {
    const blocks = [
      block("div", "div", 2, 2, 3, 8),
      block("span", "span", 10, 10, 11, 12, [
        "      <span className=\"text-sm\">",
      ]),
    ];

    const touched = findBlocksTouchedByChange(blocks, {
      startLine: 6,
      startCharacter: 20,
      endLine: 6,
      endCharacter: 24,
      text: "32px",
    });

    assert.deepStrictEqual(
      touched.map((item) => item.id),
      ["div"],
    );
  });

  test("treats an edit on a JSX anchor line as an anchor touch", () => {
    const current = block("div", "div", 2, 2, 3, 5);
    assert.strictEqual(
      changeTouchesAnchor(
        {
          startLine: 2,
          startCharacter: 19,
          endLine: 2,
          endCharacter: 23,
          text: "oops",
        },
        current,
      ),
      true,
    );
  });

  test("does not treat an insert after the JSX anchor line as an anchor touch", () => {
    const current = block("div", "div", 2, 2, 3, 5);
    assert.strictEqual(
      changeTouchesAnchor(
        {
          startLine: 2,
          startCharacter: current.anchorLines[0].length,
          endLine: 2,
          endCharacter: current.anchorLines[0].length,
          text: "\n      margin-top: 20px;",
        },
        current,
      ),
      false,
    );
  });
});
