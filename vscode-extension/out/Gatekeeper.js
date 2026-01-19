"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultGatekeeper = void 0;
/**
 * A default implementation of the Gatekeeper interface that simply passes the response through.
 */
class DefaultGatekeeper {
    async processResponse(response) {
        return response;
    }
}
exports.DefaultGatekeeper = DefaultGatekeeper;
//# sourceMappingURL=Gatekeeper.js.map