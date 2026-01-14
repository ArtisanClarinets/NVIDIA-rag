"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionManager = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const path = __importStar(require("path"));
const form_data_1 = __importDefault(require("form-data"));
class IngestionManager {
    constructor() {
        this.treeDataProvider = new IngestionStatusProvider();
        this.ingestionStatusView = vscode.window.createTreeView('copilot-rag-ingestion', { treeDataProvider: this.treeDataProvider });
    }
    async ingestWorkspace() {
        const config = vscode.workspace.getConfiguration('copilot-rag');
        const ingestionServerUrl = config.get('ingestionServerUrl');
        const vdbEndpoint = config.get('vdbEndpoint');
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
            if (token.isCancellationRequested)
                return;
            progress.report({ increment: 10, message: `Found ${files.length} files. Starting upload...` });
            this.treeDataProvider.updateStatus('indexing', `Found ${files.length} files. Starting upload...`);
            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(files.length / BATCH_SIZE);
            try {
                for (let i = 0; i < files.length; i += BATCH_SIZE) {
                    if (token.isCancellationRequested)
                        return;
                    const batch = files.slice(i, i + BATCH_SIZE);
                    const currentBatchNum = (i / BATCH_SIZE) + 1;
                    const progressIncrement = (1 / totalBatches) * 80;
                    const progressMessage = `Uploading batch ${currentBatchNum} of ${totalBatches}...`;
                    progress.report({ increment: progressIncrement, message: progressMessage });
                    this.treeDataProvider.updateStatus('indexing', progressMessage);
                    const formData = new form_data_1.default();
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
                    await axios_1.default.post(`${ingestionServerUrl}/documents`, formData, {
                        headers: formData.getHeaders(),
                        cancelToken: new axios_1.default.CancelToken(cancel => {
                            token.onCancellationRequested(() => {
                                cancel('Operation canceled by the user.');
                            });
                        })
                    });
                }
                this.treeDataProvider.updateStatus('completed', `Ingestion complete. ${files.length} files indexed.`);
                vscode.window.showInformationMessage('Workspace ingested successfully.');
            }
            catch (error) {
                this.treeDataProvider.updateStatus('error', 'Ingestion failed.');
                if (axios_1.default.isAxiosError(error)) {
                    vscode.window.showErrorMessage(`Error ingesting workspace: ${error.message}`);
                    console.error(error.response?.data);
                }
                else {
                    vscode.window.showErrorMessage(`An unknown error occurred during ingestion: ${error}`);
                }
            }
        });
    }
    dispose() {
        this.ingestionStatusView.dispose();
    }
}
exports.IngestionManager = IngestionManager;
class IngestionStatusProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.status = 'idle';
        this.message = 'Ready to ingest workspace.';
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const item = new vscode.TreeItem(this.message);
            switch (this.status) {
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
    updateStatus(status, message) {
        this.status = status;
        this.message = message;
        this._onDidChangeTreeData.fire();
    }
}
//# sourceMappingURL=IngestionManager.js.map