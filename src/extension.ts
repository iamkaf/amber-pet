import * as vscode from 'vscode';

const commandId = 'amberPet.spawn';
const viewType = 'amberPet.panel';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'interaction'; name: string }
  | { type: 'error'; message: string };

type WebviewActivityMessage = {
  type: 'activity';
  activity: 'spawn' | 'typing' | 'editorOpened';
};

type WebviewConfigMessage = {
  type: 'config';
  config: {
    extensionVersion: string;
    assets: {
      images: string;
      frameBaseUri: string;
    };
    manifest: unknown;
  };
};

export function activate(context: vscode.ExtensionContext): void {
  const controller = new AmberPetController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, () => controller.spawnOrReveal()),
    controller,
    vscode.workspace.onDidChangeTextDocument((event) => controller.handleTextDocumentChange(event)),
    vscode.window.onDidChangeActiveTextEditor((editor) => controller.handleActiveEditorChange(editor)),
    vscode.window.registerWebviewPanelSerializer(viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
        controller.restore(panel);
      }
    })
  );
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered on the extension context.
}

class AmberPetController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(sparkle) Amber Pet';
    this.statusBarItem.tooltip = 'Spawn or reveal Amber Pet';
    this.statusBarItem.command = commandId;
    this.statusBarItem.show();
    this.disposables.push(this.statusBarItem);
  }

  spawnOrReveal(): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (this.panel) {
      this.panel.reveal(column);
      this.postActivity('spawn');
      return;
    }

    const panel = vscode.window.createWebviewPanel(viewType, 'Amber Pet', column, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    });

    this.attachPanel(panel);
  }

  restore(panel: vscode.WebviewPanel): void {
    this.attachPanel(panel);
  }

  dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }

    this.panel?.dispose();
    this.panel = undefined;
  }

  private attachPanel(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    panel.webview.html = this.getHtml(panel.webview);

    const panelDisposables: vscode.Disposable[] = [];

    panel.onDidDispose(
      () => {
        if (this.panel === panel) {
          this.panel = undefined;
        }

        while (panelDisposables.length) {
          panelDisposables.pop()?.dispose();
        }
      },
      undefined,
      panelDisposables
    );

    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(panel, message),
      undefined,
      panelDisposables
    );
  }

  private handleWebviewMessage(panel: vscode.WebviewPanel, message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        void this.sendInitialState(panel);
        return;
      case 'interaction':
        console.debug(`[Amber Pet] interaction: ${message.name}`);
        return;
      case 'error':
        console.error(`[Amber Pet] webview error: ${message.message}`);
        return;
    }
  }

  handleTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) {
      return;
    }

    this.postActivity('typing');
  }

  handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    this.postActivity('editorOpened');
  }

  private async sendInitialState(panel: vscode.WebviewPanel): Promise<void> {
    try {
      await panel.webview.postMessage(await this.getConfigMessage(panel.webview));
      await panel.webview.postMessage({ type: 'activity', activity: 'spawn' } satisfies WebviewActivityMessage);
    } catch (error) {
      console.error(`[Amber Pet] failed to initialize webview: ${String(error)}`);
    }
  }

  private postActivity(activity: WebviewActivityMessage['activity']): void {
    void this.panel?.webview.postMessage({ type: 'activity', activity } satisfies WebviewActivityMessage);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'amberPet.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'amberPet.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; media-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${stylesUri}" rel="stylesheet">
  <title>Amber Pet</title>
</head>
<body>
  <main class="pet-stage" aria-label="Amber Pet playground">
    <div class="pet-shadow" aria-hidden="true"></div>
    <button class="pet" type="button" aria-label="Pet Amber">
      <img class="pet-sprite" alt="" draggable="false">
    </button>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async getConfigMessage(webview: vscode.Webview): Promise<WebviewConfigMessage> {
    const imageBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'images'));
    const frameBaseUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'images', 'processed')
    );
    const manifestUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'media',
      'images',
      'processed',
      'manifest.json'
    );
    const manifestBytes = await vscode.workspace.fs.readFile(manifestUri);

    return {
      type: 'config',
      config: {
        extensionVersion: String(this.context.extension.packageJSON.version),
        assets: {
          images: imageBaseUri.toString(),
          frameBaseUri: frameBaseUri.toString()
        },
        manifest: JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as unknown
      }
    };
  }
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}
