import * as vscode from 'vscode';

const commandId = 'amberPet.spawn';
const panelViewType = 'amberPet.panel';
const sidebarViewType = 'amberPet.view';
const installPromptStateKey = 'amberPet.hasShownInstallPrompt';
const spawnAmberAction = 'Spawn Amber';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'interaction'; name: string }
  | { type: 'error'; message: string };

type WebviewActivityMessage = {
  type: 'activity';
  activity: 'spawn' | 'typing';
};

type WebviewConfigMessage = {
  type: 'config';
  config: {
    extensionVersion: string;
    assets: {
      backgrounds: Array<{
        id: string;
        wide: {
          name: string;
          uri: string;
        };
        narrow: {
          name: string;
          uri: string;
        };
      }>;
      images: string;
      frameBaseUri: string;
      sounds: {
        aprehensive: string;
        aprehensive3: string;
        curious: string;
        dropped1: string;
        dropped2: string;
        happy: string;
        startled: string;
      };
    };
    manifest: unknown;
  };
};

type AmberWebviewHost = {
  readonly webview: vscode.Webview;
};

export function activate(context: vscode.ExtensionContext): void {
  const controller = new AmberPetController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, () => controller.spawnOrReveal()),
    controller,
    vscode.window.registerWebviewViewProvider(sidebarViewType, controller, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => controller.handleTextDocumentChange(event)),
    vscode.window.registerWebviewPanelSerializer(panelViewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
        controller.restore(panel);
      }
    })
  );

  void showInstallPrompt(context);
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered on the extension context.
}

async function showInstallPrompt(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(installPromptStateKey)) {
    return;
  }

  await context.globalState.update(installPromptStateKey, true);

  const selection = await vscode.window.showInformationMessage(
    'Amber Pet is installed. Spawn Amber in the Explorer?',
    spawnAmberAction
  );

  if (selection === spawnAmberAction) {
    await vscode.commands.executeCommand(commandId);
  }
}

class AmberPetController implements vscode.WebviewViewProvider, vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(sparkle) Amber Pet';
    this.statusBarItem.tooltip = 'Spawn or reveal Amber Pet in the Explorer';
    this.statusBarItem.command = commandId;
    this.statusBarItem.show();
    this.disposables.push(this.statusBarItem);
  }

  spawnOrReveal(): void {
    void this.revealSidebarView();
  }

  restore(panel: vscode.WebviewPanel): void {
    this.attachPanel(panel);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = this.getWebviewOptions();
    view.webview.html = this.getHtml(view.webview);

    const viewDisposables: vscode.Disposable[] = [];

    view.onDidDispose(
      () => {
        if (this.view === view) {
          this.view = undefined;
        }

        while (viewDisposables.length) {
          viewDisposables.pop()?.dispose();
        }
      },
      undefined,
      viewDisposables
    );

    view.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(view, message),
      undefined,
      viewDisposables
    );
  }

  private async revealSidebarView(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.view.explorer');
      await vscode.commands.executeCommand(`${sidebarViewType}.focus`);
      this.postActivity('spawn');
    } catch (error) {
      console.error(`[Amber Pet] failed to focus sidebar view: ${String(error)}`);
      void vscode.window.showErrorMessage('Amber Pet could not reveal the Explorer view.');
    }
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
    panel.webview.options = this.getWebviewOptions();
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

  private handleWebviewMessage(host: AmberWebviewHost, message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        void this.sendInitialState(host);
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

  private async sendInitialState(host: AmberWebviewHost): Promise<void> {
    try {
      await host.webview.postMessage(await this.getConfigMessage(host.webview));
      await host.webview.postMessage({ type: 'activity', activity: 'spawn' } satisfies WebviewActivityMessage);
    } catch (error) {
      console.error(`[Amber Pet] failed to initialize webview: ${String(error)}`);
    }
  }

  private postActivity(activity: WebviewActivityMessage['activity']): void {
    const message = { type: 'activity', activity } satisfies WebviewActivityMessage;
    void this.view?.webview.postMessage(message);
    void this.panel?.webview.postMessage(message);
  }

  private getWebviewOptions(): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
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
    <div class="room-background-layer is-active" aria-hidden="true"></div>
    <div class="room-background-layer" aria-hidden="true"></div>
    <div class="background-controls" hidden>
      <button class="background-control" type="button" data-background-step="-1" aria-label="Previous background">&lsaquo;</button>
      <button class="background-control" type="button" data-background-step="1" aria-label="Next background">&rsaquo;</button>
    </div>
    <div class="pet-shadow" aria-hidden="true"></div>
    <button class="pet" type="button" aria-label="Pet Amber">
      <span class="pet-hover-layer" aria-hidden="true">
        <span class="pet-motion-layer">
          <span class="pet-direction-layer">
            <img class="pet-sprite" alt="" draggable="false">
          </span>
        </span>
      </span>
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
    const backgroundBaseUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'images', 'backgrounds');
    const audioBaseUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'audio');
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
          backgrounds: Array.from({ length: 10 }, (_, index) => {
            const roomNumber = String(index + 1).padStart(2, '0');
            const wideName = `cozy-room-${roomNumber}.png`;
            const narrowName = `cozy-room-${roomNumber}-narrow.png`;

            return {
              id: `cozy-room-${roomNumber}`,
              wide: {
                name: wideName,
                uri: webview.asWebviewUri(vscode.Uri.joinPath(backgroundBaseUri, wideName)).toString()
              },
              narrow: {
                name: narrowName,
                uri: webview.asWebviewUri(vscode.Uri.joinPath(backgroundBaseUri, narrowName)).toString()
              }
            };
          }),
          images: imageBaseUri.toString(),
          frameBaseUri: frameBaseUri.toString(),
          sounds: {
            aprehensive: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'aprehensive.mp3')).toString(),
            aprehensive3: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'aprehensive3.mp3')).toString(),
            curious: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'curious.mp3')).toString(),
            dropped1: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'dropped1.mp3')).toString(),
            dropped2: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'dropped2.mp3')).toString(),
            happy: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'happy.mp3')).toString(),
            startled: webview.asWebviewUri(vscode.Uri.joinPath(audioBaseUri, 'startled.mp3')).toString()
          }
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
