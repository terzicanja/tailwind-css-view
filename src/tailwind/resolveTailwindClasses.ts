import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  type ResolveCssDisplayOptions,
  resolveCssLines,
} from "./resolveCssValues";

export interface ResolvedUtilityCss {
  utility: string;
  raw: string | null;
  rawCss: string[];
  displayCss: string[];
}

export interface ResolvedTailwindCss {
  version: string;
  projectRoot: string;
  utilities: ResolvedUtilityCss[];
}

interface TailwindAstNode {
  kind: string;
  selector?: string;
  name?: string;
  params?: string;
  property?: string;
  value?: string | undefined;
  important?: boolean;
  nodes?: TailwindAstNode[];
}

interface TailwindV4DesignSystem {
  candidatesToCss(classes: string[]): (string | null)[];
  candidatesToAst(classes: string[]): TailwindAstNode[][];
  resolveThemeValue?(path: string, forceInline?: boolean): string | undefined;
  theme?: {
    get(themeKeys: string[]): string | null;
  };
}

interface TailwindV4NodeApi {
  __unstable__loadDesignSystem(
    css: string,
    options: { base: string },
  ): Promise<TailwindV4DesignSystem>;
}

const designSystemCache = new Map<string, Promise<TailwindV4DesignSystem>>();

export async function resolveTailwindClasses(
  classNames: string[],
  workspaceRoot: string,
  displayOptions: ResolveCssDisplayOptions = {},
): Promise<ResolvedTailwindCss> {
  const project = findTailwindProject(workspaceRoot);
  if (!project) {
    throw new Error(
      "Could not find an installed Tailwind package by walking up from the workspace.",
    );
  }

  const major = Number.parseInt(project.version, 10);
  if (major < 4) {
    throw new Error(
      `This resolver uses the Tailwind v4 design-system API. Found tailwindcss@${project.version}.`,
    );
  }

  const designSystem = await loadV4DesignSystem(project);
  const uniqueNames = [...new Set(classNames)];
  const compiledStyles = designSystem.candidatesToCss(uniqueNames);
  const ast = designSystem.candidatesToAst(uniqueNames);
  const byUtility = new Map<string, ResolvedUtilityCss>();

  for (let index = 0; index < uniqueNames.length; index += 1) {
    const utility = uniqueNames[index];
    const raw = compiledStyles[index] ?? null;
    const compiledCss = ast[index]
      ? displayLinesFromAst(ast[index])
      : raw
        ? displayLinesFromRawCss(raw)
        : [];
    const rawCss =
      compiledCss.length > 0
        ? compiledCss
        : raw
          ? displayLinesFromRawCss(raw)
          : [`/* unresolved: ${utility} */`];

    byUtility.set(utility, {
      utility,
      raw,
      rawCss,
      displayCss: resolveCssLines(
        rawCss,
        (variableName) => lookupThemeValue(designSystem, variableName),
        displayOptions,
      ),
    });
  }

  return {
    version: project.version,
    projectRoot: project.root,
    utilities: classNames.map((utility) => {
      return (
        byUtility.get(utility) ?? {
          utility,
          raw: null,
          rawCss: [`/* unresolved: ${utility} */`],
          displayCss: [`/* unresolved: ${utility} */`],
        }
      );
    }),
  };
}

function findTailwindProject(
  startDir: string,
): { root: string; version: string } | null {
  let dir = path.resolve(startDir);

  while (true) {
    const packagePath = path.join(
      dir,
      "node_modules",
      "tailwindcss",
      "package.json",
    );
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
        version?: string;
      };
      return { root: dir, version: pkg.version ?? "0.0.0" };
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

async function loadV4DesignSystem(project: {
  root: string;
  version: string;
}): Promise<TailwindV4DesignSystem> {
  const cssEntry = findCssEntry(project.root);
  const css = cssEntry
    ? fs.readFileSync(cssEntry, "utf8")
    : '@import "tailwindcss";\n';
  const base = cssEntry ? path.dirname(cssEntry) : project.root;
  const cacheKey = `${project.root}:${cssEntry ?? "default"}:${
    cssEntry ? fs.statSync(cssEntry).mtimeMs : 0
  }`;

  const cached = designSystemCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loaded = (async () => {
    const requireFromProject = createRequire(
      path.join(project.root, "package.json"),
    );
    try {
      const tailwindNode = requireFromProject(
        "@tailwindcss/node",
      ) as TailwindV4NodeApi;
      return await tailwindNode.__unstable__loadDesignSystem(css, { base });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load Tailwind v4 from ${project.root} via @tailwindcss/node. ${detail}`,
      );
    }
  })();

  designSystemCache.set(cacheKey, loaded);
  try {
    return await loaded;
  } catch (error) {
    designSystemCache.delete(cacheKey);
    throw error;
  }
}

function findCssEntry(projectRoot: string): string | undefined {
  const candidates = [
    "src/app/globals.css",
    "app/globals.css",
    "src/globals.css",
    "src/index.css",
    "src/styles/globals.css",
    "styles/globals.css",
    "app.css",
  ];

  for (const candidate of candidates) {
    const filePath = path.join(projectRoot, candidate);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (isTailwindStylesheet(content)) {
      return filePath;
    }
  }

  return undefined;
}

function lookupThemeValue(
  designSystem: TailwindV4DesignSystem,
  variableName: string,
): string | undefined {
  const key = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;

  try {
    const value = designSystem.resolveThemeValue?.(key);
    if (value) {
      return value;
    }
  } catch {
    // Some Tailwind lookups throw for non-theme paths.
  }

  return designSystem.theme?.get([key]) ?? undefined;
}

function isTailwindStylesheet(content: string): boolean {
  return /@import\s+['"]tailwindcss(?:\/[^'"]*)?['"]/.test(content);
}

function displayLinesFromAst(nodes: TailwindAstNode[]): string[] {
  return flattenAst(nodes, "");
}

function flattenAst(nodes: TailwindAstNode[], indent: string): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.kind === "declaration") {
      if (!node.property || node.value === undefined) {
        continue;
      }
      if (node.property.startsWith("--tw-")) {
        continue;
      }
      const important = node.important ? " !important" : "";
      lines.push(`${indent}${node.property}: ${node.value}${important};`);
      continue;
    }

    if (node.kind === "at-rule") {
      if (node.name === "@property") {
        continue;
      }
      const prelude = [node.name, node.params].filter(Boolean).join(" ");
      lines.push(`${indent}${prelude} {`);
      lines.push(...flattenAst(node.nodes ?? [], `${indent}  `));
      lines.push(`${indent}}`);
      continue;
    }

    if (node.kind === "rule") {
      if (isGeneratedUtilitySelector(node.selector)) {
        lines.push(...flattenAst(node.nodes ?? [], indent));
        continue;
      }

      lines.push(`${indent}${node.selector} {`);
      lines.push(...flattenAst(node.nodes ?? [], `${indent}  `));
      lines.push(`${indent}}`);
      continue;
    }

    if (node.nodes) {
      lines.push(...flattenAst(node.nodes, indent));
    }
  }

  return lines;
}

function isGeneratedUtilitySelector(selector: string | undefined): boolean {
  return selector !== undefined && /^\.(?!\/)/.test(selector);
}

function displayLinesFromRawCss(raw: string): string[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/^[^{]+\{([\s\S]*)\}\s*$/);
  const body = (match ? match[1] : trimmed).trim();
  return body
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}
