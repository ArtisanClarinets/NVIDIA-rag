import * as vscode from 'vscode';
import axios from 'axios';
import { BackendManager, BackendStatus } from './BackendManager';
import { IngestionManager } from './IngestionManager';

export function activate(context: vscode.ExtensionContext) {
    const backendManager = new BackendManager();
    const ingestionManager = new IngestionManager();
    context.subscriptions.push(backendManager, ingestionManager);

    const handler: vscode.ChatParticipant['handler'] = async (request, _context, stream, token) => {
        if (backendManager.getStatus() !== BackendStatus.Running) {
            stream.markdown('The RAG backend is not running. Please start it first.');
            return { metadata: { command: '' } };
        }

        const config = vscode.workspace.getConfiguration('copilot-rag');
        const ragServerUrl = config.get<string>('ragServerUrl');

        if (!ragServerUrl) {
            stream.markdown('RAG server URL is not configured. Please set it in the settings.');
            return { metadata: { command: '' } };
        }

        const prompt = request.prompt;

        stream.progress('Thinking...');
        try {
            const response = await axios.post(`${ragServerUrl}/generate`, {
                messages: [{ role: 'user', content: prompt }],
                use_knowledge_base: true,
                enable_citations: true
            }, {
                responseType: 'stream',
                timeout: 60000, // 60 seconds timeout
                cancelToken: new axios.CancelToken(source => {
                    token.onCancellationRequested(() => {
                        source.cancel('Request canceled by user in VS Code.');
                    });
                })
            });

            let fullResponse = '';
            let citations: any[] = [];
            let firstChunk = true;

            const streamParser = (chunk: Buffer) => {
                const chunkStr = chunk.toString();
                const lines = chunkStr.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data.trim() === '[DONE]') {
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (firstChunk && parsed.citations) {
                                citations = parsed.citations.results;
                                firstChunk = false;
                            }
                            if (parsed.choices && parsed.choices[0].delta.content) {
                                fullResponse += parsed.choices[0].delta.content;
                            }
                        } catch (e) {
                            console.error('Error parsing stream chunk:', e);
                        }
                    }
                }
            };

            for await (const chunk of response.data) {
                streamParser(chunk);
                let citationText = '';
                if (citations.length > 0) {
                    citationText = '\n\n**Sources:**\n';
                    citations.forEach((citation: any, index: number) => {
                        citationText += `${index + 1}. ${citation.document_name}\n`;
                    });
                }
                stream.markdown(fullResponse + citationText);
            }

        } catch (error) {
            console.error(error);
            if (axios.isAxiosError(error)) {
                stream.markdown(`Error fetching response from RAG server: ${error.message}. Is the backend running?`);
            } else {
                stream.markdown('An unknown error occurred while fetching the response.');
            }
        } finally {
            stream.progress(undefined);
        }

        return { metadata: { command: '' } };
    };

    const ragParticipant = vscode.chat.createChatParticipant('copilot-rag', handler);
    ragParticipant.iconPath = new vscode.ThemeIcon('rocket');

    context.subscriptions.push(
        ragParticipant,
        vscode.commands.registerCommand('copilot-rag.startBackend', () => backendManager.startBackend()),
        vscode.commands.registerCommand('copilot-rag.stopBackend', () => backendManager.stopBackend()),
        vscode.commands.registerCommand('copilot-rag.manageBackend', async () => {
            const choice = await vscode.window.showQuickPick([
                { label: 'Start Backend', description: 'Start the RAG backend services.', target: backendManager.startBackend },
                { label: 'Stop Backend', description: 'Stop the RAG backend services.', target: backendManager.stopBackend }
            ], {
                placeHolder: 'Select an action to perform'
            });

            if (choice) {
                choice.target.call(backendManager);
            }
        }),
        vscode.commands.registerCommand('copilot-rag.ingestWorkspace', () => ingestionManager.ingestWorkspace())
    );
}

export function deactivate() {}
