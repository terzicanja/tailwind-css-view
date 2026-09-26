import * as path from "node:path";
import * as vscode from "vscode";
import { parseTsx } from "../parser/parseTsx";
import { resolveTailwindClasses } from "../tailwind/resolveTailwindClasses";
import { renderSemanticDiffDocument } from "./renderSemanticDiffDocument";

const POC_SCHEME = "tailwind-css-view-diff-poc";

/**
 * In-memory FileSystemProvider backing the editable right-hand POC document.
 * TextDocumentContentProvider cannot be used here because those documents
 * are read-only. Untitled documents are editable, but VS Code treats them
 * as unsaved files and a Save can write into the user's project. A custom
 * scheme stays out of the workspace and never touches disk.
 */
class MemoryFileSystem implements vscode.FileSystemProvider, vscode.Disposable {
  private readonly files = new Map<
    string,
    { data: Uint8Array; ctime: number; mtime: number }
  >();
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  readonly onDidChangeFile = this.emitter.event;

  writeDocument(uri: vscode.Uri, text: string): void {
    this.writeFile(uri, new TextEncoder().encode(text), {
      create: true,
      overwrite: true,
    });
  }

  watch(
    _uri: vscode.Uri,
    _options: { readonly recursive: boolean; readonly excludes: readonly string[] },
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const file = this.files.get(uri.path);
    if (file) {
      return {
        type: vscode.FileType.File,
        ctime: file.ctime,
        mtime: file.mtime,
        size: file.data.byteLength,
      };
    }

    if (this.hasDirectory(uri.path)) {
      return {
        type: vscode.FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0,
      };
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const prefix = uri.path === "/" || uri.path === "" ? "/" : `${uri.path.replace(/\/$/, "")}/`;
    const entries = new Map<string, vscode.FileType>();

    for (const path of this.files.keys()) {
      if (prefix === "/") {
        const name = path.replace(/^\//, "").split("/")[0];
        if (name) {
          entries.set(
            name,
            path === `/${name}` ? vscode.FileType.File : vscode.FileType.Directory,
          );
        }
        continue;
      }

      if (!path.startsWith(prefix)) {
        continue;
      }

      const rest = path.slice(prefix.length);
      const name = rest.split("/")[0];
      if (name) {
        entries.set(
          name,
          rest.includes("/") ? vscode.FileType.Directory : vscode.FileType.File,
        );
      }
    }

    return [...entries.entries()];
  }

  createDirectory(_uri: vscode.Uri): void {}

  readFile(uri: vscode.Uri): Uint8Array {
    const file = this.files.get(uri.path);
    if (!file) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return file.data;
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean },
  ): void {
    const existing = this.files.get(uri.path);
    if (!existing && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (existing && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const now = Date.now();
    this.files.set(uri.path, {
      data: content,
      ctime: existing?.ctime ?? now,
      mtime: now,
    });
    this.emitter.fire([
      {
        type: existing
          ? vscode.FileChangeType.Changed
          : vscode.FileChangeType.Created,
        uri,
      },
    ]);
  }

  delete(uri: vscode.Uri): void {
    if (!this.files.delete(uri.path)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): void {
    const file = this.files.get(oldUri.path);
    if (!file) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }
    this.writeFile(newUri, file.data, {
      create: true,
      overwrite: options.overwrite,
    });
    this.delete(oldUri);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private hasDirectory(path: string): boolean {
    if (path === "/" || path === "") {
      return true;
    }

    const prefix = path.endsWith("/") ? path : `${path}/`;
    for (const filePath of this.files.keys()) {
      if (filePath === path || filePath.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }
}

export function registerDiffPoc(context: vscode.ExtensionContext): void {
  const fileSystem = new MemoryFileSystem();

  context.subscriptions.push(fileSystem);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(POC_SCHEME, fileSystem, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.scheme !== POC_SCHEME) {
        return;
      }

      console.log("[Tailwind Diff POC] right-side document changed", {
        uri: event.document.uri.toString(),
        changeCount: event.contentChanges.length,
        version: event.document.version,
      });
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== POC_SCHEME) {
        return;
      }

      console.log("[Tailwind Diff POC] right-side document saved", {
        uri: document.uri.toString(),
        version: document.version,
      });
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

      let cssLinesByElement: string[][];
      try {
        const classNames = elements.flatMap((element) => element.classNames);
        const resolved = await resolveTailwindClasses(classNames, workspaceRoot);
        let offset = 0;
        cssLinesByElement = elements.map((element) => {
          const slice = resolved.utilities.slice(
            offset,
            offset + element.classNames.length,
          );
          offset += element.classNames.length;
          return slice.flatMap((utility) => utility.displayCss);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Tailwind Diff POC: ${message}`);
        return;
      }

      const rightUri = vscode.Uri.from({
        scheme: POC_SCHEME,
        path: `${sourceUri.path}.css`,
      });

      fileSystem.writeDocument(
        rightUri,
        renderSemanticDiffDocument(sourceText, elements, cssLinesByElement),
      );

      const document = await vscode.workspace.openTextDocument(rightUri);
      await vscode.languages.setTextDocumentLanguage(document, "css");

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
