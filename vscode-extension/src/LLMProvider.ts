export enum LLMProviderType {
    NVIDIA = 'NVIDIA NIM',
    Ollama = 'Ollama',
    OpenRouter = 'OpenRouter',
    Gemini = 'Gemini',
}

export interface LanguageModel {
    id: string;
    name: string;
}

export interface LanguageModelProvider {
    readonly type: LLMProviderType;
    getModels(): Promise<LanguageModel[]>;
    getEnvironmentVariables(modelId: string): { [key: string]: string };
}
