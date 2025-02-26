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
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelChatsToMarkdown = panelChatsToMarkdown;
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
function contextToText(context, seenFilenames = new Set()) {
    function readFileOrSeen(uri, seenFilenames) {
        if (seenFilenames.has(uri)) {
            return "File already written above.";
        }
        seenFilenames.add(uri);
        const fileContent = fs.readFileSync(uri, 'utf8');
        return fileContent;
    }
    try {
        const { context_type, value } = context;
        if (context_type === "selection") {
            const { uri, text } = value;
            if (text) {
                return `Selection from ${uri} with text content:\n ${text}`;
            }
            else {
                const fileContent = readFileOrSeen(uri, seenFilenames);
                return `Selection from ${uri} - whole text of file: \n ${fileContent}`;
            }
        }
        if (context_type === "file") {
            const { uri } = value;
            const fileContent = readFileOrSeen(uri, seenFilenames);
            return `${uri}: wole file in context:\n\`\`\`\n${fileContent}\n\`\`\`\n`;
        }
        if (context_type === "folder") {
            const { relativePath } = value;
            function readFolder(path) {
                const dir = fs.opendirSync(path);
                let dirEl = dir.readSync();
                let out = "";
                while (dirEl) {
                    if (dirEl?.isFile()) {
                        out += (`File content of ${dirEl.parentPath}: \n` + readFileOrSeen(dirEl.parentPath, seenFilenames));
                    }
                    if (dirEl.isDirectory()) {
                        out += readFolder(dirEl.parentPath);
                    }
                    dirEl = dir.readSync();
                }
                return out;
            }
            return `Folder relative path - ${relativePath}` + readFolder(relativePath);
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(`Error reading context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return JSON.stringify(context);
}
/**
 * Converts a list of PanelChats and Git history data into a formatted markdown string.
 * @param panelChats - Array of PanelChat objects.
 * @param gitHistory - Git history data.
 * @returns A formatted markdown string.
 */
function panelChatsToMarkdown(panelChats, expand_context = false) {
    //console.log("panelChats: ", panelChats);
    let markdown = `# Panel Chats\n\n`;
    // Create a Set to store seen filenames
    panelChats.forEach(panelChat => {
        markdown += "## Title: " + panelChat.panelChat.customTitle + "\n";
        if (panelChat.commit) {
            markdown += `- **Commit**: ${panelChat.commit.commitHash}\n`;
            markdown += `- **Commit Message**: ${panelChat.commit.commitMessage}\n`;
            markdown += `- **Author**: ${panelChat.commit.author}\n`;
            markdown += `- **Date**: ${panelChat.commit.date}\n`;
        }
        markdown += `- **Created On**: ${panelChat.panelChat.created_on}\n`;
        markdown += `- **Messages**:\n`;
        panelChat.panelChat.messages.forEach(message => {
            markdown += `    - **Model**: ${message.model}\n`;
            markdown += `    - **Context**: ${message.context.map((context) => context.value.human_readable)}\n`;
            markdown += `    - **Text**: ${message.messageText}\n`;
            markdown += `    - **Response**: ${message.responseText}\n`;
            if (expand_context) {
                markdown += ` - **Expanded Context** + ${message.context.map((context) => contextToText(context))}`;
            }
        });
        markdown += `\n`;
    });
    return markdown;
}
//# sourceMappingURL=markdown.js.map