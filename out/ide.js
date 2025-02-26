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
exports.checkTool = checkTool;
exports.registerSetToolCommand = registerSetToolCommand;
const vscode = __importStar(require("vscode"));
function checkTool(context) {
    if (context.globalState.get("toolOverride")) {
        return context.globalState.get("toolOverride");
    }
    const bundleIdentifier = process.env.__CFBundleIdentifier || "";
    const ipcHook = process.env.VSCODE_IPC_HOOK || "";
    const cwd = process.env.VSCODE_CWD || "";
    if (bundleIdentifier.toLowerCase().includes("cursor") || ipcHook.toLowerCase().includes("cursor") || cwd.toLowerCase().includes("cursor")) {
        return "Cursor";
    }
    return "VSCode";
}
function registerSetToolCommand(context) {
    let disposable = vscode.commands.registerCommand('gait.setTool', async () => {
        const tools = ["VSCode", "Cursor"];
        const selectedTool = await vscode.window.showQuickPick(tools, {
            placeHolder: 'Select the AI codegen tool you are using'
        });
        if (selectedTool) {
            context.globalState.update("toolOverride", selectedTool);
            vscode.window.showInformationMessage(`Tool override set to: ${selectedTool}`);
        }
        vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=ide.js.map