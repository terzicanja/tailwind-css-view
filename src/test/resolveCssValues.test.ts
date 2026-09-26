import * as assert from "assert";
import {
  resolveCssLines,
  resolveCssValue,
} from "../tailwind/resolveCssValues";

const theme: Record<string, string> = {
  "--spacing": "0.25rem",
  "--container-6xl": "72rem",
  "--color-zinc-900": "oklch(21% 0.006 285.885)",
  "--color-zinc-50": "oklch(98.5% 0 0)",
  "--text-3xl": "1.875rem",
  "--text-3xl--line-height": "calc(2.25 / 1.875)",
  "--font-weight-semibold": "600",
  "--tracking-tight": "-0.025em",
};

function lookup(variableName: string): string | undefined {
  return theme[variableName];
}

suite("resolveCssValues", () => {
  test("resolves calc(var(--spacing) * 4) to 16px", () => {
    assert.strictEqual(
      resolveCssValue("calc(var(--spacing) * 4)", lookup),
      "16px",
    );
  });

  test("resolves calc(var(--spacing) * 10) to 40px", () => {
    assert.strictEqual(
      resolveCssValue("calc(var(--spacing) * 10)", lookup),
      "40px",
    );
  });

  test("converts 1rem to 16px", () => {
    assert.strictEqual(resolveCssValue("1rem", lookup), "16px");
  });

  test("converts 2.5rem to 40px", () => {
    assert.strictEqual(resolveCssValue("2.5rem", lookup), "40px");
  });

  test("converts 72rem to 1152px", () => {
    assert.strictEqual(
      resolveCssValue("var(--container-6xl)", lookup),
      "1152px",
    );
  });

  test("converts 1.875rem to 30px", () => {
    assert.strictEqual(resolveCssValue("var(--text-3xl)", lookup), "30px");
  });

  test("converts a 40rem breakpoint to 640px", () => {
    assert.strictEqual(
      resolveCssValue("@media (width >= 40rem)", lookup),
      "@media (width >= 640px)",
    );
  });

  test("keeps var(--color-zinc-900) as a color token", () => {
    assert.strictEqual(
      resolveCssValue("var(--color-zinc-900)", lookup),
      "var(--color-zinc-900)",
    );
  });

  test("keeps var(--color-zinc-50) as a color token", () => {
    assert.strictEqual(
      resolveCssValue("var(--color-zinc-50)", lookup),
      "var(--color-zinc-50)",
    );
  });

  test("leaves em units unchanged", () => {
    assert.strictEqual(
      resolveCssValue("var(--tracking-tight)", lookup),
      "-0.025em",
    );
    assert.strictEqual(resolveCssValue("0.025em", lookup), "0.025em");
  });

  test("leaves an unresolved runtime CSS variable unchanged", () => {
    assert.strictEqual(
      resolveCssValue("var(--tw-leading)", lookup),
      "var(--tw-leading)",
    );
  });

  test("uses a static fallback when the preferred runtime variable is unknown", () => {
    assert.strictEqual(
      resolveCssValue("var(--tw-leading, var(--text-3xl--line-height))", lookup),
      "1.2",
    );
  });

  test("preserves responsive structure and converts rem inside it", () => {
    assert.deepStrictEqual(
      resolveCssLines(
        [
          "@media (width >= 40rem) {",
          "  padding-inline: calc(var(--spacing) * 6);",
          "}",
        ],
        lookup,
      ),
      [
        "@media (width >= 640px) {",
        "  padding-inline: 24px;",
        "}",
      ],
    );
  });

  test("does not mutate rawCss input lines", () => {
    const rawCss = [
      "padding-inline: calc(var(--spacing) * 4);",
      "background-color: var(--color-zinc-50);",
      "max-width: var(--container-6xl);",
    ];
    const snapshot = [...rawCss];

    const displayCss = resolveCssLines(rawCss, lookup);

    assert.deepStrictEqual(rawCss, snapshot);
    assert.deepStrictEqual(displayCss, [
      "padding-inline: 16px;",
      "background-color: var(--color-zinc-50);",
      "max-width: 1152px;",
    ]);
  });
});
