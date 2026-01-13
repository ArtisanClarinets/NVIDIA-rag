import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import FormData from 'form-data';

export class IngestionManager {
    private ingestionStatusView: vscode.TreeView<vscode.TreeItem>;
    private treeDataProvider: IngestionStatusProvider;

    constructor() {
        this.treeDataProvider = new IngestionStatusProvider();
        this.ingestionStatusView = vscode.window.createTreeView('copilot-rag-ingestion', { treeDataProvider: this.treeDataProvider });
    }

    public async ingestWorkspace() {
        const config = vscode.workspace.getConfiguration('copilot-rag');
        const ingestionServerUrl = config.get<string>('ingestionServerUrl');
        const vdbEndpoint = config.get<string>('vdbEndpoint');

        if (!ingestionServerUrl || !vdbEndpoint) {
            vscode.window.showErrorMessage('Ingestion server URL or VDB endpoint is not configured. Please set them in the settings.');
            return;
        }

        this.treeDataProvider.updateStatus('indexing', 'Starting ingestion...');

        await vscode.window.withProgress({
            location: { viewId: 'copilot-rag-ingestion' },
            title: "Ingesting workspace...",
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.treeDataProvider.updateStatus('idle', 'Ingestion cancelled.');
                vscode.window.showInformationMessage("Workspace ingestion has been cancelled.");
            });

            progress.report({ increment: 0, message: "Finding files..." });
            this.treeDataProvider.updateStatus('indexing', 'Finding files...');

            const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.vscode/**,**/dist/**,**/build/**}');

            if (token.isCancellationRequested) return;

            progress.report({ increment: 10, message: `Found ${files.length} files. Starting upload...` });
            this.treeDataProvider.updateStatus('indexing', `Found ${files.length} files. Starting upload...`);

            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(files.length / BATCH_SIZE);

            try {
                for (let i = 0; i < files.length; i += BATCH_SIZE) {
                    if (token.isCancellationRequested) return;

                    const batch = files.slice(i, i + BATCH_SIZE);
                    const currentBatchNum = (i / BATCH_SIZE) + 1;
                    const progressIncrement = (1 / totalBatches) * 80;

                    const progressMessage = `Uploading batch ${currentBatchNum} of ${totalBatches}...`;
                    progress.report({ increment: progressIncrement, message: progressMessage });
                    this.treeDataProvider.updateStatus('indexing', progressMessage);

                    const formData = new FormData();
                    const jsonPart = {
                        "vdb_endpoint": vdbEndpoint,
                        "collection_name": "multimodal_data",
                        "blocking": true,
                        "split_options": { "chunk_size": 512, "chunk_overlap": 150 },
                        "custom_metadata": [],
                        "generate_summary": false
                    };
                    formData.append('data', JSON.stringify(jsonPart), { contentType: 'application/json' });

                    for (const file of batch) {
                        const fileContents = await vscode.workspace.fs.readFile(file);
                        formData.append('documents', fileContents, path.basename(file.fsPath));
                    }

                    await axios.post(`${ingestionServerUrl}/documents`, formData, {
                        headers: formData.getHeaders(),
                        cancelToken: new axios.CancelToken(cancel => {
                            token.onCancellationRequested(() => {
                                cancel('Operation canceled by the user.');
                            });
                        })
                    });
                }
                this.treeDataProvider.updateStatus('completed', `Ingestion complete. ${files.length} files indexed.`);
                vscode.window.showInformationMessage('Workspace ingested successfully.');
            } catch (error) {
                 this.treeDataProvider.updateStatus('error', 'Ingestion failed.');
                if (axios.isAxiosError(error)) {
                    vscode.window.showErrorMessage(`Error ingesting workspace: ${error.message}`);
                    console.error(error.response?.data);
                } else {
                    vscode.window.showErrorMessage(`An unknown error occurred during ingestion: ${error}`);
                }
            }
        });
    }

    public dispose() {
        this.ingestionStatusView.dispose();
    }
}

class IngestionStatusProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private status: 'idle' | 'indexing' | 'completed' | 'error' = 'idle';
    private message: string = 'Ready to ingest workspace.';

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            const item = new vscode.TreeItem(this.message);
            switch(this.status) {
                case 'indexing':
                    item.iconPath = new vscode.ThemeIcon('loading~spin');
                    break;
                case 'completed':
                    item.iconPath = new vscode.ThemeIcon('check');
                    break;
                case 'error':
                     item.iconPath = new vscode.ThemeIcon('error');
                    break;
                case 'idle':
                default:
                     item.iconPath = new vscode.ThemeIcon('info');
                    break;
            }
            return Promise.resolve([item]);
        }
        return Promise.resolve([]);
    }

    public updateStatus(status: 'idle' | 'indexing' | 'completed' | 'error', message: string) {
        this.status = status;
        this.message = message;
        this._onDidChangeTreeData.fire();
    }
}
