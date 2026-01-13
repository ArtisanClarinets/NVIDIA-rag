import * as vscode from 'vscode';
import * as cp from 'child_process';

export enum BackendStatus {
    Starting = 'Starting',
    Running = 'Running',
    Stopping = 'Stopping',
    Stopped = 'Stopped',
    Error = 'Error'
}

export class BackendManager {
    private statusBarItem: vscode.StatusBarItem;
    private _status: BackendStatus;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'copilot-rag.manageBackend'; // This command will be implemented later
        this._status = BackendStatus.Stopped;
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    public getStatus(): BackendStatus {
        return this._status;
    }

    private setStatus(status: BackendStatus) {
        this._status = status;
        this.updateStatusBar();
    }

    private updateStatusBar() {
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

    public async startBackend() {
        if (this._status === BackendStatus.Running || this._status === BackendStatus.Starting) {
            vscode.window.showInformationMessage('RAG backend is already running or starting.');
            return;
        }

        this.setStatus(BackendStatus.Starting);
        try {
            await this.executeDockerComposeCommand(['-f', 'docker-compose-rag-server.yaml', '-f', 'docker-compose-ingestor-server.yaml', 'up', '-d']);
            this.setStatus(BackendStatus.Running);
            vscode.window.showInformationMessage('RAG backend started successfully.');
        } catch (error) {
            this.setStatus(BackendStatus.Error);
            vscode.window.showErrorMessage(`Failed to start the RAG backend: ${error}`);
        }
    }

    public async stopBackend() {
        if (this._status === BackendStatus.Stopped || this._status === BackendStatus.Stopping) {
            vscode.window.showInformationMessage('RAG backend is already stopped or stopping.');
            return;
        }
        this.setStatus(BackendStatus.Stopping);
        try {
            await this.executeDockerComposeCommand(['-f', 'docker-compose-rag-server.yaml', '-f', 'docker-compose-ingestor-server.yaml', 'down']);
            this.setStatus(BackendStatus.Stopped);
             vscode.window.showInformationMessage('RAG backend stopped successfully.');
        } catch (error) {
            this.setStatus(BackendStatus.Error);
            vscode.window.showErrorMessage(`Failed to stop the RAG backend: ${error}`);
        }
    }

    private executeDockerComposeCommand(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('copilot-rag');
            const dockerComposePath = config.get<string>('dockerComposePath');
            const llmProvider = config.get<string>('llmProvider');
            const embeddingModel = config.get<string>('embeddingModel');

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

    public dispose() {
        this.statusBarItem.dispose();
    }
}
