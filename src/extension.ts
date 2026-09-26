import * as vscode from "vscode";
import { parseTsx } from "./parser/parseTsx";
import { registerDiffPoc } from "./poc/openDiffPoc";
import { renderAlignedView } from "./renderer/renderAlignedView";

const SCHEME = "tailwind-css-view";

class TailwindCssViewProvider implements vscode.TextDocumentContentProvider {
  private content = "/* Tailwind CSS View */";
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.onDidChangeEmitter.event;

  setContent(uri: vscode.Uri, content: string): void {
    this.content = content;
    this.onDidChangeEmitter.fire(uri);
  }

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.content;
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new TailwindCssViewProvider();

  context.subscriptions.push(provider);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tailwindCssView.open", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(
          "Tailwind CSS View requires an active text editor.",
        );
        return;
      }

      const sourceText = editor.document.getText();
      const elements = parseTsx(sourceText);
      const uri = vscode.Uri.parse(`${SCHEME}:view.css`);
      provider.setContent(uri, renderAlignedView(sourceText, elements));

      const document = await vscode.workspace.openTextDocument(uri);
      const cssDocument = await vscode.languages.setTextDocumentLanguage(
        document,
        "css",
      );
      await vscode.window.showTextDocument(
        cssDocument,
        vscode.ViewColumn.Beside,
      );
    }),
  );

  registerDiffPoc(context);
}

export function deactivate() {}
