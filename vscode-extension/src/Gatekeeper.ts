/**
 * Defines the interface for a Gatekeeper, which can be used to process
 * and validate the response from the RAG server before it is sent to the user.
 */
export interface Gatekeeper {
    /**
     * Processes the response from the RAG server.
     *
     * @param response The response content from the RAG server.
     * @returns A promise that resolves to the processed response string,
     *          or `null` if the response should be blocked.
     */
    processResponse(response: string): Promise<string | null>;
}

/**
 * A default implementation of the Gatekeeper interface that simply passes the response through.
 */
export class DefaultGatekeeper implements Gatekeeper {
    public async processResponse(response: string): Promise<string | null> {
        return response;
    }
}
