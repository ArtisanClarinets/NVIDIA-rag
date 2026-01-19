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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendManager = exports.BackendStatus = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
var BackendStatus;
(function (BackendStatus) {
    BackendStatus["Starting"] = "Starting";
    BackendStatus["Running"] = "Running";
    BackendStatus["Stopping"] = "Stopping";
    BackendStatus["Stopped"] = "Stopped";
    BackendStatus["Error"] = "Error";
})(BackendStatus || (exports.BackendStatus = BackendStatus = {}));
class BackendManager {
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'copilot-rag.manageBackend'; // This command will be implemented later
        this._status = BackendStatus.Stopped;
        this.updateStatusBar();
        this.statusBarItem.show();
    }
    getStatus() {
        return this._status;
    }
    setStatus(status) {
        this._status = status;
        this.updateStatusBar();
    }
    updateStatusBar() {
        let text = '';
        let tooltip = '';
        switch (this._status) {
            case BackendStatus.Starting:
                text = '$(loading~spin) RAG: Starting...';
                tooltip = 'The RAG backend is starting.';
                break;
            case BackendStatus.Running:
                text = '$(rocket) RAG: Running';
                tooltip = 'The RAG backend is running.';
                break;
            case BackendStatus.Stopping:
                text = '$(loading~spin) RAG: Stopping...';
                tooltip = 'The RAG backend is stopping.';
                break;
            case BackendStatus.Stopped:
                text = '$(rocket) RAG: Stopped';
                tooltip = 'The RAG backend is stopped. Click to manage.';
                break;
            case BackendStatus.Error:
                text = '$(error) RAG: Error';
                tooltip = 'An error occurred with the RAG backend.';
                break;
        }
        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = tooltip;
    }
    async startBackend() {
        if (this._status === BackendStatus.Running || this._status === BackendStatus.Starting) {
            vscode.window.showInformationMessage('RAG backend is already running or starting.');
            return;
        }
        this.setStatus(BackendStatus.Starting);
        try {
            await this.executeDockerComposeCommand(['-f', 'docker-compose-rag-server.yaml', '-f', 'docker-compose-ingestor-server.yaml', 'up', '-d']);
            this.setStatus(BackendStatus.Running);
            vscode.window.showInformationMessage('RAG backend started successfully.');
        }
        catch (error) {
            this.setStatus(BackendStatus.Error);
            vscode.window.showErrorMessage(`Failed to start the RAG backend: ${error}`);
        }
    }
    async stopBackend() {
        if (this._status === BackendStatus.Stopped || this._status === BackendStatus.Stopping) {
            vscode.window.showInformationMessage('RAG backend is already stopped or stopping.');
            return;
        }
        this.setStatus(BackendStatus.Stopping);
        try {
            await this.executeDockerComposeCommand(['-f', 'docker-compose-rag-server.yaml', '-f', 'docker-compose-ingestor-server.yaml', 'down']);
            this.setStatus(BackendStatus.Stopped);
            vscode.window.showInformationMessage('RAG backend stopped successfully.');
        }
        catch (error) {
            this.setStatus(BackendStatus.Error);
            vscode.window.showErrorMessage(`Failed to stop the RAG backend: ${error}`);
        }
    }
    executeDockerComposeCommand(args) {
        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('copilot-rag');
            const dockerComposePath = config.get('dockerComposePath');
            const llmProvider = config.get('llmProvider');
            const embeddingModel = config.get('embeddingModel');
            if (!dockerComposePath) {
                return reject('Docker Compose path is not configured. Please set it in the settings.');
            }
            const command = 'docker-compose';
            const env = {
                ...process.env,
                APP_LLM_MODELNAME: llmProvider,
                APP_EMBEDDINGS_MODELNAME: embeddingModel
            };
            cp.execFile(command, args, { cwd: dockerComposePath, env }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`execFile error: ${err}`);
                    return reject(stderr || err.message);
                }
                resolve(stdout);
            });
        });
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.BackendManager = BackendManager;
//# sourceMappingURL=BackendManager.js.map