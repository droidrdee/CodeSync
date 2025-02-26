"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stashedStateFilePath = stashedStateFilePath;
exports.readStashedState = readStashedState;
exports.readStashedStateFromFile = readStashedStateFromFile;
exports.writeStashedState = writeStashedState;
exports.writeChatToStashedState = writeChatToStashedState;
exports.removeMessageFromStashedState = removeMessageFromStashedState;
exports.removePanelChatFromStashedState = removePanelChatFromStashedState;
exports.writeStashedStateToFile = writeStashedStateToFile;
exports.getInlineParent = getInlineParent;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const types_1 = require("./types");
const vscode_1 = __importDefault(require("vscode"));
const constants_1 = require("./constants");
/**
 * Returns the file path for the stashed state.
 */
function stashedStateFilePath() {
    const workspaceFolder = vscode_1.default.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder found.');
    }
    const repoPath = workspaceFolder.uri.fsPath;
    return path_1.default.join(repoPath, `.gait/${constants_1.STASHED_GAIT_STATE_FILE_NAME}`);
}
function readStashedState(context) {
    const stashedState = context.workspaceState.get('stashedState');
    if (!stashedState) {
        return {
            panelChats: [],
            inlineChats: [],
            schemaVersion: "1.0",
            deletedChats: {
                deletedMessageIDs: [],
                deletedPanelChatIDs: []
            },
            kv_store: {}
        };
    }
    return stashedState;
}
/**
 * Reads the stashed state from the file.
 */
function readStashedStateFromFile() {
    const filePath = stashedStateFilePath();
    try {
        if (!fs_1.default.existsSync(filePath)) {
            const emptyStashedState = {
                panelChats: [],
                inlineChats: [],
                schemaVersion: "1.0",
                deletedChats: {
                    deletedMessageIDs: [],
                    deletedPanelChatIDs: []
                },
                kv_store: {}
            };
            writeStashedStateToFile(emptyStashedState);
        }
        // Read the file content as a string
        const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
        const stashedState = JSON.parse(fileContent);
        if (!(0, types_1.isStashedState)(stashedState)) {
            throw new Error('Invalid stashed state');
        }
        return stashedState;
    }
    catch (error) {
        vscode_1.default.window.showErrorMessage(`Error reading stashed state: ${error.message}`);
        throw new Error('Error reading stashed state');
    }
}
function writeStashedState(context, stashedState) {
    context.workspaceState.update('stashedState', stashedState);
    writeStashedStateToFile(stashedState);
    return;
}
function writeChatToStashedState(context, newChat) {
    const currentState = readStashedState(context);
    const existingChatIndex = currentState.panelChats.findIndex((chat) => chat.id === newChat.id);
    if (existingChatIndex !== -1) {
        const existingChat = currentState.panelChats[existingChatIndex];
        const newMessages = newChat.messages.filter((message) => !existingChat.messages.some((existingMessage) => existingMessage.id === message.id));
        existingChat.messages.push(...newMessages);
        currentState.panelChats[existingChatIndex] = existingChat;
    }
    else {
        currentState.panelChats.push(newChat);
    }
    writeStashedState(context, currentState);
}
function removeMessageFromStashedState(context, message_id) {
    const currentState = readStashedState(context);
    const chatIndex = currentState.panelChats.findIndex((chat) => chat.messages.some((message) => message.id === message_id));
    if (chatIndex === -1) {
        return;
    }
    const chat = currentState.panelChats[chatIndex];
    chat.messages = chat.messages.filter((message) => message.id !== message_id);
    currentState.panelChats[chatIndex] = chat;
    writeStashedState(context, currentState);
}
function removePanelChatFromStashedState(context, panel_chat_id) {
    const currentState = readStashedState(context);
    currentState.panelChats = currentState.panelChats.filter((chat) => chat.id !== panel_chat_id);
    writeStashedState(context, currentState);
}
/**
 * Writes the stashed state to the file.
 */
function writeStashedStateToFile(stashedState) {
    const filePath = stashedStateFilePath();
    try {
        // Convert the stashed state to a JSON string with indentation
        const jsonString = JSON.stringify(stashedState, null, 2);
        // Write the JSON string to the file
        fs_1.default.writeFileSync(filePath, jsonString, 'utf-8');
    }
    catch (error) {
        vscode_1.default.window.showErrorMessage(`Error writing stashed state: ${error.message}`);
        throw new Error('Error writing stashed state');
    }
}
function getInlineParent(context, id) {
    const stashedState = readStashedState(context);
    const parent = stashedState.inlineChats.find((parent) => parent.inline_chat_id === id);
    if (!parent) {
        return undefined;
    }
    return parent;
}
//# sourceMappingURL=stashedState.js.map