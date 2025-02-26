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
exports.addGaitSearchExclusion = addGaitSearchExclusion;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function addGaitSearchExclusion() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const vscodePath = path.join(workspaceRoot, '.vscode');
    const settingsPath = path.join(vscodePath, 'settings.json');
    let settings = { "search.exclude": {} };
    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath);
    }
    if (fs.existsSync(settingsPath)) {
        try {
            const settingsContent = fs.readFileSync(settingsPath, 'utf8');
            const settingsWithoutComments = settingsContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            settings = JSON.parse(settingsWithoutComments);
            if (!settings['search.exclude']) {
                settings['search.exclude'] = {};
            }
        }
        catch (error) {
            console.error('Error reading or parsing settings.json:', error);
            vscode.window.showErrorMessage('Failed to read or parse settings.json');
        }
    }
    if (!settings['search.exclude']['.gait/**'] || !settings['search.exclude']['**/gait_context.md']) {
        settings['search.exclude']['.gait/**'] = true;
        settings['search.exclude']['**/gait_context.md'] = true;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        vscode.window.showInformationMessage('Added .gait files to search exclusions in settings.json');
    }
}
//# sourceMappingURL=exclude_search.js.map