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
exports.activateGaitParticipant = activateGaitParticipant;
const vscode = __importStar(require("vscode"));
const GAIT_PARTICIPANT_ID = 'gait-participant.gait';
function activateGaitParticipant(context, additional_context) {
    const handler = async (request, context, stream, token) => {
        try {
            const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
            if (model) {
                const messages = [
                    vscode.LanguageModelChatMessage.User("You are an LLM tasked with providing insights and making edits to code - here are past conversations for context, and the pieces in the code base that they correspond to: " + additional_context),
                    vscode.LanguageModelChatMessage.User(request.prompt)
                ];
                const chatResponse = await model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }
            }
        }
        catch (err) {
            handleError(err, stream);
        }
        return { metadata: { command: 'gait' } };
    };
    const gait = vscode.chat.createChatParticipant(GAIT_PARTICIPANT_ID, handler);
    gait.iconPath = vscode.Uri.joinPath(context.extensionUri, 'gait-icon.png');
    context.subscriptions.push(gait);
    return gait;
}
function handleError(err, stream) {
    console.error(err);
    stream.markdown('An error occurred while processing your request.');
}
//# sourceMappingURL=gaitChatParticipant.js.map