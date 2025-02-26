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
exports.createHoverContent = createHoverContent;
exports.createHover = createHover;
exports.getAfterText = getAfterText;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const stashedState_1 = require("./stashedState");
function getTimeAgo(timestamp) {
    const timeDiffMs = new Date().getTime() - new Date(timestamp).getTime();
    const hoursSinceEdit = Math.floor(timeDiffMs / (1000 * 3600));
    const daysSinceEdit = Math.floor(timeDiffMs / (1000 * 3600 * 24));
    return daysSinceEdit === 0 ? `${hoursSinceEdit} hours ago` : daysSinceEdit === 1 ? 'yesterday' : `${daysSinceEdit} days ago`;
}
function createHoverContent(context, markdown, inlineChat, document, matchedRange = null, idToCommitInfo) {
    const { prompt, timestamp, parent_inline_chat_id } = inlineChat;
    // Find the diff that matches the current document's file path
    const documentPath = (0, utils_1.getRelativePath)(document);
    const matchingDiff = inlineChat.file_diff.find(diff => path.normalize(diff.file_path) === path.normalize(documentPath));
    // Set diffs to the matching diff's diffs, or an empty array if no match found
    const diffs = matchingDiff ? matchingDiff.diffs : [];
    // Log an error if no matching diff is found
    if (!matchingDiff) {
        console.error(`No matching diff found for document path: ${documentPath}`);
        throw new Error(`No matching diff found for document path: ${documentPath}`);
    }
    const commitInfo = idToCommitInfo?.get(inlineChat.inline_chat_id);
    const author = commitInfo?.author ?? "You";
    const commitMessage = commitInfo?.commitMessage;
    const commitHash = commitInfo?.commitHash ?? "uncommitted chat";
    //markdown.supportHtml = true; // Allows HTML in the Markdown
    markdown.isTrusted = true; // Allows advanced Markdown features
    // Add action buttons at the end of the hover content
    const deleteCommand = vscode.Uri.parse(`command:gait.removeInlineChat?${encodeURIComponent(JSON.stringify({
        filePath: vscode.workspace.asRelativePath(document.uri),
        inline_chat_id: inlineChat.inline_chat_id
    }))}`);
    markdown.appendMarkdown(`[Delete Inline Chat ](${deleteCommand})`);
    markdown.appendMarkdown(`\n\n`);
    const timeAgo = getTimeAgo(timestamp);
    markdown.appendMarkdown(`### ${author ?? "You"}: ${prompt} (${new Date(timestamp).toISOString().split('T')[0]}) (${timeAgo}) \n\n---\n`);
    markdown.appendMarkdown(`**Commit**: ${commitMessage} (${commitHash}) \n\n---\n`);
    // Flatten the diffs into individual lines
    let lineBasedDiffs = [];
    diffs.forEach(diff => {
        const diffLines = diff.value.split('\n');
        diffLines.forEach(line => {
            lineBasedDiffs.push({
                value: line,
                added: diff.added,
                removed: diff.removed
            });
        });
    });
    // Find all lines that match `matchedLines`
    let surroundingLines = lineBasedDiffs.filter(diff => diff.added || diff.removed);
    // Ensure that there are lines to display
    if (surroundingLines.length > 0) {
        const diffText = surroundingLines.map(change => {
            if (change.added) {
                return `+ ${change.value}`;
            }
            if (change.removed) {
                return `- ${change.value}`;
            }
            return `  ${change.value}`;
        }).join('\n');
        markdown.appendCodeblock('\n' + diffText, 'diff');
    }
    if (parent_inline_chat_id) {
        // Load the parent inline chat
        const parentInlineChat = (0, stashedState_1.getInlineParent)(context, parent_inline_chat_id);
        if (!parentInlineChat) {
            console.error(`Parent inline chat not found for ID: ${parent_inline_chat_id}`);
        }
        else {
            markdown.appendMarkdown('\n\n---\n\n**Parent Chat:**\n\n');
            createHoverContent(context, markdown, parentInlineChat, document, null, idToCommitInfo);
        }
    }
    if (inlineChat.userComment) {
        markdown.appendMarkdown(`\n\n**User Comment:** ${inlineChat.userComment}\n\n---\n`);
    }
    const addCommentCommand = vscode.Uri.parse(`command:gait.addUserComment?${encodeURIComponent(JSON.stringify({
        inline_chat_id: inlineChat.inline_chat_id
    }))}`);
    markdown.appendMarkdown(`[Add/Edit Comment](${addCommentCommand})`);
    markdown.appendMarkdown(`\n\n`);
    return markdown;
}
function createHover(context, matchedRange, document, idToCommitInfo) {
    let markdown = new vscode.MarkdownString();
    markdown = createHoverContent(context, markdown, matchedRange.inlineChat, document, matchedRange, idToCommitInfo);
    return markdown;
}
function getAfterText(inlineChat, gitHistory) {
    let afterText = '';
    if (inlineChat.prompt) {
        afterText += `"${inlineChat.prompt.slice(0, 100)}${inlineChat.prompt.length > 100 ? '...' : ''}"`;
    }
    if (gitHistory && gitHistory.get(inlineChat.inline_chat_id)) {
        const commitData = gitHistory.get(inlineChat.inline_chat_id);
        if (commitData) {
            const { author, date } = commitData;
            const timeAgo = getTimeAgo(date.toISOString());
            afterText += ` - ${author}: ${timeAgo} - ${inlineChat.prompt.slice(0, 100)}${inlineChat.prompt.length > 100 ? '...' : ''}`;
        }
    }
    return afterText.trim();
}
//# sourceMappingURL=inlinehover.js.map