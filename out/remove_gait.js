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
exports.removeGait = removeGait;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const constants_1 = require("./constants");
const debug_1 = require("./debug");
function removeGait() {
    (0, debug_1.debug)("Removing gait");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }
    const gaitFolderPath = path.join(workspaceFolder.uri.fsPath, constants_1.GAIT_FOLDER_NAME);
    const gitAttributesPath = path.join(workspaceFolder.uri.fsPath, '.gitattributes');
    const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
    try {
        if (fs.existsSync(gaitFolderPath)) {
            fs.rmdirSync(gaitFolderPath, { recursive: true });
        }
        if (fs.existsSync(gitAttributesPath)) {
            let content = fs.readFileSync(gitAttributesPath, 'utf8');
            content = content.replace(/^.*gait.*$\n?/gm, '');
            if (!/[a-zA-Z0-9]/.test(content)) {
                fs.unlinkSync(gitAttributesPath);
            }
            else {
                fs.writeFileSync(gitAttributesPath, content.trim());
            }
        }
        if (fs.existsSync(gitignorePath)) {
            let content = fs.readFileSync(gitignorePath, 'utf8');
            content = content.replace(/^.*gait.*$\n?/gm, '');
            if (!/[a-zA-Z0-9]/.test(content)) {
                fs.unlinkSync(gitignorePath);
            }
            else {
                fs.writeFileSync(gitignorePath, content.trim());
            }
        }
        vscode.window.showInformationMessage('gait-related files and entries removed from .gitattributes and .gitignore.');
    }
    catch (error) {
        (0, debug_1.debug)("Error removing gait: " + error.message);
        console.error('Error removing gait:', error);
        vscode.window.showErrorMessage('Failed to remove gait completely. Please manually remove gait-related entries from .gitattributes and .gitignore.');
    }
}
//# sourceMappingURL=remove_gait.js.map