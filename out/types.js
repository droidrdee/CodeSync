"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessageEntry = isMessageEntry;
exports.isPanelChat = isPanelChat;
exports.isStashedState = isStashedState;
exports.isDeletedChats = isDeletedChats;
const inline_1 = require("./inline");
function isContext(obj) {
    return (typeof obj.context_type === 'string' &&
        typeof obj.key === 'string');
}
function isMessageEntry(obj) {
    return (typeof obj.id === 'string' &&
        typeof obj.messageText === 'string' &&
        typeof obj.responseText === 'string' &&
        typeof obj.model === 'string' &&
        typeof obj.timestamp === 'string' &&
        Array.isArray(obj.context) && obj.context.every(isContext));
}
function isPanelChat(obj) {
    return (typeof obj.ai_editor === 'string' &&
        typeof obj.id === 'string' &&
        (typeof obj.parent_id === 'string' || obj.parent_id === null) &&
        typeof obj.created_on === 'string' &&
        Array.isArray(obj.messages) && obj.messages.every(isMessageEntry));
}
function isStashedState(obj) {
    return (Array.isArray(obj.panelChats) && obj.panelChats.every(isPanelChat) &&
        typeof obj.schemaVersion === 'string' && Array.isArray(obj.inlineChats) && obj.inlineChats.every(inline_1.isInlineChatInfo)
        && isDeletedChats(obj.deletedChats) && typeof obj.kv_store === 'object');
}
function isDeletedChats(obj) {
    return (obj &&
        Array.isArray(obj.deletedMessageIDs) &&
        obj.deletedMessageIDs.every((id) => typeof id === 'string') &&
        Array.isArray(obj.deletedPanelChatIDs) &&
        obj.deletedPanelChatIDs.every((id) => typeof id === 'string'));
}
//# sourceMappingURL=types.js.map