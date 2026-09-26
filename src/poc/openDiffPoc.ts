import * as path from "node:path";
import * as vscode from "vscode";
import {
  type CssBlockChange,
  detectCssDeclarationChanges,
} from "../css/detectCssChanges";
import { buildCssBlocks, sliceLines } from "../editor/buildCssBlocks";
import { MemoryFileSystem } from "../editor/editableDiffDocument";
import {
  showAnchorEditWarning,
  showCssChangeFeedback,
} from "../editor/showCssChangeFeedback";
import {
  type LineChange,
  type TailwindCssBlock,
  applyLineChangesToBlocks,
  changeTouchesAnchor,
  findBlocksTouchedByChange,
} from "../editor/trackCssBlocks";
import { parseTsx } from "../parser/parseTsx";
import {
  type ResolvedUtilityCss,
  resolveTailwindClasses,
} from "../tailwind/resolveTailwindClasses";
import { renderSemanticDiffDocument } from "./renderSemanticDiffDocument";

const POC_SCHEME = "tailwind-css-view-diff-poc";

interface DiffPocSession {
  rightUri: vscode.Uri;
  sourceUri: vscode.Uri;
  blocks: TailwindCssBlock[];
  lastText: string;
  lastChanges: CssBlockChange[];
  restoring: boolean;
}

export function registerDiffPoc(context: vscode.ExtensionContext): void {
  const fileSystem = new MemoryFileSystem();
  let session: DiffPocSession | undefined;

  context.subscriptions.push(fileSystem);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(POC_SCHEME, fileSystem, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!session || event.document.uri.toString() !== session.rightUri.toString()) {
        return;
      }
      void handleRightDocumentChange(event, session);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tailwindCssView.openDiffPoc", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(
          "Tailwind Diff POC requires an active text editor.",
        );
        return;
      }

      const sourceUri = editor.document.uri;
      const sourceText = editor.document.getText();
      const elements = parseTsx(sourceText);
      const workspaceRoot =
        sourceUri.scheme === "file"
          ? path.dirname(sourceUri.fsPath)
          : (vscode.workspace.getWorkspaceFolder(sourceUri)?.uri.fsPath ??
            process.cwd());

      let utilitiesByElement: ResolvedUtilityCss[][];
      try {
        const classNames = elements.flatMap((element) => element.classNames);
        const resolved = await resolveTailwindClasses(classNames, workspaceRoot);
        let offset = 0;
        utilitiesByElement = elements.map((element) => {
          const slice = resolved.utilities.slice(
            offset,
            offset + element.classNames.length,
          );
          offset += element.classNames.length;
          return slice;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Tailwind Diff POC: ${message}`);
        return;
      }

      const cssLinesByElement = utilitiesByElement.map((utilities) =>
        utilities.flatMap((utility) => utility.displayCss),
      );
      const rendered = renderSemanticDiffDocument(
        sourceText,
        elements,
        cssLinesByElement,
      );
      const rightUri = vscode.Uri.from({
        scheme: POC_SCHEME,
        path: `${sourceUri.path}.css`,
      });

      fileSystem.writeDocument(rightUri, rendered.text);

      const document = await vscode.workspace.openTextDocument(rightUri);
      await vscode.languages.setTextDocumentLanguage(document, "css");

      session = {
        rightUri,
        sourceUri,
        blocks: buildCssBlocks(
          rendered.blocks,
          elements,
          utilitiesByElement,
          sourceUri.toString(),
        ),
        lastText: document.getText(),
        lastChanges: [],
        restoring: false,
      };

      const fileName = sourceUri.path.split("/").pop() ?? "document";
      await vscode.commands.executeCommand(
        "vscode.diff",
        sourceUri,
        rightUri,
        `Tailwind Diff POC: ${fileName}`,
      );
    }),
  );
}

async function handleRightDocumentChange(
  event: vscode.TextDocumentChangeEvent,
  session: DiffPocSession,
): Promise<void> {
  if (session.restoring) {
    session.restoring = false;
    session.lastText = event.document.getText();
    return;
  }

  if (event.contentChanges.length === 0) {
    session.lastText = event.document.getText();
    return;
  }

  const lineChanges = event.contentChanges.map(toLineChange);

  if (
    lineChanges.some((change) =>
      session.blocks.some((block) => changeTouchesAnchor(change, block)),
    )
  ) {
    session.restoring = true;
    const restored = await restoreDocument(event.document, session.lastText);
    if (!restored) {
      session.restoring = false;
    }
    showAnchorEditWarning();
    return;
  }

  const touchedIds = new Set(
    lineChanges.flatMap((change) =>
      findBlocksTouchedByChange(session.blocks, change).map((block) => block.id),
    ),
  );
  const previousBlocks = session.blocks;
  session.blocks = applyLineChangesToBlocks(session.blocks, lineChanges);
  const currentText = event.document.getText();

  const detected: CssBlockChange[] = [];
  for (const blockId of touchedIds) {
    const previous = previousBlocks.find((block) => block.id === blockId);
    const next = session.blocks.find((block) => block.id === blockId);
    if (!previous || !next) {
      continue;
    }

    const changes = detectCssDeclarationChanges(
      sliceLines(
        session.lastText,
        previous.generated.cssStartLine,
        previous.generated.cssEndLine,
      ),
      sliceLines(
        currentText,
        next.generated.cssStartLine,
        next.generated.cssEndLine,
      ),
    );
    if (changes.length === 0) {
      continue;
    }

    detected.push({
      blockId: next.id,
      tagName: next.tagName,
      originalClassNames: next.source.originalClassNames,
      changes,
    });
  }

  session.lastChanges = detected;
  session.lastText = currentText;
  for (const change of detected) {
    showCssChangeFeedback(change);
  }
}

function toLineChange(change: vscode.TextDocumentContentChangeEvent): LineChange {
  return {
    startLine: change.range.start.line,
    startCharacter: change.range.start.character,
    endLine: change.range.end.line,
    endCharacter: change.range.end.character,
    text: change.text,
  };
}

async function restoreDocument(
  document: vscode.TextDocument,
  text: string,
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const lastLine = document.lineAt(document.lineCount - 1);
  edit.replace(
    document.uri,
    new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
    text,
  );
  return vscode.workspace.applyEdit(edit);
}
