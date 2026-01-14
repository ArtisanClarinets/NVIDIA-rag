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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const BackendManager_1 = require("./BackendManager");
const IngestionManager_1 = require("./IngestionManager");
function activate(context) {
    const backendManager = new BackendManager_1.BackendManager();
    const ingestionManager = new IngestionManager_1.IngestionManager();
    context.subscriptions.push(backendManager, ingestionManager);
    const handler = async (request, _context, stream, token) => {
        if (backendManager.getStatus() !== BackendManager_1.BackendStatus.Running) {
            stream.markdown('The RAG backend is not running. Please start it first.');
            return { metadata: { command: '' } };
        }
        const config = vscode.workspace.getConfiguration('copilot-rag');
        const ragServerUrl = config.get('ragServerUrl');
        if (!ragServerUrl) {
            stream.markdown('RAG server URL is not configured. Please set it in the settings.');
            return { metadata: { command: '' } };
        }
        const prompt = request.prompt;
        stream.progress('Thinking...');
        try {
            const response = await axios_1.default.post(`${ragServerUrl}/generate`, {
                messages: [{ role: 'user', content: prompt }],
                use_knowledge_base: true,
                enable_citations: true
            }, {
                responseType: 'stream',
                timeout: 60000, // 60 seconds timeout
                cancelToken: new axios_1.default.CancelToken(source => {
                    token.onCancellationRequested(() => {
                        source('Request canceled by user in VS Code.');
                    });
                })
            });
            let fullResponse = '';
            let citations = [];
            let firstChunk = true;
            const streamParser = (chunk) => {
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
                        }
                        catch (e) {
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
                    citations.forEach((citation, index) => {
                        citationText += `${index + 1}. ${citation.document_name}\n`;
                    });
                }
                stream.markdown(fullResponse + citationText);
            }
        }
        catch (error) {
            console.error(error);
            if (axios_1.default.isAxiosError(error)) {
                stream.markdown(`Error fetching response from RAG server: ${error.message}. Is the backend running?`);
            }
            else {
                stream.markdown('An unknown error occurred while fetching the response.');
            }
        }
        finally {
            // stream.progress(''); // unnecessary
        }
        return { metadata: { command: '' } };
    };
    const ragParticipant = vscode.chat.createChatParticipant('copilot-rag', handler);
    ragParticipant.iconPath = new vscode.ThemeIcon('rocket');
    context.subscriptions.push(ragParticipant, vscode.commands.registerCommand('copilot-rag.startBackend', () => backendManager.startBackend()), vscode.commands.registerCommand('copilot-rag.stopBackend', () => backendManager.stopBackend()), vscode.commands.registerCommand('copilot-rag.manageBackend', async () => {
        const choice = await vscode.window.showQuickPick([
            { label: 'Start Backend', description: 'Start the RAG backend services.', target: backendManager.startBackend },
            { label: 'Stop Backend', description: 'Stop the RAG backend services.', target: backendManager.stopBackend }
        ], {
            placeHolder: 'Select an action to perform'
        });
        if (choice) {
            choice.target.call(backendManager);
        }
    }), vscode.commands.registerCommand('copilot-rag.ingestWorkspace', () => ingestionManager.ingestWorkspace()));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map