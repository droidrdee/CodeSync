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
exports.matchDiffToCurrentFile = matchDiffToCurrentFile;
exports.generateDecorationMap = generateDecorationMap;
exports.addDecorationForLine = addDecorationForLine;
exports.decorateActive = decorateActive;
exports.matchDiffToFileContent = matchDiffToFileContent;
exports.writeMatchStatistics = writeMatchStatistics;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const simple_git_1 = __importDefault(require("simple-git"));
const path = __importStar(require("path"));
const InlineHover = __importStar(require("./inlinehover"));
const panelChats_1 = require("./panelChats");
const stashedState_1 = require("./stashedState");
const PanelHover = __importStar(require("./panelHover"));
const posthog_js_1 = __importDefault(require("posthog-js"));
const panelgit_1 = require("./panelgit");
const colorHueMap = {
    blue: 210,
    green: 110,
    purple: 270,
    orange: 30,
};
/**
 * Generates a color based on the given index.
 * @param index The index used to determine the color.
 * @returns A string representing the color in HSLA format.
 */
function generateColors(index) {
    const colorTypes = ['blue', 'green', 'purple', 'orange'];
    const hue = colorHueMap[colorTypes[index % colorTypes.length]];
    const saturation = 30;
    const lightness = 75;
    return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`; // Reduced opacity for shadow effect
}
/**
 * Extracts code blocks demarcated by triple backticks from a given text.
 * Handles optional language specifiers after the opening backticks.
 * @param text The text to extract code blocks from.
 * @returns An array of code blocks.
 */
function extractCodeBlocks(text) {
    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        codeBlocks.push(match[1].trim());
    }
    return codeBlocks;
}
function isMeaningfulLine(line) {
    return /[a-zA-Z0-9]/.test(line.trim()) && !line.trim().startsWith('import ');
}
function matchDiffToCurrentFile(document, diff) {
    const documentLines = document.getText().split('\n');
    const addedLinesSet = new Set(diff.filter(change => change.added)
        .flatMap(change => change.value.split('\n').map(line => line.trim()))
        .filter(line => line.trim().length > 0));
    const matchedLinesSet = new Set();
    if (addedLinesSet.size === 0) {
        return [];
    }
    const matchingLineNumbers = [];
    const lineOccurrences = new Map();
    for (let i = 0; i < documentLines.length; i++) {
        const trimmedLine = documentLines[i].trim();
        if (addedLinesSet.has(trimmedLine)) {
            matchingLineNumbers.push(i);
            matchedLinesSet.add(trimmedLine);
            lineOccurrences.set(trimmedLine, (lineOccurrences.get(trimmedLine) || 0) + 1);
        }
    }
    if (addedLinesSet.size < 5) {
        return matchingLineNumbers
            .filter(line => {
            const trimmedLine = documentLines[line].trim();
            return isMeaningfulLine(documentLines[line]) && lineOccurrences.get(trimmedLine) === 1;
        })
            .map(line => new vscode.Range(line, 0, line, documentLines[line].length));
    }
    if (addedLinesSet.size * 0.2 > matchedLinesSet.size) {
        return [];
    }
    let start = -1;
    let end = -1;
    const multiLineRanges = [];
    for (let i = 0; i < matchingLineNumbers.length; i++) {
        const currentLine = matchingLineNumbers[i];
        const nextLine = matchingLineNumbers[i + 1];
        if (start === -1) {
            start = currentLine;
        }
        if (nextLine === undefined || nextLine !== currentLine + 1) {
            end = currentLine;
            let meaningfulLines = 0;
            for (let j = start; j <= end; j++) {
                const line = documentLines[j].trim();
                if (isMeaningfulLine(line)) {
                    meaningfulLines++;
                }
            }
            if (meaningfulLines >= 2) {
                for (let j = start; j <= end; j++) {
                    multiLineRanges.push(new vscode.Range(j, 0, j, documentLines[j].length));
                }
            }
            else if (meaningfulLines === 1) {
                const trimmedLine = documentLines[start].trim();
                if (lineOccurrences.get(trimmedLine) === 1 && isMeaningfulLine(trimmedLine)) {
                    multiLineRanges.push(new vscode.Range(start, 0, start, documentLines[start].length));
                }
            }
            start = -1;
            end = -1;
        }
    }
    return multiLineRanges;
}
function generateDecorationMap(context, editor) {
    const decorationMap = new Map();
    const baseName = vscode.workspace.asRelativePath(editor.document.uri);
    if (baseName === 'gait_context.md' || baseName === '.gait/state.json') {
        return decorationMap;
    }
    const stashedState = (0, stashedState_1.readStashedState)(context);
    const inlineChats = stashedState.inlineChats;
    for (const chat of Object.values(inlineChats)) {
        for (const diff of chat.file_diff) {
            if (diff.file_path !== baseName) {
                continue;
            }
            const currentRanges = matchDiffToCurrentFile(editor.document, diff.diffs);
            currentRanges.forEach(range => {
                for (let line = range.start.line; line <= range.end.line; line++) {
                    decorationMap.set(line, { type: 'inline', inlineChat: chat, panelChat: undefined, messageId: undefined, id: chat.inline_chat_id });
                }
            });
        }
    }
    const allPanelChats = [...stashedState.panelChats, ...(context.workspaceState.get('currentPanelChats') || [])];
    const currentPanelChats = allPanelChats.filter(chat => !stashedState.deletedChats.deletedPanelChatIDs.includes(chat.id));
    const currentMessages = currentPanelChats.reduce((acc, panelChat) => {
        panelChat.messages.forEach(message => {
            if (stashedState.deletedChats.deletedMessageIDs.includes(message.id)) {
                return;
            }
            const existingIndex = acc.findIndex(item => item.message.id === message.id);
            if (existingIndex === -1) {
                acc.push({ message, panelChat });
            }
        });
        return acc;
    }, []);
    for (const { message, panelChat } of currentMessages) {
        if (message.kv_store && 'file_paths' in message.kv_store && !message.kv_store.file_paths.includes(baseName) && (('isComposer' in panelChat.kv_store && !panelChat.kv_store.isComposer) || !('isComposer' in panelChat.kv_store)) && false) {
            continue;
        }
        const already_associated = (message.kv_store?.file_paths ?? []).includes(baseName);
        const codeBlocks = extractCodeBlocks(message.responseText);
        let file_path_dict = {};
        if ('file_path_dict' in message.kv_store) {
            file_path_dict = message.kv_store.file_path_dict;
        }
        for (let i = 0; i < codeBlocks.length; i++) {
            if (i in file_path_dict) {
                continue;
            }
            const code = codeBlocks[i];
            const currentRanges = matchDiffToCurrentFile(editor.document, [{ value: code, added: true }]);
            if (!already_associated && currentRanges.reduce((sum, range) => sum + (range.end.line - range.start.line + 1), 0) > code.split('\n').filter(isMeaningfulLine).length / 2) {
                (0, panelChats_1.associateFileWithMessageCodeblock)(context, message, baseName, panelChat, i).catch(error => {
                    console.error(`Failed to associate file with message: ${error}`);
                });
            }
            currentRanges.forEach(range => {
                for (let line = range.start.line; line <= range.end.line; line++) {
                    if (!decorationMap.has(line)) {
                        decorationMap.set(line, { type: 'panel', inlineChat: undefined, panelChat: panelChat, messageId: message.id, id: message.id });
                    }
                }
            });
        }
    }
    return decorationMap;
}
function addDecorationForLine(context, editor, lineNumber, decorations, gitHistory, excludeAfterText = false) {
    gitHistory = structuredClone(gitHistory);
    decorations.forEach(decoration => decoration.dispose());
    const decorationMap = context.workspaceState.get('decorationMap');
    if (!decorationMap)
        return [];
    const decoration = decorationMap.get(lineNumber);
    if (!decoration)
        return [];
    const range = new vscode.Range(lineNumber, editor.document.lineAt(lineNumber).text.length, lineNumber, editor.document.lineAt(lineNumber).text.length);
    // Filter decorationMap to get the lineNumbers that match the current decoration
    const matchingLineNumbers = Array.from(decorationMap.entries())
        .filter(([_, dec]) => (decoration.type === 'inline' && dec.type === 'inline' && dec.inlineChat?.inline_chat_id === decoration.inlineChat?.inline_chat_id) ||
        (decoration.type === 'panel' && dec.type === 'panel' && dec.panelChat?.id === decoration.panelChat?.id && dec.messageId === decoration.messageId))
        .map(([lineNum, _]) => lineNum);
    const decorationType = vscode.window.createTextEditorDecorationType({});
    const disposables = [];
    const highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
        isWholeLine: true,
    });
    let hoverMessage = null;
    let afterText = '';
    const panelGitHistory = (0, panelgit_1.getMessageFromGitHistory)(gitHistory);
    const inlineGitHistory = (0, panelgit_1.getInlineChatFromGitHistory)(gitHistory);
    try {
        if (decoration.type === 'inline' && decoration.inlineChat) {
            hoverMessage = InlineHover.createHover(context, { range: new vscode.Range(lineNumber, 0, lineNumber, editor.document.lineAt(lineNumber).text.length), inlineChat: decoration.inlineChat }, editor.document, inlineGitHistory);
            afterText = InlineHover.getAfterText(decoration.inlineChat, inlineGitHistory);
        }
        else if (decoration.type === 'panel' && decoration.panelChat && decoration.messageId) {
            hoverMessage = PanelHover.createPanelHover(context, { range: new vscode.Range(lineNumber, 0, lineNumber, editor.document.lineAt(lineNumber).text.length), panelChat: decoration.panelChat, message_id: decoration.messageId }, editor.document, panelGitHistory);
            afterText = PanelHover.getAfterText(decoration.panelChat, decoration.messageId, panelGitHistory);
        }
    }
    catch (error) {
        console.error('Error creating hover message:', error);
    }
    if (hoverMessage) {
        const decorationOptions = {
            range,
            renderOptions: {
                after: {
                    contentText: afterText,
                    margin: '0 0 0 3em',
                    color: '#A0A0A0',
                }
            },
        };
        const hoverProvider = vscode.languages.registerHoverProvider('*', {
            async provideHover(document, position, token) {
                let start = range.start;
                let end = range.end;
                if (excludeAfterText) {
                    start = new vscode.Position(range.start.line, 0);
                    end = new vscode.Position(range.start.line, 50);
                }
                let new_range = new vscode.Range(start, end);
                if (!new_range.contains(position)) {
                    return;
                }
                if (!excludeAfterText) {
                    const highlightRanges = matchingLineNumbers.map(lineNum => new vscode.Range(lineNum, 0, lineNum, document.lineAt(lineNum).text.length));
                    editor.setDecorations(highlightDecorationType, highlightRanges);
                    disposables.push(highlightDecorationType);
                }
                posthog_js_1.default.capture('hover');
                return new vscode.Hover(hoverMessage);
            }
        });
        // Add the new hover provider to the subscriptions
        context.subscriptions.push(hoverProvider);
        disposables.push(hoverProvider);
        if (!excludeAfterText) {
            editor.setDecorations(decorationType, [decorationOptions]);
            disposables.push(decorationType);
        }
    }
    return disposables;
}
function decorateActive(context, gitHistory, decorateAll = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return [];
    }
    const decorationMap = generateDecorationMap(context, editor);
    context.workspaceState.update('decorationMap', decorationMap);
    let disposables = [];
    if (decorateAll && gitHistory) {
        const uniqueDecorations = new Map();
        decorationMap.forEach((decoration, line) => {
            if (!uniqueDecorations.has(decoration.id)) {
                uniqueDecorations.set(decoration.id, decoration);
            }
        });
        let colorIndex = 0;
        uniqueDecorations.forEach((decoration, id) => {
            const color = generateColors(colorIndex);
            colorIndex++;
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: color,
                isWholeLine: true,
            });
            const ranges = Array.from(decorationMap.entries())
                .filter(([_, dec]) => dec.id === id)
                .map(([line, _]) => new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length));
            editor.setDecorations(decorationType, ranges);
            disposables.push(decorationType);
        });
        for (const [line, decoration] of decorationMap.entries()) {
            disposables = disposables.concat(addDecorationForLine(context, editor, line, [], gitHistory, true));
        }
    }
    return disposables;
}
function matchDiffToFileContent(fileContent, diff) {
    const documentLines = fileContent.split('\n');
    const addedLinesSet = new Set(diff.filter(change => change.added)
        .flatMap(change => change.value.split('\n').map(line => line.trim()))
        .filter(line => line.trim().length > 0));
    const matchedLinesSet = new Set();
    if (addedLinesSet.size === 0) {
        return [];
    }
    const matchingLineNumbers = [];
    const lineOccurrences = new Map();
    for (let i = 0; i < documentLines.length; i++) {
        const trimmedLine = documentLines[i].trim();
        if (addedLinesSet.has(trimmedLine)) {
            matchingLineNumbers.push(i);
            matchedLinesSet.add(trimmedLine);
            lineOccurrences.set(trimmedLine, (lineOccurrences.get(trimmedLine) || 0) + 1);
        }
    }
    if (addedLinesSet.size < 5) {
        return matchingLineNumbers
            .filter(line => {
            const trimmedLine = documentLines[line].trim();
            return isMeaningfulLine(documentLines[line]) && lineOccurrences.get(trimmedLine) === 1;
        })
            .map(line => ({ start: line, end: line }));
    }
    if (addedLinesSet.size * 0.2 > matchedLinesSet.size) {
        return [];
    }
    let start = -1;
    let end = -1;
    const multiLineRanges = [];
    for (let i = 0; i < matchingLineNumbers.length; i++) {
        const currentLine = matchingLineNumbers[i];
        const nextLine = matchingLineNumbers[i + 1];
        if (start === -1) {
            start = currentLine;
        }
        if (nextLine === undefined || nextLine !== currentLine + 1) {
            end = currentLine;
            let meaningfulLines = 0;
            for (let j = start; j <= end; j++) {
                const line = documentLines[j].trim();
                if (isMeaningfulLine(line)) {
                    meaningfulLines++;
                }
            }
            if (meaningfulLines >= 2) {
                multiLineRanges.push({ start, end });
            }
            else if (meaningfulLines === 1) {
                const trimmedLine = documentLines[start].trim();
                if (lineOccurrences.get(trimmedLine) === 1 && isMeaningfulLine(trimmedLine)) {
                    multiLineRanges.push({ start, end: start });
                }
            }
            start = -1;
            end = -1;
        }
    }
    return multiLineRanges;
}
function getAllDiffs(context, stashedState) {
    const allDiffs = [];
    // Get diffs from inline chats
    for (const inlineChat of Object.values(stashedState.inlineChats)) {
        for (const fileDiff of inlineChat.file_diff) {
            allDiffs.push({
                diff: fileDiff.diffs,
                source: {
                    type: 'inline',
                    chatId: inlineChat.inline_chat_id
                }
            });
        }
    }
    // Get diffs from panel chats
    const allPanelChats = stashedState.panelChats;
    for (const panelChat of allPanelChats) {
        if (!stashedState.deletedChats.deletedPanelChatIDs.includes(panelChat.id)) {
            for (const message of panelChat.messages) {
                if (!stashedState.deletedChats.deletedMessageIDs.includes(message.id)) {
                    const codeBlocks = extractCodeBlocks(message.responseText);
                    for (const code of codeBlocks) {
                        allDiffs.push({
                            diff: [{ value: code, added: true }],
                            source: {
                                type: 'panel',
                                chatId: panelChat.id,
                                messageId: message.id,
                                userText: message.messageText,
                                responseText: message.responseText
                            }
                        });
                    }
                }
            }
        }
    }
    return allDiffs;
}
async function getMatchStatistics(context, stashedState) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found');
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const git = (0, simple_git_1.default)(workspaceRoot);
    let repoRoot = workspaceRoot;
    const uniqueMatchedLines = new Set();
    let maxMatches = 0;
    let bestPromptResponse = null;
    const fileStatistics = new Map();
    // Exclude binary object types from tracked files
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib'];
    const trackedFiles = await git.raw(['ls-files']);
    const trackedFilePaths = trackedFiles.split('\n').filter(filePath => !filePath.includes('.gait') &&
        !filePath.includes('gait_context.md') &&
        !filePath.includes('.git') &&
        !filePath.includes('package-lock.json') &&
        !filePath.includes('yarn.lock')).filter(filePath => {
        const ext = path.extname(filePath).toLowerCase();
        return !binaryExtensions.includes(ext);
    });
    const allDiffs = getAllDiffs(context, stashedState);
    let totalRepoLineCount = 0;
    for (const filePath of trackedFilePaths) {
        const fullPath = path.join(repoRoot.trim(), filePath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const totalLines = fileContent.split('\n').length;
            totalRepoLineCount += totalLines;
            let aiGeneratedLines = new Set();
            for (const diffInfo of allDiffs) {
                const matches = matchDiffToFileContent(fileContent, diffInfo.diff);
                const matchCount = matches.reduce((sum, match) => sum + (match.end - match.start + 1), 0);
                // Update unique matched lines count
                for (const match of matches) {
                    for (let i = match.start; i <= match.end; i++) {
                        uniqueMatchedLines.add(`${filePath}:${i}`);
                        aiGeneratedLines.add(i);
                    }
                }
                // Update best prompt-response if it's from a panel chat
                if (diffInfo.source.type === 'panel' && matchCount > maxMatches) {
                    maxMatches = matchCount;
                    bestPromptResponse = {
                        prompt: diffInfo.source.userText || '',
                        response: diffInfo.source.responseText || '',
                        matchCount: matchCount,
                        file: filePath
                    };
                }
            }
            // Calculate AI-generated percentage for this file
            const aiGeneratedCount = aiGeneratedLines.size;
            const aiGeneratedPercentage = (aiGeneratedCount / totalLines) * 100;
            fileStatistics.set(filePath, {
                totalLines,
                aiGeneratedLines: aiGeneratedCount,
                aiGeneratedPercentage
            });
        }
    }
    return {
        uniqueMatchedLinesCount: uniqueMatchedLines.size,
        bestPromptResponse,
        fileStatistics,
        totalRepoLineCount
    };
}
async function writeMatchStatistics(context) {
    const stashedState = (0, stashedState_1.readStashedState)(context);
    const { uniqueMatchedLinesCount, bestPromptResponse, fileStatistics, totalRepoLineCount } = await getMatchStatistics(context, stashedState);
    stashedState.kv_store['unique_matched_lines_count'] = uniqueMatchedLinesCount;
    stashedState.kv_store['total_repo_line_count'] = totalRepoLineCount;
    if (bestPromptResponse) {
        stashedState.kv_store['best_prompt_response'] = {
            prompt: bestPromptResponse.prompt,
            response: bestPromptResponse.response,
            match_count: bestPromptResponse.matchCount,
            file: bestPromptResponse.file
        };
    }
    else {
        stashedState.kv_store['best_prompt_response'] = null;
    }
    // Store file statistics
    const fileStatsArray = Array.from(fileStatistics.entries()).map(([file, stats]) => ({
        file,
        total_lines: stats.totalLines,
        ai_generated_lines: stats.aiGeneratedLines,
        ai_generated_percentage: stats.aiGeneratedPercentage
    }));
    stashedState.kv_store['file_statistics'] = fileStatsArray;
    (0, stashedState_1.writeStashedState)(context, stashedState);
}
//# sourceMappingURL=filedecoration.js.map