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
exports.createPanelHover = createPanelHover;
exports.getAfterText = getAfterText;
const vscode = __importStar(require("vscode"));
function getTimeAgo(timestamp) {
    const timeDiffMs = new Date().getTime() - new Date(timestamp).getTime();
    const hoursSinceEdit = Math.floor(timeDiffMs / (1000 * 3600));
    const daysSinceEdit = Math.floor(timeDiffMs / (1000 * 3600 * 24));
    return daysSinceEdit === 0 ? `${hoursSinceEdit} hours ago` : daysSinceEdit === 1 ? 'yesterday' : `${daysSinceEdit} days ago`;
}
/**
 * Creates hover content for a matched panel chat range.
 * @param matchedRange The matched range containing the panel chat and message information.
 * @param document The VSCode text document.
 * @returns A promise that resolves to a VSCode Hover object.
 */
function createPanelHover(context, matchedRange, document, idToCommitInfo) {
    let markdown = new vscode.MarkdownString();
    const { panelChat, message_id } = matchedRange;
    const message = panelChat.messages.find(msg => msg.id === message_id);
    if (!message) {
        return new vscode.MarkdownString();
    }
    let commitInfo = idToCommitInfo?.get(message.id);
    if (commitInfo) {
        commitInfo.panelChats = [];
        commitInfo.inlineChats = [];
    }
    const continueCommand = vscode.Uri.parse(`command:gait.exportPanelChatsToMarkdown?${encodeURIComponent(JSON.stringify({ data: panelChat.id, continue_chat: false, commitInfo: commitInfo }))}`);
    markdown.appendMarkdown(`[Continue Chat](${continueCommand})  |  `);
    const deleteCommand = vscode.Uri.parse(`command:gait.removePanelChat?${encodeURIComponent(JSON.stringify({
        panelChatId: panelChat.id,
    }))}`);
    markdown.appendMarkdown(`[Delete Panel Chat](${deleteCommand})`);
    const viewFullChatCommand = vscode.Uri.parse(`command:gait.showIndividualPanelChat?${encodeURIComponent(JSON.stringify({
        panelChatId: panelChat.id,
    }))}`);
    markdown.appendMarkdown(`  |  [View Full Chat](${viewFullChatCommand}) \n\n`);
    // Find the message that resulted in the matched range
    // Append previous messages in small text
    if (panelChat.messages.length > 1 && message_id !== panelChat.messages[0].id) {
        markdown.appendMarkdown('#### Previous messages:\n\n');
        for (let i = 0; i < panelChat.messages.length; i++) {
            const prevMessage = panelChat.messages[i];
            if (prevMessage.id === message_id) {
                break;
            }
            const prevCommitInfo = idToCommitInfo?.get(prevMessage.id);
            const prevAuthor = prevCommitInfo?.author ?? "You";
            markdown.appendMarkdown(`<small>**${prevAuthor}**: ${prevMessage.messageText.substring(0, 100)}${prevMessage.messageText.length > 100 ? '...' : ''}</small>\n\n`);
        }
        markdown.appendMarkdown('---\n\n');
    }
    const author = commitInfo?.author ?? "You";
    const commitMessage = commitInfo?.commitMessage ?? "Uncommited changes";
    markdown.isTrusted = true;
    // Display the message text and response
    const messageAuthor = commitInfo?.author ?? "You";
    markdown.appendMarkdown(`### ${messageAuthor}: ${message.messageText}\n\n`);
    // Escape backticks and newlines in the response text
    markdown.appendMarkdown(`**Response**: ${message.responseText}\n\n`);
    // Display the context information in small text
    if (message.context && message.context.length > 0) {
        markdown.appendMarkdown(`**Context**: ${message.context[0].value.human_readable}`);
        if (message.context.length > 1) {
            markdown.appendMarkdown(` (and ${message.context.length - 1} more)`);
        }
        markdown.appendMarkdown(`\n\n`);
    }
    markdown.appendMarkdown(`**Commit**: ${commitMessage} by ${author}\n\n`);
    return markdown;
}
function getAfterText(panelChat, messageId, gitHistory) {
    let afterText = '';
    const message = panelChat.messages.find(msg => msg.id === messageId);
    if (!message) {
        return '';
    }
    let author = "You";
    let timeAgo = "";
    if (gitHistory && gitHistory.get(messageId)) {
        const commitData = gitHistory.get(messageId);
        if (commitData) {
            const { date } = commitData;
            timeAgo = getTimeAgo(date.toISOString());
            author = commitData.author;
        }
    }
    afterText += ` ${author}: ${timeAgo} - ${message.messageText.slice(0, 100)}${message.messageText.length > 100 ? '...' : ''}`;
    return afterText.trim();
}
//# sourceMappingURL=panelHover.js.map