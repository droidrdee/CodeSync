"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeybindings = generateKeybindings;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vscode_1 = __importDefault(require("vscode"));
function generateKeybindings(context, tool) {
    let newKeybindings = [];
    const sharedKeybindings = [{
            key: "cmd+shift+g",
            command: "gait.toggleHover",
        }];
    if (tool === "Cursor") {
        newKeybindings = [{
                key: "cmd+e",
                command: "aipopup.action.modal.generate",
                when: "editorFocus && !composerBarIsVisible && !composerControlPanelIsVisible"
            },
            {
                key: "cmd+k",
                command: "-aipopup.action.modal.generate",
                when: "editorFocus && !composerBarIsVisible && !composerControlPanelIsVisible"
            },
            {
                key: "cmd+e",
                command: "composer.startComposerPrompt",
                when: "composerIsEnabled"
            },
            {
                key: "cmd+k",
                command: "-composer.startComposerPrompt",
                when: "composerIsEnabled"
            },
            {
                command: "gait.startInlineChat",
                key: "cmd+k",
                when: "editorFocus"
            }
        ];
    }
    else {
        newKeybindings = [
            {
                command: "gait.startInlineChat",
                key: "cmd+i",
                when: "editorFocus && inlineChatHasProvider && !editorReadonly"
            }
        ];
    }
    newKeybindings = [...newKeybindings, ...sharedKeybindings];
    const extensionPackageJsonPath = path_1.default.resolve(context.extensionPath, 'package.json');
    //console.log("extensionPackageJsonPath", extensionPackageJsonPath);
    const extensionPackageJson = fs_1.default.readFileSync(extensionPackageJsonPath, 'utf8');
    const extensionPackageJsonObj = JSON.parse(extensionPackageJson);
    if (!areKeybindingsEqual(extensionPackageJsonObj.contributes.keybindings, newKeybindings)) {
        extensionPackageJsonObj.contributes.keybindings = newKeybindings;
        fs_1.default.writeFileSync(extensionPackageJsonPath, JSON.stringify(extensionPackageJsonObj, null, 4), 'utf8');
        vscode_1.default.window.showInformationMessage("Keybindings updated... Reloading");
        vscode_1.default.commands.executeCommand("workbench.action.reloadWindow");
    }
}
function areKeybindingsEqual(keybindings, newKeybindings) {
    return keybindings.length === newKeybindings.length && keybindings.every((kb) => newKeybindings.some((newKb) => newKb.command === kb.command && newKb.key === kb.key));
}
//# sourceMappingURL=keybind.js.map