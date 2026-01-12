import * as vscode from 'vscode';
import axios from 'axios';
import * as cp from 'child_process';
import * as path from 'path';
import FormData from 'form-data';

export function activate(context: vscode.ExtensionContext) {
    const handler: vscode.ChatParticipant['handler'] = async (request, context, stream, token) => {
        const config = vscode.workspace.getConfiguration('copilot-rag');
        const ragServerUrl = config.get<string>('ragServerUrl');

        if (!ragServerUrl) {
            stream.markdown('RAG server URL is not configured. Please set it in the settings.');
            return { metadata: { command: '' } };
        }

        const prompt = request.prompt;

        try {
            const response = await axios.post(`${ragServerUrl}/generate`, {
                messages: [{ role: 'user', content: prompt }],
                use_knowledge_base: true
            }, {
                responseType: 'stream'
            });

            for await (const chunk of response.data) {
                stream.markdown(chunk.toString());
            }

        } catch (error) {
            console.error(error);
            stream.markdown('Error fetching response from RAG server.');
        }

        return { metadata: { command: '' } };
    };

    const ragParticipant = vscode.chat.createChatParticipant('copilot-rag', handler);
    ragParticipant.iconPath = new vscode.ThemeIcon('rocket');

    context.subscriptions.push(
        ragParticipant,
        vscode.commands.registerCommand('copilot-rag.startBackend', () => {
            const config = vscode.workspace.getConfiguration('copilot-rag');
            const dockerComposePath = config.get<string>('dockerComposePath');

            if (!dockerComposePath) {
                vscode.window.showErrorMessage('Docker Compose path is not configured. Please set it in the settings.');
                return;
            }

            const command = `docker-compose -f docker-compose-rag-server.yaml -f docker-compose-ingestor-server.yaml up -d`;
            cp.exec(command, { cwd: dockerComposePath }, (err, stdout, stderr) => {
                if (err) {
                    vscode.window.showErrorMessage(`Error starting backend: ${stderr}`);
                    return;
                }
                vscode.window.showInformationMessage('RAG backend started successfully.');
            });
        }),
        vscode.commands.registerCommand('copilot-rag.stopBackend', () => {
            const config = vscode.workspace.getConfiguration('copilot-rag');
            const dockerComposePath = config.get<string>('dockerComposePath');

            if (!dockerComposePath) {
                vscode.window.showErrorMessage('Docker Compose path is not configured. Please set it in the settings.');
                return;
            }

            const command = `docker-compose -f docker-compose-rag-server.yaml -f docker-compose-ingestor-server.yaml down`;
            cp.exec(command, { cwd: dockerComposePath }, (err, stdout, stderr) => {
                if (err) {
                    vscode.window.showErrorMessage(`Error stopping backend: ${stderr}`);
                    return;
                }
                vscode.window.showInformationMessage('RAG backend stopped successfully.');
            });
        }),
        vscode.commands.registerCommand('copilot-rag.ingestWorkspace', async () => {
            const config = vscode.workspace.getConfiguration('copilot-rag');
            const ingestionServerUrl = config.get<string>('ingestionServerUrl');
            const vdbEndpoint = config.get<string>('vdbEndpoint');

            if (!ingestionServerUrl || !vdbEndpoint) {
                vscode.window.showErrorMessage('Ingestion server URL or VDB endpoint is not configured. Please set them in the settings.');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Ingesting workspace...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Finding files..." });

                const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.vscode/**,**/dist/**,**/build/**}');

                progress.report({ increment: 10, message: `Found ${files.length} files. Starting upload...` });

                const BATCH_SIZE = 50;
                const totalBatches = Math.ceil(files.length / BATCH_SIZE);

                try {
                    for (let i = 0; i < files.length; i += BATCH_SIZE) {
                        const batch = files.slice(i, i + BATCH_SIZE);
                        const currentBatchNum = (i / BATCH_SIZE) + 1;

                        progress.report({
                            increment: (1 / totalBatches) * 80,
                            message: `Uploading batch ${currentBatchNum} of ${totalBatches}...`
                        });

                        const formData = new FormData();
                        const jsonPart = {
                            "vdb_endpoint": vdbEndpoint,
                            "collection_name": "multimodal_data",
                            "blocking": true,
                            "split_options": {
                                "chunk_size": 512,
                                "chunk_overlap": 150
                            },
                            "custom_metadata": [],
                            "generate_summary": false
                        };
                        formData.append('data', JSON.stringify(jsonPart), { contentType: 'application/json' });

                        for (const file of batch) {
                            const fileContents = await vscode.workspace.fs.readFile(file);
                            formData.append('documents', fileContents, path.basename(file.fsPath));
                        }

                        await axios.post(`${ingestionServerUrl}/documents`, formData, {
                            headers: formData.getHeaders()
                        });
                    }
                    vscode.window.showInformationMessage('Workspace ingested successfully.');
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        vscode.window.showErrorMessage(`Error ingesting workspace: ${error.message}`);
                        console.error(error.response?.data);
                    } else {
                        vscode.window.showErrorMessage(`An unknown error occurred during ingestion: ${error}`);
                    }
                }
            });
        })
    );
}

export function deactivate() {}
