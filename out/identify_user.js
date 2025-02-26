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
exports.identifyUser = identifyUser;
exports.identifyRepo = identifyRepo;
const posthog_js_1 = __importDefault(require("posthog-js"));
const simple_git_1 = __importDefault(require("simple-git"));
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
async function identifyUser() {
    const git = (0, simple_git_1.default)();
    try {
        const userEmail = await git.raw(['config', '--get', 'user.email']);
        const trimmedEmail = userEmail.trim();
        if (trimmedEmail) {
            const hashedEmail = crypto.createHash('sha256').update(trimmedEmail).digest('hex');
            posthog_js_1.default.identify(hashedEmail, { email: trimmedEmail });
        }
        else {
            // console.log('No Git user email found');
            posthog_js_1.default.capture('no_git_user_email_found');
        }
    }
    catch (error) {
        console.error('Error identifying user:', error);
        posthog_js_1.default.capture('error_identifying_user', { error: error });
    }
}
async function identifyRepo(context) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }
    // Check if repo global state exists, if not, set it to the first commit hash
    const repoId = context.workspaceState.get('repoid');
    if (!repoId) {
        try {
            const git = (0, simple_git_1.default)(workspaceFolder.uri.fsPath);
            const log = await git.raw('rev-list', '--max-parents=0', 'HEAD');
            const firstCommitHash = log.trim();
            context.workspaceState.update('repoid', firstCommitHash);
        }
        catch (error) {
            console.error('Error getting first commit hash:', error);
        }
    }
}
//# sourceMappingURL=identify_user.js.map