export type ThemeValueLookup = (variableName: string) => string | undefined;

export interface ResolveCssDisplayOptions {
  rootFontSize?: number;
}

export const DEFAULT_ROOT_FONT_SIZE_PX = 16;

export function resolveCssLines(
  lines: string[],
  lookup: ThemeValueLookup,
  options: ResolveCssDisplayOptions = {},
): string[] {
  return lines.map((line) => {
    const indent = line.match(/^[ \t]*/)?.[0] ?? "";
    return `${indent}${resolveCssValue(line.slice(indent.length), lookup, options)}`;
  });
}

export function resolveCssValue(
  value: string,
  lookup: ThemeValueLookup,
  options: ResolveCssDisplayOptions = {},
): string {
  const rootFontSize = options.rootFontSize ?? DEFAULT_ROOT_FONT_SIZE_PX;
  return convertRemToPx(
    resolveSimpleCalcs(resolveCssVariables(value, lookup)),
    rootFontSize,
  );
}

function resolveCssVariables(
  input: string,
  lookup: ThemeValueLookup,
  seen: ReadonlySet<string> = new Set(),
): string {
  let result = "";
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("var(", index)) {
      const call = readCssFunction(input, index, "var");
      if (!call) {
        result += input[index];
        index += 1;
        continue;
      }

      const [namePart, fallback] = splitTopLevelComma(call.args);
      const name = namePart.trim();
      if (isColorThemeVariable(name)) {
        result += input.slice(index, call.end);
        index = call.end;
        continue;
      }

      if (isCustomPropertyName(name) && !seen.has(name)) {
        const themeValue = lookup(name);
        if (themeValue !== undefined) {
          const nextSeen = new Set(seen);
          nextSeen.add(name);
          result += resolveSimpleCalcs(
            resolveCssVariables(themeValue, lookup, nextSeen),
          );
          index = call.end;
          continue;
        }

        if (fallback !== undefined) {
          result += resolveSimpleCalcs(
            resolveCssVariables(fallback.trim(), lookup, seen),
          );
          index = call.end;
          continue;
        }
      }

      result += input.slice(index, call.end);
      index = call.end;
      continue;
    }

    result += input[index];
    index += 1;
  }

  return result;
}

function resolveSimpleCalcs(input: string): string {
  let result = "";
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("calc(", index)) {
      const call = readCssFunction(input, index, "calc");
      if (call) {
        const inner = resolveSimpleCalcs(call.args);
        result += tryEvaluateSimpleCalc(inner) ?? `calc(${inner})`;
        index = call.end;
        continue;
      }
    }

    result += input[index];
    index += 1;
  }

  return result;
}

function convertRemToPx(input: string, rootFontSize: number): string {
  let result = "";
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("var(", index) || input.startsWith("calc(", index)) {
      const name = input.startsWith("var(", index) ? "var" : "calc";
      const call = readCssFunction(input, index, name);
      if (call) {
        result += input.slice(index, call.end);
        index = call.end;
        continue;
      }
    }

    const rem = matchRemAt(input, index);
    if (rem) {
      result += `${formatNumber(rem.value * rootFontSize)}px`;
      index = rem.end;
      continue;
    }

    result += input[index];
    index += 1;
  }

  return result;
}

function matchRemAt(
  input: string,
  index: number,
): { value: number; end: number } | null {
  if (index > 0 && /[A-Za-z0-9_-]/.test(input[index - 1] ?? "")) {
    return null;
  }

  const match = input
    .slice(index)
    .match(/^([+-]?(?:\d*\.\d+|\d+))rem(?![A-Za-z0-9_-])/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return { value, end: index + match[0].length };
}

function tryEvaluateSimpleCalc(expression: string): string | null {
  const match = expression
    .trim()
    .match(
      /^([+-]?(?:\d*\.\d+|\d+))([a-z%]+)?\s*([*/+-])\s*([+-]?(?:\d*\.\d+|\d+))([a-z%]+)?$/i,
    );
  if (!match) {
    return null;
  }

  const left = Number(match[1]);
  const leftUnit = match[2] ?? "";
  const operator = match[3];
  const right = Number(match[4]);
  const rightUnit = match[5] ?? "";

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }

  if (operator === "+" || operator === "-") {
    if (leftUnit !== rightUnit) {
      return null;
    }
    const value = operator === "+" ? left + right : left - right;
    return `${formatNumber(value)}${leftUnit}`;
  }

  if (leftUnit && rightUnit) {
    if (operator === "/" && leftUnit === rightUnit) {
      return formatNumber(left / right);
    }
    return null;
  }

  if (operator === "*") {
    return `${formatNumber(left * right)}${leftUnit || rightUnit}`;
  }

  if (rightUnit || right === 0) {
    return null;
  }

  return `${formatNumber(left / right)}${leftUnit}`;
}

function readCssFunction(
  input: string,
  start: number,
  name: string,
): { args: string; end: number } | null {
  const open = start + name.length;
  if (input.slice(start, open + 1) !== `${name}(`) {
    return null;
  }

  let depth = 1;
  let index = open + 1;
  while (index < input.length && depth > 0) {
    if (input[index] === "(") {
      depth += 1;
    } else if (input[index] === ")") {
      depth -= 1;
    }
    index += 1;
  }

  if (depth !== 0) {
    return null;
  }

  return {
    args: input.slice(open + 1, index - 1),
    end: index,
  };
}

function splitTopLevelComma(args: string): [string, string?] {
  let depth = 0;
  for (let index = 0; index < args.length; index += 1) {
    const character = args[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      return [args.slice(0, index), args.slice(index + 1)];
    }
  }

  return [args];
}

function isCustomPropertyName(value: string): boolean {
  return /^--[A-Za-z0-9_-]+$/.test(value);
}

function isColorThemeVariable(value: string): boolean {
  return value.startsWith("--color-");
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}
