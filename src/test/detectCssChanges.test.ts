import * as assert from "assert";
import { detectCssDeclarationChanges } from "../css/detectCssChanges";

suite("detectCssDeclarationChanges", () => {
  test("detects a value replacement", () => {
    assert.deepStrictEqual(
      detectCssDeclarationChanges(
        ["display: flex;", "gap: 16px;", "padding: 16px;"],
        ["display: flex;", "gap: 32px;", "padding: 16px;"],
      ),
      [{ property: "gap", oldValue: "16px", newValue: "32px" }],
    );
  });

  test("detects a declaration deletion", () => {
    assert.deepStrictEqual(
      detectCssDeclarationChanges(
        ["display: flex;", "gap: 16px;", "padding: 16px;"],
        ["display: flex;", "gap: 16px;"],
      ),
      [{ property: "padding", oldValue: "16px", newValue: null }],
    );
  });

  test("detects a declaration addition", () => {
    assert.deepStrictEqual(
      detectCssDeclarationChanges(
        ["display: flex;", "gap: 16px;"],
        ["display: flex;", "gap: 16px;", "margin-top: 20px;"],
      ),
      [{ property: "margin-top", oldValue: null, newValue: "20px" }],
    );
  });

  test("detects multiple declaration edits in one block", () => {
    assert.deepStrictEqual(
      detectCssDeclarationChanges(
        ["display: flex;", "gap: 16px;", "padding: 16px;"],
        ["display: flex;", "gap: 32px;", "margin-top: 20px;"],
      ),
      [
        { property: "gap", oldValue: "16px", newValue: "32px" },
        { property: "padding", oldValue: "16px", newValue: null },
        { property: "margin-top", oldValue: null, newValue: "20px" },
      ],
    );
  });

  test("associates an @media declaration edit with the parent block CSS", () => {
    assert.deepStrictEqual(
      detectCssDeclarationChanges(
        [
          "padding-inline: 16px;",
          "@media (width >= 640px) {",
          "  padding-inline: 24px;",
          "}",
        ],
        [
          "padding-inline: 16px;",
          "@media (width >= 640px) {",
          "  padding-inline: 32px;",
          "}",
        ],
      ),
      [{ property: "padding-inline", oldValue: "24px", newValue: "32px" }],
    );
  });
});
