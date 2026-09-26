import * as vscode from "vscode";
import { type CssBlockChange } from "../css/detectCssChanges";

/**
 * Temporary development feedback. Safe to delete this module later.
 */
export function showCssChangeFeedback(change: CssBlockChange): void {
  if (change.changes.length === 0) {
    return;
  }

  const summary = change.changes
    .map((item) => {
      const from = item.oldValue ?? "[new]";
      const to = item.newValue ?? "[deleted]";
      return `${item.property}: ${from} → ${to}`;
    })
    .join("; ");

  void vscode.window.showInformationMessage(
    `Tailwind CSS View: <${change.tagName}> — ${summary}`,
  );
}

export function showAnchorEditWarning(): void {
  void vscode.window.showInformationMessage(
    "Tailwind CSS View: JSX anchor lines cannot be edited.",
  );
}
