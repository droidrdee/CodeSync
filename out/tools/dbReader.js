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
exports.readVSCodeState = readVSCodeState;
const child_process_1 = require("child_process");
const util_1 = require("util");
const debug_1 = require("../debug");
const sync_1 = require("csv-parse/sync");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const writeFileAsync = (0, util_1.promisify)(fs.writeFile);
const readFileAsync = (0, util_1.promisify)(fs.readFile);
/**
 * Parses the VSCode state from the SQLite database.
 */
async function readVSCodeState(dbPath, key) {
    try {
        (0, debug_1.debug)("Reading VSCode state from " + dbPath + " for key: " + key);
        const escapedDbPath = `"${dbPath}"`;
        const tempFilePath = path.join(os.tmpdir(), `vscode_state_${Date.now()}.csv`);
        let sqliteCommand = 'sqlite3';
        if (process.platform === 'win32') {
            (0, debug_1.debug)("Using sqlite3_win.exe");
            sqliteCommand = path.join(__dirname, '..', 'bin', 'sqlite3_win.exe');
        }
        await execAsync(`"${sqliteCommand}" ${escapedDbPath} -readonly -csv "SELECT key, value FROM ItemTable WHERE key = '${key}';" > ${tempFilePath}`);
        const fileContent = await readFileAsync(tempFilePath, 'utf-8');
        const records = (0, sync_1.parse)(fileContent, {
            columns: ['key', 'value'],
            skip_empty_lines: true,
        });
        await fs.promises.unlink(tempFilePath);
        if (records.length === 0) {
            (0, debug_1.debug)("No records found for key: " + key);
            return null;
        }
        return JSON.parse(records[0].value);
    }
    catch (error) {
        (0, debug_1.debug)(`Error querying SQLite DB: ${error}`);
        return null;
    }
}
//# sourceMappingURL=dbReader.js.map