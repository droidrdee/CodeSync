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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeReader = void 0;
const vscode = __importStar(require("vscode"));
const Inline = __importStar(require("../inline"));
const dbReader_1 = require("../tools/dbReader");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const posthog_js_1 = __importDefault(require("posthog-js"));
function fnv1aHash(str) {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0; // FNV prime and keep it 32-bit unsigned
    }
    return hash;
}
/**
 * Validates if the object is a valid InteractiveSession.
 */
function isValidInteractiveSession(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.history &&
        Array.isArray(obj.history.editor) &&
        obj.history.editor.every((entry) => typeof entry.text === 'string' &&
            entry.state &&
            Array.isArray(entry.state.chatContextAttachments) &&
            Array.isArray(entry.state.chatDynamicVariableModel)));
}
/**
 * Retrieves a single new editor text from the sessions.
 */
function getSingleNewEditorText(oldSessions, newSessions) {
    let oldEditorTexts;
    if (!oldSessions.history.editor) {
        oldEditorTexts = new Set();
    }
    else {
        oldEditorTexts = new Set(oldSessions.history.editor.map(entry => entry.text));
    }
    if (!newSessions.history.editor) {
        return [];
    }
    const newEditorTexts = newSessions.history.editor.map(entry => entry.text).filter(text => !oldEditorTexts.has(text));
    return newEditorTexts;
}
function getDBPath(context) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !context.storageUri) {
        throw new Error('No workspace folder or storage URI found');
    }
    const dbPath = path_1.default.join(path_1.default.dirname(context.storageUri.fsPath), 'state.vscdb');
    return dbPath;
}
class VSCodeReader {
    context;
    interactiveSessions = null;
    inlineStartInfo = null;
    timedFileDiffs = [];
    pushFileDiffs(file_diffs, metadata) {
        this.timedFileDiffs.push({
            timestamp: new Date().toISOString(),
            file_diffs: file_diffs,
            metadata: metadata
        });
    }
    async matchPromptsToDiff() {
        if (this.interactiveSessions === null) {
            const inlineChats = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'memento/interactive-session');
            this.interactiveSessions = inlineChats;
            return false;
        }
        const oldInlineChats = this.interactiveSessions;
        const newInlineChats = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'memento/interactive-session');
        this.interactiveSessions = newInlineChats;
        const newChats = getSingleNewEditorText(oldInlineChats, newInlineChats);
        if (newChats.length === 0) {
            const oneMinuteAgo = new Date(Date.now() - 15000).toISOString();
            while (this.timedFileDiffs.length > 0 && this.timedFileDiffs[0].timestamp < oneMinuteAgo) {
                this.timedFileDiffs.shift();
            }
            return false;
        }
        const context = this.context;
        let added = false;
        for (const newChat of newChats) {
            let matchedDiff;
            for (const diff of this.timedFileDiffs) {
                if (diff.metadata.inlineChatStartInfo) {
                    matchedDiff = diff;
                    this.timedFileDiffs.splice(this.timedFileDiffs.indexOf(diff), 1);
                    break;
                }
            }
            if (!matchedDiff) {
                matchedDiff = this.timedFileDiffs.pop();
            }
            if (!matchedDiff) {
                console.error("error no file diffs");
                vscode.window.showErrorMessage('No file diffs found for new prompts!');
                posthog_js_1.default.capture('vscode_error_no_file_diffs_found_for_new_prompts');
                return false;
            }
            const inlineChatInfoObj = {
                inline_chat_id: (0, uuid_1.v4)(),
                file_diff: matchedDiff.file_diffs,
                selection: null,
                timestamp: new Date().toISOString(),
                prompt: newChat,
                parent_inline_chat_id: null,
            };
            Inline.writeInlineChat(context, inlineChatInfoObj);
            posthog_js_1.default.capture('vscode_inline_chat');
            added = true;
            vscode.window.showInformationMessage(`Recorded Inline Request - ${newChat}`);
        }
        return added;
    }
    constructor(context) {
        this.context = context;
    }
    /**
     * Initializes the extension by reading interactive sessions.
     */
    async startInline(inlineStartInfo) {
        const interactiveSessions = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'memento/interactive-session');
        this.interactiveSessions = interactiveSessions;
        this.inlineStartInfo = inlineStartInfo;
    }
    parseContext(request) {
        let context = [];
        if (request.contentReferences && Array.isArray(request.contentReferences)) {
            request.contentReferences.forEach((ref) => {
                if (ref.kind === 'reference' && ref.reference) {
                    const { range, uri } = ref.reference;
                    if (range && uri) {
                        context.push({
                            context_type: "selection",
                            key: (0, uuid_1.v4)(),
                            value: {
                                human_readable: uri.fsPath || '',
                                uri: uri.fsPath || '',
                                range: {
                                    startLine: range.startLineNumber || 0,
                                    startColumn: range.startColumn || 0,
                                    endLine: range.endLineNumber || 0,
                                    endColumn: range.endColumn || 0
                                },
                                text: '' // Note: We don't have the actual text content here
                            }
                        });
                    }
                }
            });
        }
        return context;
    }
    /**
     * Parses the panel chat from interactive sessions and assigns UUIDs based on existing order.
     */
    async parsePanelChatAsync() {
        try {
            const interactiveSessions = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'interactive.sessions');
            if (!interactiveSessions) {
                return [];
            }
            if (!Array.isArray(interactiveSessions)) {
                vscode.window.showErrorMessage('Interactive sessions data is not an array.');
                return [];
            }
            const panelChats = interactiveSessions.map((panel, index) => {
                const ai_editor = "copilot";
                const customTitle = typeof panel.customTitle === 'string' ? panel.customTitle : '';
                // Determine if this PanelChat has an existing UUID
                let id = panel.sessionId;
                const parent_id = null;
                const created_on = typeof panel.creationDate === 'string' ? panel.creationDate : new Date().toISOString();
                // Extract messages
                const messages = panel.requests.map((request) => {
                    const messageText = typeof request.message?.text === 'string' ? request.message.text : '';
                    // Safely extract responseText
                    let responseText = '';
                    if (Array.isArray(request.response)) {
                        // Concatenate all response values into a single string, separated by newlines
                        const validResponses = request.response
                            .map((response) => response.value)
                            .filter((value) => typeof value === 'string' && value.trim() !== '');
                        responseText = validResponses.join('\n');
                    }
                    else if (typeof request.response?.value === 'string') {
                        responseText = request.response.value;
                    }
                    // Extract model and timestamp if available
                    const model = typeof request.model === 'string' ? request.model : 'Unknown';
                    const timestamp = typeof request.timestamp === 'string' ? request.timestamp : new Date().toISOString();
                    // Extract context if available
                    let contextData = this.parseContext(request);
                    let id = '';
                    if (request.result && request.result.metadata && typeof request.result.metadata.modelMessageId === 'string') {
                        id = request.result.metadata.modelMessageId;
                    }
                    else {
                        id = fnv1aHash(messageText + responseText).toString();
                    }
                    return {
                        id,
                        messageText,
                        responseText,
                        model,
                        timestamp,
                        context: contextData,
                    };
                }).filter((entry) => entry.messageText.trim() !== '' && entry.responseText.trim() !== '');
                return {
                    ai_editor,
                    customTitle,
                    id,
                    parent_id,
                    created_on,
                    messages
                };
            });
            return panelChats;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to parse panel chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
}
exports.VSCodeReader = VSCodeReader;
//# sourceMappingURL=vscodeReader.js.map