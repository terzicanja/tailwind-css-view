import * as ts from "typescript";

export interface TailwindElement {
  tagName: string;
  startLine: number;
  endLine: number;
  classNames: string[];
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
        elements.push({
          tagName: getTagName(node.tagName, sourceFile),
          startLine: start.line,
          endLine: end.line,
          classNames,
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
