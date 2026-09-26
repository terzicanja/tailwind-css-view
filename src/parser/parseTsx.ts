import * as ts from "typescript";

export interface TailwindElement {
  tagName: string;
  startLine: number;
  endLine: number;
  classNames: string[];
  classNameStart: number;
  classNameEnd: number;
}

export function parseTsx(sourceText: string): TailwindElement[] {
  const sourceFile = ts.createSourceFile(
    "source.tsx",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const elements: TailwindElement[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const classNames = getStaticClassNames(node);
      if (classNames !== undefined) {
        const start = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const classNameRange = getClassNameRange(node, sourceFile);
        elements.push({
          tagName: getTagName(node.tagName, sourceFile),
          startLine: start.line,
          endLine: end.line,
          classNames,
          classNameStart: classNameRange.start,
          classNameEnd: classNameRange.end,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return elements;
}

function getStaticClassNames(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): string[] | undefined {
  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property)) {
      continue;
    }

    if (getAttributeName(property) !== "className") {
      continue;
    }

    const initializer = property.initializer;
    if (!initializer || !ts.isStringLiteral(initializer)) {
      return undefined;
    }

    return splitClassNames(initializer.text);
  }

  return undefined;
}

function getClassNameRange(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
): { start: number; end: number } {
  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property)) {
      continue;
    }
    if (getAttributeName(property) !== "className") {
      continue;
    }
    const initializer = property.initializer;
    if (initializer && ts.isStringLiteral(initializer)) {
      return {
        start: initializer.getStart(sourceFile) + 1,
        end: initializer.getEnd() - 1,
      };
    }
  }

  return { start: -1, end: -1 };
}

function getAttributeName(attribute: ts.JsxAttribute): string {
  const { name } = attribute;
  if (ts.isIdentifier(name)) {
    return name.text;
  }

  return `${name.namespace.text}:${name.name.text}`;
}

function getTagName(
  tagName: ts.JsxTagNameExpression,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }

  if (ts.isJsxNamespacedName(tagName)) {
    return `${tagName.namespace.text}:${tagName.name.text}`;
  }

  return tagName.getText(sourceFile);
}

function splitClassNames(value: string): string[] {
  return value.split(/\s+/).filter((className) => className.length > 0);
}
