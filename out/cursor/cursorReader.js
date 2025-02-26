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
exports.CursorReader = void 0;
const vscode = __importStar(require("vscode"));
const Inline = __importStar(require("../inline"));
const dbReader_1 = require("../tools/dbReader");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const posthog_js_1 = __importDefault(require("posthog-js"));
const debug_1 = require("../debug");
const SCHEMA_VERSION = '1.0';
/**
 * Retrieves a single new editor text from the sessions.
 */
function getSingleNewEditorText(oldSessions, newSessions) {
    const list1Count = {};
    const newElements = [];
    function inlineToKey(item) {
        return item.text + item.commandType;
    }
    // Count occurrences of each string in list1
    oldSessions.forEach((item) => {
        list1Count[inlineToKey(item)] = (list1Count[inlineToKey(item)] || 0) + 1;
    });
    // Compare each string in list2 with list1
    newSessions.forEach((item) => {
        if (list1Count[inlineToKey(item)]) {
            list1Count[inlineToKey(item)]--;
        }
        else {
            newElements.push(item);
        }
    });
    return newElements;
}
function getDBPath(context) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !context.storageUri) {
        throw new Error('No workspace folder or storage URI found');
    }
    const dbPath = path_1.default.join(path_1.default.dirname(context.storageUri.fsPath), 'state.vscdb');
    return dbPath;
}
class CursorReader {
    context;
    inlineChats = null;
    inlineStartInfo = null;
    timedFileDiffs = [];
    fileDiffCutoff = 60000;
    hasComposerData = false;
    constructor(context) {
        this.context = context;
        this.initialize(); // Call the async initializer
    }
    async initialize() {
        try {
            const composerData = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'composer.composerData');
            if (composerData) {
                this.hasComposerData = true;
            }
        }
        catch (error) {
            // If the key doesn't exist, keep hasComposerData as false
            this.hasComposerData = false;
        }
    }
    pushFileDiffs(file_diffs, metadata) {
        this.timedFileDiffs.push({
            timestamp: new Date().toISOString(),
            file_diffs: file_diffs,
            metadata: metadata
        });
    }
    async matchPromptsToDiff() {
        if (this.inlineChats === null) {
            const inlineChats = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'aiService.prompts');
            this.inlineChats = inlineChats.filter((chat) => chat.commandType === 1 || (!this.hasComposerData && chat.commandType === 4));
            return false;
        }
        const oldInlineChats = this.inlineChats;
        const newInlineChats = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'aiService.prompts') || oldInlineChats;
        const newChats = getSingleNewEditorText(oldInlineChats, newInlineChats.filter((chat) => this.hasComposerData ? chat.commandType === 1 : (chat.commandType === 1 || chat.commandType === 4)));
        this.inlineChats = newInlineChats.filter((chat) => this.hasComposerData ? chat.commandType === 1 : (chat.commandType === 1 || chat.commandType === 4));
        if (newChats.length === 0) {
            const oneMinuteAgo = new Date(Date.now() - this.fileDiffCutoff).toISOString();
            while (this.timedFileDiffs.length > 0 && this.timedFileDiffs[0].timestamp < oneMinuteAgo) {
                this.timedFileDiffs.shift();
            }
            return false;
        }
        let added = false;
        for (const newChat of newChats) {
            let matchedDiff;
            if (newChat.commandType === 1) {
                for (const diff of this.timedFileDiffs) {
                    if (diff.metadata.inlineChatStartInfo) {
                        matchedDiff = diff;
                        this.timedFileDiffs.splice(this.timedFileDiffs.indexOf(diff), 1);
                        break;
                    }
                }
            }
            if (!matchedDiff) {
                matchedDiff = this.timedFileDiffs.pop();
            }
            if (!matchedDiff) {
                this.fileDiffCutoff = Math.min(this.fileDiffCutoff + 10000, 60000);
                return false;
            }
            const inlineChatInfoObj = {
                inline_chat_id: (0, uuid_1.v4)(),
                file_diff: matchedDiff.file_diffs,
                selection: null,
                timestamp: new Date().toISOString(),
                prompt: newChat.text,
                parent_inline_chat_id: null,
            };
            Inline.writeInlineChat(this.context, inlineChatInfoObj);
            added = true;
            if (newChat.commandType === 1) {
                vscode.window.showInformationMessage(`Recorded Inline Chat - ${newChat.text}`);
                posthog_js_1.default.capture('cursor_inline_chat');
            }
            else if (newChat.commandType === 4) {
                vscode.window.showInformationMessage(`Recorded Composer Chat - ${newChat.text}`);
                posthog_js_1.default.capture('cursor_composer_chat');
            }
        }
        return added;
    }
    /**
     * Initializes the extension by reading interactive sessions.
     */
    async startInline(inlineStartInfo) {
        const inlineChats = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'aiService.prompts');
        this.inlineChats = inlineChats.filter((chat) => chat.commandType === 1 || (!this.hasComposerData && chat.commandType === 4));
        this.inlineStartInfo = inlineStartInfo;
    }
    parseContext(userMessage) {
        let context = [];
        if (!userMessage) {
            return context;
        }
        // Parse and add selections to panelChat.context if available
        if (userMessage.selections && Array.isArray(userMessage.selections)) {
            userMessage.selections.forEach((selection) => (context.push({
                context_type: "selection",
                key: (0, uuid_1.v4)(),
                value: {
                    human_readable: selection.uri?.fsPath || '',
                    uri: selection.uri?.fsPath || '',
                    range: {
                        startLine: selection.range?.selectionStartLineNumber || 0,
                        startColumn: selection.range?.selectionStartColumn || 0,
                        endLine: selection.range?.positionLineNumber || 0,
                        endColumn: selection.range?.positionColumn || 0
                    },
                    text: selection.rawText || ''
                }
            })));
        }
        // Parse and add file selections to context if available
        if (userMessage.fileSelections && Array.isArray(userMessage.fileSelections)) {
            userMessage.fileSelections.forEach((fileSelection) => {
                if (fileSelection.uri) {
                    context.push({
                        context_type: "file",
                        key: (0, uuid_1.v4)(),
                        value: {
                            human_readable: fileSelection.uri.fsPath || '',
                            uri: fileSelection.uri.fsPath || '',
                            isCurrentFile: fileSelection.isCurrentFile || false,
                        }
                    });
                }
            });
        }
        // Parse and add folder selections to context if available
        if (userMessage.folderSelections && Array.isArray(userMessage.folderSelections)) {
            userMessage.folderSelections.forEach((folderSelection) => {
                if (folderSelection.relativePath) {
                    context.push({
                        context_type: "folder",
                        key: (0, uuid_1.v4)(),
                        value: {
                            human_readable: folderSelection.relativePath,
                            relativePath: folderSelection.relativePath,
                        }
                    });
                }
            });
        }
        // Parse and add selected docs to context if available
        if (userMessage.selectedDocs && Array.isArray(userMessage.selectedDocs)) {
            userMessage.selectedDocs.forEach((doc) => {
                if (doc.docId) {
                    context.push({
                        context_type: "selected_doc",
                        key: (0, uuid_1.v4)(),
                        value: {
                            human_readable: doc.name || '',
                            docId: doc.docId,
                            name: doc.name || '',
                            url: doc.url || '',
                        }
                    });
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
            const raw_data = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'workbench.panel.aichat.view.aichat.chatdata');
            if (!raw_data) {
                (0, debug_1.debug)("No cursor raw data found");
                return [];
            }
            (0, debug_1.debug)("Cursor raw data found");
            if (!Array.isArray(raw_data.tabs)) {
                vscode.window.showErrorMessage('Invalid internal chat data structure.');
                posthog_js_1.default.capture('invalid_internal_chat_data_structure');
                return [];
            }
            let panelChats = [];
            raw_data.tabs.forEach((tab) => {
                if (tab.bubbles.length >= 2) {
                    const panelChat = {
                        ai_editor: "cursor",
                        customTitle: tab.chatTitle || '',
                        id: tab.tabId,
                        parent_id: null,
                        created_on: new Date(tab.lastSendTime).toISOString(),
                        messages: [],
                        kv_store: {}
                    };
                    // Group bubbles into pairs (user message and AI response)
                    for (let i = 0; i < tab.bubbles.length; i += 2) {
                        const userBubble = tab.bubbles[i];
                        const aiBubble = tab.bubbles[i + 1];
                        if (userBubble && userBubble.type === 'user' && aiBubble && aiBubble.type === 'ai') {
                            const messageEntry = {
                                id: userBubble.id,
                                messageText: userBubble.text || '',
                                responseText: aiBubble.text || '',
                                model: aiBubble.modelType || 'Unknown',
                                timestamp: new Date(tab.lastSendTime).toISOString(),
                                context: this.parseContext(userBubble), // Extract context if needed,
                                kv_store: {}
                            };
                            panelChat.messages.push(messageEntry);
                        }
                    }
                    panelChats.push(panelChat);
                }
            });
            // Filter out empty panelChats
            const nonEmptyPanelChats = panelChats.filter((chat) => chat.messages.length > 0);
            // Process composer chats if composerData exists
            if (this.hasComposerData) {
                const composerData = await (0, dbReader_1.readVSCodeState)(getDBPath(this.context), 'composer.composerData');
                (0, debug_1.debug)("Composer data found");
                if (composerData && Array.isArray(composerData.allComposers)) {
                    composerData.allComposers.forEach((composer) => {
                        const created_on = new Date(parseInt(composer.createdAt)).toISOString();
                        const panelChat = {
                            ai_editor: "cursor-composer",
                            customTitle: composer.composerId || '',
                            id: composer.composerId,
                            parent_id: null,
                            created_on: created_on,
                            messages: [],
                            kv_store: { "isComposer": true }
                        };
                        // Pair conversations sequentially: user message (type=1) followed by AI response (type=2)
                        for (let i = 0; i < composer.conversation.length - 1;) {
                            const conv = composer.conversation[i];
                            const nextConv = composer.conversation[i + 1];
                            if (conv.type === 1 && nextConv.type === 2) {
                                const messageEntry = {
                                    id: conv.bubbleId, // Using userConv.bubbleId for the message ID
                                    messageText: conv.text || '',
                                    responseText: nextConv.text || '',
                                    model: nextConv.modelType || 'Unknown',
                                    timestamp: (conv.timestamp ? new Date(conv.timestamp).toISOString() : created_on),
                                    context: this.parseContext(conv.context),
                                    kv_store: {}
                                };
                                panelChat.messages.push(messageEntry);
                                i += 2; // Move to the next pair
                            }
                            else {
                                // If the current pair doesn't match, move to the next conversation
                                i += 1;
                            }
                        }
                        if (panelChat.messages.length > 0) {
                            panelChat.customTitle = panelChat.messages[0].messageText;
                            nonEmptyPanelChats.push(panelChat);
                        }
                    });
                }
            }
            return nonEmptyPanelChats;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to parse panel chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
}
exports.CursorReader = CursorReader;
//# sourceMappingURL=cursorReader.js.map