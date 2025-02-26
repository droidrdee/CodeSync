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
exports.debug = debug;
exports.generateDebugFile = generateDebugFile;
exports.registerDebugCommand = registerDebugCommand;
const vscode = __importStar(require("vscode"));
class Debug {
    logs = [];
    debug(str) {
        this.logs.push(str);
    }
    formatLogs() {
        return this.logs.join('\n');
    }
    generateDebugFile() {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '', 'debug.log');
        fs.writeFileSync(filePath, this.formatLogs());
        vscode.window.showInformationMessage('Debug file generated successfully at ' + filePath);
    }
}
const debug_obj = new Debug();
function debug(str) {
    debug_obj.debug(new Date().toISOString() + ' - ' + str);
}
function generateDebugFile() {
    debug_obj.generateDebugFile();
}
function registerDebugCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand('gait.debugFile', () => {
        debug_obj.generateDebugFile();
    }));
}
//# sourceMappingURL=debug.js.map