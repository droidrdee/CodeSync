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
exports.monitorPanelChatAsync = monitorPanelChatAsync;
exports.associateFileWithMessageCodeblock = associateFileWithMessageCodeblock;
// TODO: Given recent refactors this as a seperate file feels weird
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const GAIT_FOLDER_NAME = '.gait';
const SCHEMA_VERSION = '1.0';
const stashedState_1 = require("./stashedState");
const posthog_js_1 = __importDefault(require("posthog-js"));
const debug_1 = require("./debug");
function sanitizePanelChats(panelChats) {
    // Regular expression to match the unwanted command strings
    const commandRegex = /\(command:_github\.copilot\.[^)]*\)/g;
    // Deep clone the stashedState to avoid mutating the original object
    const panelChats2 = JSON.parse(JSON.stringify(panelChats));
    // Iterate through each PanelChat
    panelChats2.forEach((panelChat) => {
        // Iterate through each MessageEntry within the PanelChat
        panelChat.messages.forEach((message) => {
            // Remove the unwanted command strings from messageText
            if (typeof message.messageText === 'string') {
                message.messageText = message.messageText.replace(commandRegex, '').trim();
            }
            // Remove the unwanted command strings from responseText
            if (typeof message.responseText === 'string') {
                message.responseText = message.responseText.replace(commandRegex, '').trim();
            }
        });
    });
    return panelChats2;
}
/**
 * Monitors the panel chat and appends new chats to state.json.
 * Note: Since 'lastAppended' has been removed from StashedState, this function has been simplified.
 * You may need to implement a new mechanism for tracking appended messages.
 */
let isAppending = false;
async function monitorPanelChatAsync(stateReader, context) {
    setInterval(async () => {
        if (isAppending) {
            // Skip if a previous append operation is still in progress
            return;
        }
        const oldPanelChats = context.workspaceState.get('currentPanelChats');
        isAppending = true;
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const gaitDir = path.join(workspaceFolder.uri.fsPath, GAIT_FOLDER_NAME);
            // Ensure the .gait directory exists
            if (!fs.existsSync(gaitDir)) {
                fs.mkdirSync(gaitDir, { recursive: true });
                //console.log(`Created directory: ${gaitDir}`);
            }
            // Parse the current panelChats
            const incomingPanelChats = sanitizePanelChats(await stateReader.parsePanelChatAsync());
            // Check for new panel chats or messages
            context.workspaceState.update('panelChatMessageNum', incomingPanelChats.reduce((acc, chat) => acc + chat.messages.length, 0));
            context.workspaceState.update('currentPanelChats', incomingPanelChats);
            const stashedState = (0, stashedState_1.readStashedStateFromFile)();
            context.workspaceState.update('stashedState', stashedState);
            (0, debug_1.debug)("State updated");
        }
        catch (error) {
            (0, debug_1.debug)("Error updating state: " + error);
            console.error(`Error monitoring and saving state:`, error);
            vscode.window.showErrorMessage(`Error monitoring and saving state: ${error instanceof Error ? error.message : 'Unknown error'}`);
            posthog_js_1.default.capture('error_monitoring_and_saving_state', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
        finally {
            isAppending = false;
        }
    }, 4000); // Runs 4 seconds
}
/**
 * Associates a file with a message in the stashed panel chats.
 * @param messageId The ID of the message to associate with the file.
 * @param filePath The path of the file to associate.
 */
async function associateFileWithMessageCodeblock(context, message, filePath, newPanelChat, index_of_code_block) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const messageId = message.id;
    if (!workspaceFolder) {
        throw new Error('No workspace folder found');
    }
    let stashedState = (0, stashedState_1.readStashedState)(context);
    let messageFound = false;
    for (const panelChat of stashedState.panelChats) {
        for (const message of panelChat.messages) {
            if (message.id === messageId) {
                message.kv_store = {
                    ...message.kv_store,
                    file_path_dict: {
                        ...message.kv_store?.file_path_dict,
                        [index_of_code_block]: filePath
                    }
                };
                if (!((message.kv_store?.file_paths || []).includes(filePath))) {
                    message.kv_store = {
                        ...message.kv_store,
                        file_paths: [...(message.kv_store?.file_paths || []), filePath]
                    };
                }
                messageFound = true;
                break;
            }
        }
        if (messageFound) {
            break;
        }
    }
    if (!messageFound) {
        (0, debug_1.debug)("Message association not found in stashed state: new chat into stashed state");
        let truncatedMessage = message.messageText.substring(0, 50);
        if (message.messageText.length > 50) {
            truncatedMessage += '...';
        }
        // Find the message in newPanelChat with the matching messageId
        const targetMessage = newPanelChat.messages.find(message => message.id === messageId);
        if (targetMessage) {
            // Set the kv_store with the file_paths including the new filePath
            targetMessage.kv_store = {
                ...targetMessage.kv_store,
                file_paths: [...(targetMessage.kv_store?.file_paths || []), filePath]
            };
        }
        else {
            throw new Error(`Message with ID ${messageId} not found in the new panel chat.`);
        }
        (0, stashedState_1.writeChatToStashedState)(context, newPanelChat);
        return;
    }
    vscode.window.showInformationMessage(`Associated file with message: ${messageId}`);
    (0, stashedState_1.writeChatToStashedState)(context, newPanelChat);
}
//# sourceMappingURL=panelChats.js.map