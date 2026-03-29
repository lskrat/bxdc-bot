"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillServiceManager = void 0;
exports.getSkillServiceManager = getSkillServiceManager;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_1 = require("electron");
const deps_1 = require("./deps");
function resolveUserShellPath() {
    if (process.platform === 'win32')
        return null;
    try {
        const shell = process.env.SHELL || '/bin/bash';
        const result = (0, child_process_1.execSync)(`${shell} -lc 'echo __PATH__=$PATH'`, {
            encoding: 'utf-8',
            timeout: 5000,
            env: { ...process.env },
        });
        const match = result.match(/__PATH__=(.+)/);
        return match ? match[1].trim() : null;
    }
    catch (error) {
        console.warn('[SkillServices] Failed to resolve user shell PATH:', error);
        return null;
    }
}
function buildSkillServiceEnv() {
    const env = { ...process.env };
    const electronNodeRuntimePath = (0, deps_1.getElectronNodeRuntimePath)();
    if (electron_1.app.isPackaged) {
        if (!env.HOME) {
            env.HOME = electron_1.app.getPath('home');
        }
        const userPath = resolveUserShellPath();
        if (userPath) {
            env.PATH = userPath;
            console.log('[SkillServices] Resolved user shell PATH for skill services');
        }
        else {
            const commonPaths = [
                '/usr/local/bin',
                '/opt/homebrew/bin',
                `${env.HOME}/.nvm/current/bin`,
                `${env.HOME}/.volta/bin`,
                `${env.HOME}/.fnm/current/bin`,
            ];
            env.PATH = [env.PATH, ...commonPaths].filter(Boolean).join(':');
            console.log('[SkillServices] Using fallback PATH for skill services');
        }
    }
    env.LOBSTERAI_ELECTRON_PATH = electronNodeRuntimePath;
    (0, deps_1.appendPythonRuntimeToEnv)(env);
    return env;
}
class SkillServiceManager {
    webSearchPid = null;
    skillEnv = null;
    hasWebSearchRuntimeScriptSupport(skillPath) {
        const startServerScript = path_1.default.join(skillPath, 'scripts', 'start-server.sh');
        const searchScript = path_1.default.join(skillPath, 'scripts', 'search.sh');
        if (!fs_1.default.existsSync(startServerScript)) {
            return false;
        }
        if (!fs_1.default.existsSync(searchScript)) {
            return false;
        }
        try {
            const startScript = fs_1.default.readFileSync(startServerScript, 'utf-8');
            const searchScriptContent = fs_1.default.readFileSync(searchScript, 'utf-8');
            return startScript.includes('WEB_SEARCH_FORCE_REPAIR')
                && startScript.includes('detect_healthy_bridge_server')
                && searchScriptContent.includes('ACTIVE_SERVER_URL')
                && searchScriptContent.includes('try_switch_to_local_server');
        }
        catch {
            return false;
        }
    }
    hasLegacyWebSearchEncodingHeuristic(serverEntry) {
        try {
            const content = fs_1.default.readFileSync(serverEntry, 'utf-8');
            return content.includes('scoreDecodedJsonText')
                && content.includes('Request body decoded using gb18030 (score');
        }
        catch {
            return true;
        }
    }
    isWebSearchDistOutdated(skillPath) {
        const serverEntry = path_1.default.join(skillPath, 'dist', 'server', 'index.js');
        if (!fs_1.default.existsSync(serverEntry)) {
            return true;
        }
        if (this.hasLegacyWebSearchEncodingHeuristic(serverEntry)) {
            return true;
        }
        const sourceDir = path_1.default.join(skillPath, 'server');
        if (!fs_1.default.existsSync(sourceDir)) {
            return false;
        }
        let distMtimeMs = 0;
        try {
            distMtimeMs = fs_1.default.statSync(serverEntry).mtimeMs;
        }
        catch {
            return true;
        }
        const queue = [sourceDir];
        while (queue.length > 0) {
            const current = queue.pop();
            if (!current)
                continue;
            let entries = [];
            try {
                entries = fs_1.default.readdirSync(current, { withFileTypes: true });
            }
            catch {
                return true;
            }
            for (const entry of entries) {
                const fullPath = path_1.default.join(current, entry.name);
                if (entry.isDirectory()) {
                    queue.push(fullPath);
                    continue;
                }
                if (!entry.isFile() || !entry.name.endsWith('.ts')) {
                    continue;
                }
                try {
                    if (fs_1.default.statSync(fullPath).mtimeMs > distMtimeMs) {
                        return true;
                    }
                }
                catch {
                    return true;
                }
            }
        }
        return false;
    }
    isWebSearchRuntimeHealthy(skillPath) {
        const requiredPaths = [
            path_1.default.join(skillPath, 'scripts', 'start-server.sh'),
            path_1.default.join(skillPath, 'scripts', 'search.sh'),
            path_1.default.join(skillPath, 'dist', 'server', 'index.js'),
            path_1.default.join(skillPath, 'node_modules', 'iconv-lite', 'encodings', 'index.js'),
        ];
        return requiredPaths.every(requiredPath => fs_1.default.existsSync(requiredPath))
            && this.hasWebSearchRuntimeScriptSupport(skillPath)
            && !this.isWebSearchDistOutdated(skillPath);
    }
    hasCommand(command, env) {
        const checker = process.platform === 'win32' ? 'where' : 'which';
        const result = (0, child_process_1.spawnSync)(checker, [command], {
            stdio: 'ignore',
            env,
            windowsHide: process.platform === 'win32',
        });
        return result.status === 0;
    }
    repairWebSearchRuntimeFromBundled(skillPath) {
        if (!electron_1.app.isPackaged)
            return;
        const candidates = [
            path_1.default.join(process.resourcesPath, 'SKILLs', 'web-search'),
            path_1.default.join(electron_1.app.getAppPath(), 'SKILLs', 'web-search'),
        ];
        const bundledPath = candidates.find(candidate => candidate !== skillPath && fs_1.default.existsSync(candidate));
        if (!bundledPath) {
            return;
        }
        try {
            (0, deps_1.cpRecursiveSync)(bundledPath, skillPath, {
                force: true,
            });
            console.log('[SkillServices] Repaired web-search runtime from bundled resources');
        }
        catch (error) {
            console.warn('[SkillServices] Failed to repair web-search runtime from bundled resources:', error);
        }
    }
    resolveNodeRuntime(env) {
        if (this.hasCommand('node', env)) {
            return { command: 'node', args: [] };
        }
        return {
            command: (0, deps_1.getElectronNodeRuntimePath)(),
            args: [],
            extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
        };
    }
    ensureWebSearchRuntimeReady(skillPath) {
        if (this.isWebSearchRuntimeHealthy(skillPath)) {
            return;
        }
        this.repairWebSearchRuntimeFromBundled(skillPath);
        if (this.isWebSearchRuntimeHealthy(skillPath)) {
            return;
        }
        const nodeModules = path_1.default.join(skillPath, 'node_modules');
        const distDir = path_1.default.join(skillPath, 'dist');
        const env = this.skillEnv ?? process.env;
        const npmAvailable = this.hasCommand('npm', env);
        const shouldInstallDeps = !fs_1.default.existsSync(nodeModules) || !this.isWebSearchRuntimeHealthy(skillPath);
        if (shouldInstallDeps) {
            if (!npmAvailable) {
                throw new Error('Web-search runtime is incomplete and npm is not available to repair it');
            }
            console.log('[SkillServices] Installing/reparing web-search dependencies...');
            (0, child_process_1.execSync)('npm install', { cwd: skillPath, stdio: 'ignore', env });
        }
        const shouldCompileDist = !fs_1.default.existsSync(distDir) || this.isWebSearchDistOutdated(skillPath);
        if (shouldCompileDist) {
            if (!npmAvailable) {
                throw new Error('Web-search dist files are missing/outdated and npm is not available to rebuild them');
            }
            console.log('[SkillServices] Compiling web-search TypeScript...');
            (0, child_process_1.execSync)('npm run build', { cwd: skillPath, stdio: 'ignore', env });
        }
        if (!this.isWebSearchRuntimeHealthy(skillPath)) {
            throw new Error('Web-search runtime is still unhealthy after attempted repair');
        }
    }
    async startAll() {
        console.log('[SkillServices] Starting skill services...');
        this.skillEnv = buildSkillServiceEnv();
        try {
            await this.startWebSearchService();
        }
        catch (error) {
            console.error('[SkillServices] Error starting services:', error);
        }
    }
    async stopAll() {
        console.log('[SkillServices] Stopping skill services...');
        try {
            await this.stopWebSearchService();
        }
        catch (error) {
            console.error('[SkillServices] Error stopping services:', error);
        }
    }
    async startWebSearchService() {
        try {
            const skillPath = this.getWebSearchPath();
            if (!skillPath) {
                console.log('[SkillServices] Web Search skill not found, skipping');
                return;
            }
            if (this.isWebSearchServiceRunning()) {
                console.log('[SkillServices] Web Search service already running');
                return;
            }
            console.log('[SkillServices] Starting Web Search Bridge Server...');
            await this.startWebSearchServiceProcess(skillPath);
            await new Promise(resolve => setTimeout(resolve, 3000));
            const pidFile = path_1.default.join(skillPath, '.server.pid');
            if (fs_1.default.existsSync(pidFile)) {
                const pid = parseInt(fs_1.default.readFileSync(pidFile, 'utf-8').trim());
                this.webSearchPid = pid;
                console.log(`[SkillServices] Web Search Bridge Server started (PID: ${pid})`);
            }
            else {
                console.warn('[SkillServices] Web Search Bridge Server may not have started correctly');
            }
        }
        catch (error) {
            console.error('[SkillServices] Failed to start Web Search service:', error);
        }
    }
    async startWebSearchServiceProcess(skillPath) {
        const pidFile = path_1.default.join(skillPath, '.server.pid');
        const logFile = path_1.default.join(skillPath, '.server.log');
        const serverEntry = path_1.default.join(skillPath, 'dist', 'server', 'index.js');
        this.ensureWebSearchRuntimeReady(skillPath);
        const baseEnv = this.skillEnv ?? process.env;
        const runtime = this.resolveNodeRuntime(baseEnv);
        const electronNodeRuntimePath = (0, deps_1.getElectronNodeRuntimePath)();
        const env = {
            ...baseEnv,
            ...(runtime.extraEnv ?? {}),
            LOBSTERAI_ELECTRON_PATH: electronNodeRuntimePath,
        };
        const logFd = fs_1.default.openSync(logFile, 'a');
        let child;
        try {
            child = (0, child_process_1.spawn)(runtime.command, [...runtime.args, serverEntry], {
                cwd: skillPath,
                detached: true,
                stdio: ['ignore', logFd, logFd],
                env,
                windowsHide: process.platform === 'win32',
            });
        }
        finally {
            fs_1.default.closeSync(logFd);
        }
        fs_1.default.writeFileSync(pidFile, child.pid.toString());
        child.unref();
        const runtimeLabel = runtime.command === 'node' ? 'node' : 'electron-node';
        console.log(`[SkillServices] Web Search Bridge Server starting (PID: ${child.pid}, runtime: ${runtimeLabel})`);
        console.log(`[SkillServices] Logs: ${logFile}`);
    }
    async stopWebSearchService() {
        try {
            const skillPath = this.getWebSearchPath();
            if (!skillPath) {
                return;
            }
            if (!this.isWebSearchServiceRunning()) {
                console.log('[SkillServices] Web Search service not running');
                return;
            }
            console.log('[SkillServices] Stopping Web Search Bridge Server...');
            if (this.webSearchPid) {
                try {
                    process.kill(this.webSearchPid, 'SIGTERM');
                }
                catch (error) {
                    console.warn('[SkillServices] Failed to kill process:', error);
                }
            }
            const pidFile = path_1.default.join(skillPath, '.server.pid');
            if (fs_1.default.existsSync(pidFile)) {
                fs_1.default.unlinkSync(pidFile);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('[SkillServices] Web Search Bridge Server stopped');
            this.webSearchPid = null;
        }
        catch (error) {
            console.error('[SkillServices] Failed to stop Web Search service:', error);
        }
    }
    isWebSearchServiceRunning() {
        if (this.webSearchPid === null) {
            const skillPath = this.getWebSearchPath();
            if (!skillPath) {
                return false;
            }
            const pidFile = path_1.default.join(skillPath, '.server.pid');
            if (fs_1.default.existsSync(pidFile)) {
                try {
                    const pid = parseInt(fs_1.default.readFileSync(pidFile, 'utf-8').trim());
                    this.webSearchPid = pid;
                }
                catch (error) {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        try {
            process.kill(this.webSearchPid, 0);
            return true;
        }
        catch (error) {
            this.webSearchPid = null;
            return false;
        }
    }
    getWebSearchPath() {
        const candidates = [];
        if (electron_1.app.isPackaged) {
            candidates.push(path_1.default.join(electron_1.app.getPath('userData'), 'SKILLs', 'web-search'));
            candidates.push(path_1.default.join(process.resourcesPath, 'SKILLs', 'web-search'));
            candidates.push(path_1.default.join(electron_1.app.getAppPath(), 'SKILLs', 'web-search'));
        }
        else {
            const projectRoot = path_1.default.resolve(__dirname, '..', '..', '..');
            candidates.push(path_1.default.join(projectRoot, 'SKILLs', 'web-search'));
            candidates.push(path_1.default.join(electron_1.app.getAppPath(), 'SKILLs', 'web-search'));
        }
        return candidates.find(skillPath => fs_1.default.existsSync(skillPath)) ?? null;
    }
    getStatus() {
        return {
            webSearch: this.isWebSearchServiceRunning()
        };
    }
    async checkWebSearchHealth() {
        try {
            const response = await fetch('http://127.0.0.1:8923/api/health', {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        }
        catch (error) {
            return false;
        }
    }
}
exports.SkillServiceManager = SkillServiceManager;
let serviceManager = null;
function getSkillServiceManager() {
    if (!serviceManager) {
        serviceManager = new SkillServiceManager();
    }
    return serviceManager;
}
//# sourceMappingURL=serviceManager.js.map