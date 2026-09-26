import * as vscode from "vscode";

/**
 * In-memory FileSystemProvider used as the writable RIGHT side of vscode.diff.
 * The document never touches the user's project or the OS temp directory.
 */
export class MemoryFileSystem
  implements vscode.FileSystemProvider, vscode.Disposable
{
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
    _options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    },
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
    const prefix =
      uri.path === "/" || uri.path === ""
        ? "/"
        : `${uri.path.replace(/\/$/, "")}/`;
    const entries = new Map<string, vscode.FileType>();

    for (const filePath of this.files.keys()) {
      if (prefix === "/") {
        const name = filePath.replace(/^\//, "").split("/")[0];
        if (name) {
          entries.set(
            name,
            filePath === `/${name}`
              ? vscode.FileType.File
              : vscode.FileType.Directory,
          );
        }
        continue;
      }

      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const rest = filePath.slice(prefix.length);
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
