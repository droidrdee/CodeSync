"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeInlineChatInfo = removeInlineChatInfo;
exports.addInlineChatInfo = addInlineChatInfo;
exports.writeInlineChat = writeInlineChat;
exports.removeInlineChat = removeInlineChat;
exports.isInlineStartInfo = isInlineStartInfo;
exports.InlineStartToInlineChatInfo = InlineStartToInlineChatInfo;
exports.isInlineChatInfo = isInlineChatInfo;
const uuid_1 = require("uuid");
const diff_1 = require("diff");
const stashedState_1 = require("./stashedState");
function removeInlineChatInfo(inline_chat_id, stashedState) {
    stashedState.inlineChats = stashedState.inlineChats.filter((inlineChat) => inlineChat.inline_chat_id !== inline_chat_id);
    return stashedState;
}
function addInlineChatInfo(inlineChatInfo, stashedState) {
    stashedState.inlineChats.push(inlineChatInfo);
    return stashedState;
}
function writeInlineChat(context, inlineChatInfo) {
    const stashedState = (0, stashedState_1.readStashedState)(context);
    const updatedFileChats = addInlineChatInfo(inlineChatInfo, stashedState);
    (0, stashedState_1.writeStashedState)(context, updatedFileChats);
}
function removeInlineChat(context, inline_chat_id) {
    const stashedState = (0, stashedState_1.readStashedState)(context);
    const updatedFileChats = removeInlineChatInfo(inline_chat_id, stashedState);
    (0, stashedState_1.writeStashedState)(context, updatedFileChats);
}
function isInlineStartInfo(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'fileName' in obj &&
        'content' in obj &&
        'lineCount' in obj &&
        'startTimestamp' in obj &&
        'startSelection' in obj &&
        'endSelection' in obj &&
        'selectionContent' in obj &&
        'parent_inline_chat_id' in obj &&
        typeof obj.fileName === 'string' &&
        typeof obj.content === 'string' &&
        typeof obj.lineCount === 'number' &&
        typeof obj.startTimestamp === 'string' &&
        typeof obj.startSelection === 'object' &&
        typeof obj.endSelection === 'object' &&
        typeof obj.selectionContent === 'string');
}
function InlineStartToInlineChatInfo(inlineStartInfo, after_content, prompt) {
    return {
        inline_chat_id: (0, uuid_1.v4)(),
        file_diff: [{
                file_path: inlineStartInfo.fileName,
                diffs: (0, diff_1.diffLines)(inlineStartInfo.content, after_content)
            }],
        selection: {
            file_path: inlineStartInfo.fileName,
            startSelection: inlineStartInfo.startSelection,
            endSelection: inlineStartInfo.endSelection,
            selectionContent: inlineStartInfo.selectionContent
        },
        timestamp: new Date().toISOString(),
        prompt: prompt,
        parent_inline_chat_id: inlineStartInfo.parent_inline_chat_id
    };
}
function isVscodePosition(obj) {
    return (obj !== null &&
        typeof obj === 'object' &&
        typeof obj.line === 'number' &&
        typeof obj.character === 'number');
}
// Type Guard for vscode.Range
function isVscodeRange(obj) {
    return (obj !== null &&
        typeof obj === 'object' &&
        isVscodePosition(obj.start) &&
        isVscodePosition(obj.end));
}
// Type Guard for Diff.Change
function isDiffChange(obj) {
    return (obj !== null &&
        typeof obj === 'object' &&
        typeof obj.value === 'string' &&
        (typeof obj.added === 'undefined' || typeof obj.added === 'boolean') &&
        (typeof obj.removed === 'undefined' || typeof obj.removed === 'boolean'));
}
// Type Guard for FileDiff
function isFileDiff(obj) {
    return (obj !== null &&
        typeof obj === 'object' &&
        typeof obj.file_path === 'string' &&
        Array.isArray(obj.diffs) &&
        obj.diffs.every(isDiffChange));
}
// Type Guard for Selection
function isSelection(obj) {
    return (obj === null ||
        (obj !== null &&
            typeof obj === 'object' &&
            typeof obj.file_path === 'string' &&
            isVscodePosition(obj.startSelection) &&
            isVscodePosition(obj.endSelection) &&
            typeof obj.selectionContent === 'string'));
}
function isInlineChatInfo(obj) {
    return (obj !== null &&
        typeof obj === 'object' &&
        // Validate inline_chat_id
        typeof obj.inline_chat_id === 'string' &&
        // Validate file_diff
        Array.isArray(obj.file_diff) &&
        obj.file_diff.every(isFileDiff) &&
        // Validate selection
        isSelection(obj.selection) &&
        // Validate timestamp
        typeof obj.timestamp === 'string' &&
        // Validate prompt
        typeof obj.prompt === 'string' &&
        // Validate parent_inline_chat_id
        (typeof obj.parent_inline_chat_id === 'string' || obj.parent_inline_chat_id === null));
}
//# sourceMappingURL=inline.js.map