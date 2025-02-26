import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GAIT_FOLDER_NAME } from "./constants";
import { debug } from "./debug";
export function removeCodesync() {
    debug("Removing codesync");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }

    const codesyncFolderPath = path.join(workspaceFolder.uri.fsPath, GAIT_FOLDER_NAME);
    const gitAttributesPath = path.join(workspaceFolder.uri.fsPath, '.gitattributes');
    const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');

    try {
        if (fs.existsSync(codesyncFolderPath)) {
            fs.rmdirSync(codesyncFolderPath, { recursive: true });
        }

        if (fs.existsSync(gitAttributesPath)) {
            let content = fs.readFileSync(gitAttributesPath, 'utf8');
            content = content.replace(/^.*codesync.*$\n?/gm, '');
            if (!/[a-zA-Z0-9]/.test(content)) {
                fs.unlinkSync(gitAttributesPath);
            } else {
                fs.writeFileSync(gitAttributesPath, content.trim());
            }
        }

        if (fs.existsSync(gitignorePath)) {
            let content = fs.readFileSync(gitignorePath, 'utf8');
            content = content.replace(/^.*codesync.*$\n?/gm, '');
            if (!/[a-zA-Z0-9]/.test(content)) {
                fs.unlinkSync(gitignorePath);
            } else {
                fs.writeFileSync(gitignorePath, content.trim());
            }
        }

        vscode.window.showInformationMessage('codesync-related files and entries removed from .gitattributes and .gitignore.');
    } catch (error) {
        debug("Error removing codesync: " + (error as Error).message);
        console.error('Error removing codesync:', error);
        vscode.window.showErrorMessage('Failed to remove codesync completely. Please manually remove codesync-related entries from .gitattributes and .gitignore.');
    }
}
