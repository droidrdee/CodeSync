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
exports.initializeGait = initializeGait;
const constants_1 = require("./constants");
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const simple_git_1 = __importDefault(require("simple-git"));
const child_process = __importStar(require("child_process"));
const debug_1 = require("./debug");
const stashedState_1 = require("./stashedState");
function mergeDriver(workspaceFolder) {
    try {
        const gaitFolderPath = path.join(workspaceFolder.uri.fsPath, constants_1.GAIT_FOLDER_NAME); // Define the custom merge driver script content
        const customMergeDriverScript = `#!/bin/bash

# custom-merge-driver.sh

# Exit immediately if a command exits with a non-zero status
set -e

# Git passes these parameters to the merge driver
BASE="$1"    # %O - Ancestor's version (common base)
CURRENT="$2" # %A - Current version (ours)
OTHER="$3"   # %B - Other branch's version (theirs)

# Temporary file to store the merged result
MERGED="\${CURRENT}.merged"

# Check if jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq command could not be found. Please install jq to use this merge driver."
    exit 1
fi

# Optional: Validate JSON inputs
if ! jq empty "$CURRENT" 2>/dev/null; then
    echo "Invalid JSON in CURRENT file: $CURRENT"
    exit 1
fi
if ! jq empty "$OTHER" 2>/dev/null; then
    echo "Invalid JSON in OTHER file: $OTHER"
    exit 1
fi

# Create a temporary file for the jq filter
TMP_JQ_FILTER=$(mktemp /tmp/jq_filter.XXXXXX)

# Ensure the temporary file is deleted on script exit
trap 'rm -f "$TMP_JQ_FILTER"' EXIT

# Write the jq script to the temporary file
cat <<'EOF' > "$TMP_JQ_FILTER"
def mergePanelChats(ourChats; theirChats):
  (ourChats + theirChats)
  | group_by(.id)
  | map(
      if length == 1 then .[0]
      else
        .[0] as $ourChat
        | .[1] as $theirChat
        | (if ($theirChat.messages | length) > ($ourChat.messages | length) then $theirChat.messages else $ourChat.messages end) as $mergedMessages
        | ($ourChat.kv_store + $theirChat.kv_store) as $mergedKvStore
        | {
            ai_editor: $ourChat.ai_editor,
            id: $ourChat.id,
            customTitle: $ourChat.customTitle,
            parent_id: $ourChat.parent_id,
            created_on: $ourChat.created_on,
            messages: $mergedMessages,
            kv_store: $mergedKvStore
          }
      end
    );

def mergeStashedStates(ourState; theirState):
  {
    panelChats: mergePanelChats(ourState.panelChats; theirState.panelChats),
    inlineChats: (ourState.inlineChats + theirState.inlineChats | group_by(.inline_chat_id) | map(.[0])),
    schemaVersion: ourState.schemaVersion,
    deletedChats: {
      deletedMessageIDs: (ourState.deletedChats.deletedMessageIDs + theirState.deletedChats.deletedMessageIDs) | unique,
      deletedPanelChatIDs: (ourState.deletedChats.deletedPanelChatIDs + theirState.deletedChats.deletedPanelChatIDs) | unique
    },
    kv_store: (ourState.kv_store + theirState.kv_store)
  };

mergeStashedStates($ourState; $theirState)
EOF

# Debug: Verify the jq filter content
echo "Using jq filter from $TMP_JQ_FILTER:"

# Perform the merge using jq with the temporary filter file
jq -n \
    --argfile ourState "$CURRENT" \
    --argfile theirState "$OTHER" \
    -f "$TMP_JQ_FILTER" > "$MERGED"

# Capture jq's exit status
JQ_STATUS=$?

# Check if the merge was successful
if [ "$JQ_STATUS" -ne 0 ]; then
    echo "Error during merging stashed states."
    exit 1
fi

# Replace the current file with the merged result
mv "$MERGED" "$CURRENT"

# Indicate a successful merge
exit 0
`;
        // Path to the custom merge driver script
        const customMergeDriverPath = path.join(gaitFolderPath, 'custom-merge-driver.sh');
        const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
        let gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
        if (!gitignoreContent.includes('custom-merge-driver.sh')) {
            fs.appendFileSync(gitignorePath, '\n.gait/custom-merge-driver.sh\n');
            vscode.window.showInformationMessage('Added custom merge driver script to .gitignore');
        }
        // Write the script to the .gait folder if it doesn't exist or content has changed
        if (!fs.existsSync(customMergeDriverPath) || fs.readFileSync(customMergeDriverPath, 'utf8') !== customMergeDriverScript) {
            fs.writeFileSync(customMergeDriverPath, customMergeDriverScript, { mode: 0o755 });
            fs.chmodSync(customMergeDriverPath, 0o755); // Ensure the script is executable
            vscode.window.showInformationMessage('Custom merge driver script updated.');
        }
        // Configure Git to use the custom merge driver
        try {
            const gitConfigNameCmd = `git config --local merge.custom-stashed-state.name "Custom merge driver for stashed state"`;
            child_process.execSync(gitConfigNameCmd, { cwd: workspaceFolder.uri.fsPath });
            const gitConfigDriverCmd = `git config --local merge.custom-stashed-state.driver "${customMergeDriverPath} %O %A %B"`;
            child_process.execSync(gitConfigDriverCmd, { cwd: workspaceFolder.uri.fsPath });
            // vscode.window.showInformationMessage('Git merge driver configured successfully.');
        }
        catch (error) {
            console.error('Error configuring git merge driver:', error);
            vscode.window.showErrorMessage('Failed to configure git merge driver.');
        }
        // Update the .gitattributes file
        const gitAttributesPath = path.join(workspaceFolder.uri.fsPath, '.gitattributes');
        let gitAttributesContent = '';
        if (fs.existsSync(gitAttributesPath)) {
            gitAttributesContent = fs.readFileSync(gitAttributesPath, 'utf8');
        }
        const mergeDriverAttribute = `${constants_1.GAIT_FOLDER_NAME}/state.json merge=custom-stashed-state`;
        if (!gitAttributesContent.includes(mergeDriverAttribute)) {
            try {
                fs.appendFileSync(gitAttributesPath, `\n${mergeDriverAttribute}\n`);
                vscode.window.showInformationMessage('.gitattributes updated with custom merge driver.');
            }
            catch (error) {
                console.error('Error updating .gitattributes:', error);
                vscode.window.showErrorMessage('Failed to update .gitattributes with custom merge driver.');
            }
        }
    }
    catch (error) {
        (0, debug_1.debug)("Error setting up custom merge driver: " + error);
        console.error('Error setting up custom merge driver:', error);
        vscode.window.showErrorMessage('Failed to set up custom merge driver.');
    }
}
/**
 * Creates the .gait folder and necessary files if they don't exist.
 */
function createGaitFolderIfNotExists(workspaceFolder) {
    const gaitFolderPath = path.join(workspaceFolder.uri.fsPath, constants_1.GAIT_FOLDER_NAME);
    if (!fs.existsSync(gaitFolderPath)) {
        fs.mkdirSync(gaitFolderPath);
        vscode.window.showInformationMessage(`${constants_1.GAIT_FOLDER_NAME} folder created successfully. Please commit this folder to save your chats.`);
    }
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
    (0, stashedState_1.writeStashedStateToFile)(emptyStashedState);
    setTimeout(async () => {
        try {
            const git = (0, simple_git_1.default)(workspaceFolder.uri.fsPath);
            await git.add(constants_1.GAIT_FOLDER_NAME);
        }
        catch (error) {
            console.error('Error adding .gait folder to Git:', error);
            vscode.window.showErrorMessage('Failed to add .gait folder to Git tracking');
        }
    }, 1000);
    const gitAttributesPath = path.join(workspaceFolder.uri.fsPath, '.gitattributes');
    const gitAttributesContent = fs.existsSync(gitAttributesPath)
        ? fs.readFileSync(gitAttributesPath, 'utf-8')
        : '';
    if (!gitAttributesContent.includes(`${constants_1.GAIT_FOLDER_NAME}/** -diff linguist-generated`)) {
        fs.appendFileSync(gitAttributesPath, `\n${constants_1.GAIT_FOLDER_NAME}/** -diff linguist-generated\n`);
        vscode.window.showInformationMessage('.gitattributes updated successfully');
    }
}
function initializeGait() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        createGaitFolderIfNotExists(workspaceFolder);
        mergeDriver(workspaceFolder);
    }
}
//# sourceMappingURL=initialize_gait.js.map