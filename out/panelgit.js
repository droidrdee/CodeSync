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
exports.getGitHistory = getGitHistory;
exports.getGitHistoryThatTouchesFile = getGitHistoryThatTouchesFile;
exports.getIdToCommitInfo = getIdToCommitInfo;
exports.getMessageFromGitHistory = getMessageFromGitHistory;
exports.getInlineChatIdToCommitInfo = getInlineChatIdToCommitInfo;
exports.getInlineChatFromGitHistory = getInlineChatFromGitHistory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const simple_git_1 = __importDefault(require("simple-git"));
const types_1 = require("./types");
const stashedState_1 = require("./stashedState"); // Ensure this does not use gzip
const child_process_1 = require("child_process");
const util_1 = require("util");
const SCHEMA_VERSION = '1.0';
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["INFO"] = 0] = "INFO";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["ERROR"] = 2] = "ERROR";
})(LogLevel || (LogLevel = {}));
const CURRENT_LOG_LEVEL = LogLevel.INFO;
/**
 * Logs messages based on the specified log level.
 * @param message - The message to log.
 * @param level - The severity level of the log.
 */
function log(message, level = LogLevel.INFO) {
    if (level >= CURRENT_LOG_LEVEL) {
        switch (level) {
            case LogLevel.INFO:
            // console.log(message);
            case LogLevel.WARN:
                // console.warn(message);
                break;
            case LogLevel.ERROR:
                // console.error(message);
                break;
        }
    }
}
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Executes a Git command and returns the output as a string.
 * @param args - Array of Git command arguments.
 * @param repoPath - The path to the Git repository.
 * @returns A Promise resolving to a string containing the command output.
 */
async function gitShowString(args, repoPath) {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd: repoPath,
            maxBuffer: 1024 * 1024 * 1024 // 1 GB buffer
        });
        return stdout;
    }
    catch (error) {
        if (error.code === 'ENOBUFS') {
            throw new Error('Git command failed: Output exceeded buffer size. The file might be too large.');
        }
        throw new Error(`Git command failed: ${error.message}`);
    }
}
/**
 * Processes a single commit's state.json and extracts active PanelChats and Messages.
 * @param parsedContent - The parsed StashedState from the commit.
 * @param currentMessageIds - Set of active message IDs.
 * @param currentInlineChatIds - Set of active inline chat IDs.
 * @param seenMessageIds - Set to track already processed message IDs.
 * @param commitData - The CommitData object to populate.
 * @param commitHash - The hash of the current commit (for logging purposes).
 */
function processCommit(parsedContent, currentMessageIds, currentInlineChatIds, seenMessageIds, commitData, commitHash) {
    log(`Processing Commit Hash: ${commitHash}`, LogLevel.INFO);
    const { deletedChats } = parsedContent;
    const deletedPanelChatIds = new Set(deletedChats.deletedPanelChatIDs);
    const deletedMessageIds = new Set(deletedChats.deletedMessageIDs);
    // Process Inline Chats
    if (Array.isArray(parsedContent.inlineChats)) {
        for (const inlineChat of parsedContent.inlineChats) {
            const inlineChatId = inlineChat.inline_chat_id;
            if (!currentInlineChatIds.has(inlineChatId)) {
                commitData.inlineChats.push(inlineChat);
            }
        }
    }
    // Process Panel Chats
    for (const panelChat of parsedContent.panelChats) {
        const panelChatId = panelChat.id;
        // Skip deleted PanelChats
        if (deletedPanelChatIds.has(panelChatId)) {
            log(`PanelChat ID ${panelChatId} has been deleted in commit ${commitHash}. Excluding from processing.`, LogLevel.INFO);
            continue;
        }
        // Retrieve or initialize existing PanelChat in commitData
        let existingPanelChat = commitData.panelChats.find(pc => pc.id === panelChatId);
        if (!existingPanelChat) {
            existingPanelChat = { ...panelChat, messages: [], kv_store: {} };
            commitData.panelChats.push(existingPanelChat);
            log(`Initialized PanelChat ID ${panelChatId} in commit ${commitHash}.`, LogLevel.INFO);
        }
        // Process Messages within PanelChat
        for (const message of panelChat.messages) {
            const messageId = message.id;
            if (currentMessageIds.has(messageId) && !seenMessageIds.has(messageId) && !deletedMessageIds.has(messageId)) {
                existingPanelChat.messages.push(message);
                log(`Added Message ID ${messageId} from PanelChat ${panelChatId} in commit ${commitHash}.`, LogLevel.INFO);
                seenMessageIds.add(messageId);
            }
            else {
                if (!currentMessageIds.has(messageId)) {
                    log(`Message ID ${messageId} has been deleted in the current state. Excluding from commit ${commitHash}.`, LogLevel.INFO);
                }
                else {
                    log(`Message ID ${messageId} has already been processed. Skipping.`, LogLevel.INFO);
                }
            }
        }
    }
}
/**
 * Aggregates active PanelChat and InlineChat IDs from the current stashed state.
 * @param parsedCurrent - The current StashedState.
 * @returns An object containing sets of active PanelChat and Message IDs, and active InlineChat IDs.
 */
function aggregateCurrentIds(parsedCurrent) {
    const currentMessageIds = new Set();
    const currentPanelChatIds = new Set();
    const currentInlineChatIds = new Set();
    const { deletedChats, panelChats, inlineChats } = parsedCurrent;
    const deletedPanelChatIds = new Set(deletedChats.deletedPanelChatIDs);
    const deletedMessageIds = new Set(deletedChats.deletedMessageIDs);
    for (const panelChat of panelChats) {
        if (!deletedPanelChatIds.has(panelChat.id)) {
            currentPanelChatIds.add(panelChat.id);
            for (const message of panelChat.messages) {
                if (!deletedMessageIds.has(message.id)) {
                    currentMessageIds.add(message.id);
                }
            }
        }
    }
    for (const inlineChat of inlineChats) {
        currentInlineChatIds.add(inlineChat.inline_chat_id);
    }
    log(`Collected ${currentPanelChatIds.size} active PanelChat IDs, ${currentMessageIds.size} active Message IDs, and ${currentInlineChatIds.size} active InlineChat IDs.`, LogLevel.INFO);
    return { currentMessageIds, currentPanelChatIds, currentInlineChatIds };
}
/**
 * Retrieves the Git history for a specific file, capturing PanelChats instead of flat messages.
 * @param context - The VSCode extension context.
 * @param repoPath - The path to the Git repository.
 * @param filePath - The relative path to the target file within the repository.
 * @returns A Promise resolving to GitHistoryData containing commit history and uncommitted changes.
 */
async function getGitHistory(context, repoPath, filePath) {
    const git = (0, simple_git_1.default)(repoPath);
    log("Starting getGitHistory", LogLevel.INFO);
    // Ensure the file exists in the repository
    const absoluteFilePath = path.resolve(repoPath, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
        throw new Error(`File not found: ${absoluteFilePath}`);
    }
    // Step 1: Read and validate the current state.json
    const parsedCurrent = (0, stashedState_1.readStashedState)(context);
    const { currentMessageIds, currentPanelChatIds, currentInlineChatIds } = aggregateCurrentIds(parsedCurrent);
    const seenMessageIds = new Set();
    const seenInlineChatIds = new Set();
    // Step 2: Get the commit history for the file with --follow to track renames
    const logArgs = ['log', '--reverse', '--follow', '--pretty=format:%H%x09%an%x09%ad%x09%s', '--', filePath];
    let logData;
    try {
        logData = await git.raw(logArgs);
        log(`Retrieved git log data successfully.`, LogLevel.INFO);
    }
    catch (error) {
        if (error.message.includes("does not have any commits yet")) {
            logData = "";
        }
        else {
            throw new Error(`Failed to retrieve git log: ${error.message}`);
        }
    }
    const logLines = logData.split('\n').filter(line => line.trim() !== '');
    log(`Processing ${logLines.length} commits from git log.`, LogLevel.INFO);
    const allCommitsMap = new Map();
    for (const line of logLines) {
        const [commitHash, authorName, dateStr, ...commitMsgParts] = line.split('\t');
        const commitMessage = commitMsgParts.join('\t');
        // Get the file content at this commit using child_process
        let fileContent;
        try {
            fileContent = await gitShowString(['show', `${commitHash}:${filePath}`], repoPath);
            log(`Retrieved file content for commit ${commitHash}.`, LogLevel.INFO);
        }
        catch (error) {
            log(`Warning: Could not retrieve file ${filePath} at commit ${commitHash}. Error: ${error.message}`, LogLevel.WARN);
            continue; // Skip this commit
        }
        // Parse JSON
        let parsedContent;
        try {
            parsedContent = JSON.parse(fileContent);
            if (!(0, types_1.isStashedState)(parsedContent)) {
                throw new Error('Parsed content does not match StashedState structure.');
            }
            log(`Parsed state.json for commit ${commitHash} successfully.`, LogLevel.INFO);
        }
        catch (error) {
            log(`Warning: Failed to parse JSON for commit ${commitHash}: ${error.message}`, LogLevel.WARN);
            log(`Content: ${fileContent}`, LogLevel.WARN);
            continue; // Skip this commit
        }
        // Initialize or retrieve existing CommitData for this commit
        let commitData = allCommitsMap.get(commitHash);
        if (!commitData) {
            commitData = {
                commitHash,
                date: new Date(dateStr),
                commitMessage,
                author: authorName,
                panelChats: [],
                inlineChats: [],
            };
            allCommitsMap.set(commitHash, commitData);
            log(`Initialized CommitData for commit ${commitHash}.`, LogLevel.INFO);
        }
        // Process the commit's panelChats and inlineChats
        processCommit(parsedContent, currentMessageIds, seenInlineChatIds, seenMessageIds, commitData, commitHash);
        // Add all inline chat ids from parsedContent to the seenInlineChats set
        parsedContent.inlineChats.forEach(inlineChat => {
            seenInlineChatIds.add(inlineChat.inline_chat_id);
        });
    }
    // Convert the map to an array and filter out empty commits
    let allCommits = Array.from(allCommitsMap.values())
        .map(commit => ({
        ...commit,
        panelChats: commit.panelChats.filter(pc => pc.messages.length > 0)
    }))
        .filter(commit => commit.panelChats.length > 0 || commit.inlineChats.length > 0);
    log(`Filtered commits to exclude empty ones. Remaining commits count: ${allCommits.length}`, LogLevel.INFO);
    // Step 3: Aggregate uncommitted added content
    const allAddedPanelChats = parsedCurrent.panelChats
        .filter(pc => !parsedCurrent.deletedChats.deletedPanelChatIDs.includes(pc.id))
        .map(pc => ({
        ...pc,
        messages: pc.messages.filter(msg => !parsedCurrent.deletedChats.deletedMessageIDs.includes(msg.id) &&
            !seenMessageIds.has(msg.id))
    }))
        .filter(pc => pc.messages.length > 0);
    // Add all seen messages to seenMessageIds
    for (const panelChat of parsedCurrent.panelChats) {
        for (const message of panelChat.messages) {
            seenMessageIds.add(message.id);
        }
    }
    const added = {
        panelChats: allAddedPanelChats,
        inlineChats: parsedCurrent.inlineChats.filter(ic => currentInlineChatIds.has(ic.inline_chat_id) && !seenInlineChatIds.has(ic.inline_chat_id))
    };
    // Step 4: Handle uncommitted changes
    let uncommitted = null;
    try {
        const currentUncommittedContent = context.workspaceState.get('currentPanelChats') || [];
        if (!Array.isArray(currentUncommittedContent) || !currentUncommittedContent.every(types_1.isPanelChat)) {
            throw new Error('Parsed content does not match PanelChat structure.');
        }
        const allCurrentPanelChats = currentUncommittedContent
            .filter(pc => !parsedCurrent.deletedChats.deletedPanelChatIDs.includes(pc.id))
            .map(pc => ({
            ...pc,
            messages: pc.messages.filter(msg => !parsedCurrent.deletedChats.deletedMessageIDs.includes(msg.id) &&
                !seenMessageIds.has(msg.id))
        }))
            .filter(pc => pc.messages.length > 0);
        uncommitted = {
            panelChats: allCurrentPanelChats,
            inlineChats: []
        };
    }
    catch (error) {
        (0, util_1.debug)("Error reading current uncommitted content: " + error.message);
        log(`Warning: Failed to read current uncommitted content: ${error.message}`, LogLevel.WARN);
    }
    return {
        commits: allCommits,
        added,
        uncommitted
    };
}
/**
 * Retrieves the Git history for a specific file that also touches a target file.
 * @param context - The VSCode extension context.
 * @param repoPath - The path to the Git repository.
 * @param filePath - The relative path to the main target file within the repository.
 * @param targetFilePath - The relative path to the additional target file within the repository.
 * @returns A Promise resolving to GitHistoryData containing commit history and uncommitted changes.
 */
async function getGitHistoryThatTouchesFile(context, repoPath, filePath, targetFilePath) {
    const git = (0, simple_git_1.default)(repoPath);
    log("Starting getGitHistoryThatTouchesFile", LogLevel.INFO);
    // Ensure both files exist in the repository
    const absoluteFilePath = path.resolve(repoPath, filePath);
    const absoluteTargetFilePath = path.resolve(repoPath, targetFilePath);
    if (!fs.existsSync(absoluteFilePath)) {
        throw new Error(`File not found: ${absoluteFilePath}`);
    }
    if (!fs.existsSync(absoluteTargetFilePath)) {
        throw new Error(`Target file not found: ${absoluteTargetFilePath}`);
    }
    const gitHistory = await getGitHistory(context, repoPath, filePath);
    const hashToCommitInfo = new Map();
    for (const commit of gitHistory.commits) {
        hashToCommitInfo.set(commit.commitHash, commit);
    }
    const relativeTargetFilePath = path.relative(repoPath, absoluteTargetFilePath);
    // Step 2: Get the commit history for the main file with --follow to track renames
    const logArgs = ['log', '--reverse', '--follow', '--pretty=format:%H%x09%an%x09%ad%x09%s', '--', relativeTargetFilePath];
    let logData;
    try {
        logData = await git.raw(logArgs);
        log(`Retrieved git log data successfully.`, LogLevel.INFO);
    }
    catch (error) {
        throw new Error(`Failed to retrieve git log for ${filePath}: ${error.message}`);
    }
    const logLines = logData.split('\n').filter(line => line.trim() !== '');
    log(`Processing ${logLines.length} commits from git log.`, LogLevel.INFO);
    const allCommitsMap = new Map();
    for (const line of logLines) {
        const [commitHash, authorName, dateStr, ...commitMsgParts] = line.split('\t');
        const commitData = hashToCommitInfo.get(commitHash);
        if (commitData && (commitData.panelChats.length > 0 || commitData.inlineChats.length > 0)) {
            allCommitsMap.set(commitHash, commitData);
        }
    }
    return {
        commits: Array.from(allCommitsMap.values()),
        added: null,
        uncommitted: null
    };
}
/**
 * Maps message IDs to their respective commit information.
 * @param context - The VSCode extension context.
 * @param repoPath - The path to the Git repository.
 * @param filePath - The relative path to the target file within the repository.
 * @returns A Promise resolving to a Map where keys are message IDs and values are CommitData.
 */
async function getIdToCommitInfo(context, repoPath, filePath) {
    const gitHistory = await getGitHistory(context, repoPath, filePath);
    return getMessageFromGitHistory(gitHistory);
}
function getMessageFromGitHistory(gitHistory) {
    const idToCommitInfo = new Map();
    for (const commit of gitHistory.commits) {
        for (const panelChat of commit.panelChats) {
            for (const message of panelChat.messages) {
                idToCommitInfo.set(message.id, commit);
            }
        }
    }
    return idToCommitInfo;
}
/**
 * Maps inline chat IDs to their respective commit information.
 * @param context - The VSCode extension context.
 * @param repoPath - The path to the Git repository.
 * @param filePath - The relative path to the target file within the repository.
 * @returns A Promise resolving to a Map where keys are inline chat IDs and values are CommitData.
 */
async function getInlineChatIdToCommitInfo(context, repoPath, filePath) {
    const gitHistory = await getGitHistory(context, repoPath, filePath);
    return getInlineChatFromGitHistory(gitHistory);
}
function getInlineChatFromGitHistory(gitHistory) {
    const idToCommitInfo = new Map();
    for (const commit of gitHistory.commits) {
        for (const inlineChat of commit.inlineChats) {
            idToCommitInfo.set(inlineChat.inline_chat_id, commit);
        }
    }
    return idToCommitInfo;
}
//# sourceMappingURL=panelgit.js.map