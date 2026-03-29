"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__skillManagerTestUtils = exports.SkillManager = void 0;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const extract_zip_1 = __importDefault(require("extract-zip"));
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
        console.warn('[skills] Failed to resolve user shell PATH:', error);
        return null;
    }
}
function hasCommand(command, env) {
    const isWin = process.platform === 'win32';
    const checker = isWin ? 'where' : 'which';
    const result = (0, child_process_1.spawnSync)(checker, [command], {
        stdio: 'pipe',
        env,
        shell: isWin,
        timeout: 5000,
    });
    if (result.status !== 0) {
        console.log(`[skills] hasCommand('${command}'): not found (status=${result.status}, error=${result.error?.message || 'none'})`);
    }
    return result.status === 0;
}
function normalizePathKey(env) {
    if (process.platform !== 'win32')
        return;
    const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === 'path');
    if (pathKeys.length <= 1)
        return;
    const seen = new Set();
    const merged = [];
    for (const key of pathKeys) {
        const value = env[key];
        if (!value)
            continue;
        for (const entry of value.split(';')) {
            const trimmed = entry.trim();
            if (!trimmed)
                continue;
            const normalized = trimmed.toLowerCase().replace(/[\\/]+$/, '');
            if (seen.has(normalized))
                continue;
            seen.add(normalized);
            merged.push(trimmed);
        }
        if (key !== 'PATH') {
            delete env[key];
        }
    }
    env.PATH = merged.join(';');
}
function resolveWindowsRegistryPath() {
    if (process.platform !== 'win32')
        return null;
    try {
        const machinePath = (0, child_process_1.execSync)('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path', { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const userPath = (0, child_process_1.execSync)('reg query "HKCU\\Environment" /v Path', { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const extract = (output) => {
            const match = output.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
            return match ? match[1].trim() : '';
        };
        const combined = [extract(machinePath), extract(userPath)].filter(Boolean).join(';');
        return combined || null;
    }
    catch {
        return null;
    }
}
function buildSkillEnv() {
    const env = { ...process.env };
    normalizePathKey(env);
    if (electron_1.app.isPackaged) {
        if (!env.HOME) {
            env.HOME = electron_1.app.getPath('home');
        }
        if (process.platform === 'win32') {
            const registryPath = resolveWindowsRegistryPath();
            if (registryPath) {
                const currentPath = env.PATH || '';
                const seen = new Set(currentPath.toLowerCase().split(';').map(s => s.trim().replace(/[\\/]+$/, '')).filter(Boolean));
                const extra = [];
                for (const entry of registryPath.split(';')) {
                    const trimmed = entry.trim();
                    if (!trimmed)
                        continue;
                    const key = trimmed.toLowerCase().replace(/[\\/]+$/, '');
                    if (!seen.has(key)) {
                        seen.add(key);
                        extra.push(trimmed);
                    }
                }
                if (extra.length > 0) {
                    env.PATH = currentPath ? `${currentPath};${extra.join(';')}` : extra.join(';');
                    console.log('[skills] Merged registry PATH entries for skill scripts');
                }
            }
            const commonWinPaths = [
                'C:\\Program Files\\nodejs',
                'C:\\Program Files (x86)\\nodejs',
                `${env.APPDATA || ''}\\npm`,
                `${env.LOCALAPPDATA || ''}\\Programs\\nodejs`,
            ].filter(Boolean);
            const pathSet = new Set((env.PATH || '').toLowerCase().split(';').map(s => s.trim().replace(/[\\/]+$/, '')));
            const missingPaths = commonWinPaths.filter(p => !pathSet.has(p.toLowerCase().replace(/[\\/]+$/, '')));
            if (missingPaths.length > 0) {
                env.PATH = env.PATH ? `${env.PATH};${missingPaths.join(';')}` : missingPaths.join(';');
            }
        }
        else {
            const userPath = resolveUserShellPath();
            if (userPath) {
                env.PATH = userPath;
                console.log('[skills] Resolved user shell PATH for skill scripts');
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
                console.log('[skills] Using fallback PATH for skill scripts');
            }
        }
    }
    env.LOBSTERAI_ELECTRON_PATH = (0, deps_1.getElectronNodeRuntimePath)();
    (0, deps_1.appendPythonRuntimeToEnv)(env);
    normalizePathKey(env);
    return env;
}
const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_FILE_NAME = 'SKILL.md';
const SKILLS_CONFIG_FILE = 'skills.config.json';
const SKILL_STATE_KEY = 'skills_state';
const WATCH_DEBOUNCE_MS = 250;
const CLAUDE_SKILLS_DIR_NAME = '.claude';
const CLAUDE_SKILLS_SUBDIR = 'skills';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const parseFrontmatter = (raw) => {
    const normalized = raw.replace(/^\uFEFF/, '');
    const match = normalized.match(FRONTMATTER_RE);
    if (!match) {
        return { frontmatter: {}, content: normalized };
    }
    let frontmatter = {};
    try {
        const parsed = js_yaml_1.default.load(match[1]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed;
        }
    }
    catch (e) {
        console.warn('[skills] Failed to parse YAML frontmatter:', e);
    }
    const content = normalized.slice(match[0].length);
    return { frontmatter, content };
};
const isTruthy = (value) => {
    if (value === true)
        return true;
    if (!value)
        return false;
    if (typeof value !== 'string')
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
};
const extractDescription = (content) => {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        return trimmed.replace(/^#+\s*/, '');
    }
    return '';
};
const normalizeFolderName = (name) => {
    const normalized = name.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'skill';
};
const isZipFile = (filePath) => path_1.default.extname(filePath).toLowerCase() === '.zip';
const compareVersions = (a, b) => {
    const pa = a.split('.').map(s => parseInt(s, 10) || 0);
    const pb = b.split('.').map(s => parseInt(s, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb)
            return 1;
        if (na < nb)
            return -1;
    }
    return 0;
};
const resolveWithin = (root, target) => {
    const resolvedRoot = path_1.default.resolve(root);
    const resolvedTarget = path_1.default.resolve(root, target);
    if (resolvedTarget === resolvedRoot)
        return resolvedTarget;
    if (!resolvedTarget.startsWith(resolvedRoot + path_1.default.sep)) {
        throw new Error('Invalid target path');
    }
    return resolvedTarget;
};
const appendEnvPath = (current, entries) => {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const existing = (current || '').split(delimiter).filter(Boolean);
    const merged = [...existing];
    entries.forEach(entry => {
        if (!entry || merged.includes(entry))
            return;
        merged.push(entry);
    });
    return merged.join(delimiter);
};
const listWindowsCommandPaths = (command) => {
    if (process.platform !== 'win32')
        return [];
    try {
        const result = (0, child_process_1.spawnSync)('cmd.exe', ['/d', '/s', '/c', command], {
            encoding: 'utf8',
            windowsHide: true,
        });
        if (result.status !== 0)
            return [];
        return result.stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }
    catch {
        return [];
    }
};
const resolveWindowsGitExecutable = () => {
    if (process.platform !== 'win32')
        return null;
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const installedCandidates = [
        path_1.default.join(programFiles, 'Git', 'cmd', 'git.exe'),
        path_1.default.join(programFiles, 'Git', 'bin', 'git.exe'),
        path_1.default.join(programFilesX86, 'Git', 'cmd', 'git.exe'),
        path_1.default.join(programFilesX86, 'Git', 'bin', 'git.exe'),
        path_1.default.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
        path_1.default.join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
        path_1.default.join(userProfile, 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
        path_1.default.join(userProfile, 'scoop', 'apps', 'git', 'current', 'bin', 'git.exe'),
        'C:\\Git\\cmd\\git.exe',
        'C:\\Git\\bin\\git.exe',
    ];
    for (const candidate of installedCandidates) {
        if (candidate && fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    const whereCandidates = listWindowsCommandPaths('where git');
    for (const candidate of whereCandidates) {
        const normalized = candidate.trim();
        if (!normalized)
            continue;
        if (normalized.toLowerCase().endsWith('git.exe') && fs_1.default.existsSync(normalized)) {
            return normalized;
        }
    }
    const bundledRoots = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'mingit')]
        : [
            path_1.default.join(__dirname, '..', '..', '..', 'resources', 'mingit'),
            path_1.default.join(process.cwd(), 'resources', 'mingit'),
        ];
    for (const root of bundledRoots) {
        const bundledCandidates = [
            path_1.default.join(root, 'cmd', 'git.exe'),
            path_1.default.join(root, 'bin', 'git.exe'),
            path_1.default.join(root, 'mingw64', 'bin', 'git.exe'),
            path_1.default.join(root, 'usr', 'bin', 'git.exe'),
        ];
        for (const candidate of bundledCandidates) {
            if (fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
};
const resolveGitCommand = () => {
    if (process.platform !== 'win32') {
        return { command: 'git' };
    }
    const gitExe = resolveWindowsGitExecutable();
    if (!gitExe) {
        return { command: 'git' };
    }
    const env = { ...process.env };
    const gitDir = path_1.default.dirname(gitExe);
    const gitRoot = path_1.default.dirname(gitDir);
    const candidateDirs = [
        gitDir,
        path_1.default.join(gitRoot, 'cmd'),
        path_1.default.join(gitRoot, 'bin'),
        path_1.default.join(gitRoot, 'mingw64', 'bin'),
        path_1.default.join(gitRoot, 'usr', 'bin'),
    ].filter(dir => fs_1.default.existsSync(dir));
    env.PATH = appendEnvPath(env.PATH, candidateDirs);
    return { command: gitExe, env };
};
const runCommand = (command, args, options) => new Promise((resolve, reject) => {
    const child = (0, child_process_1.spawn)(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr += chunk.toString();
    });
    child.on('error', error => reject(error));
    child.on('close', code => {
        if (code === 0) {
            resolve();
            return;
        }
        reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
    });
});
const runScriptWithTimeout = (options) => new Promise((resolve) => {
    const startedAt = Date.now();
    const child = (0, child_process_1.spawn)(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let forceKillTimer = null;
    const settle = (result) => {
        if (settled)
            return;
        settled = true;
        resolve(result);
    };
    const timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
            child.kill('SIGKILL');
        }, 2000);
    }, options.timeoutMs);
    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });
    child.on('error', (error) => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer)
            clearTimeout(forceKillTimer);
        settle({
            success: false,
            exitCode: null,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs: Date.now() - startedAt,
            timedOut,
            error: error.message,
            spawnErrorCode: error.code,
        });
    });
    child.on('close', (exitCode) => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer)
            clearTimeout(forceKillTimer);
        settle({
            success: !timedOut && exitCode === 0,
            exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs: Date.now() - startedAt,
            timedOut,
            error: timedOut ? `Command timed out after ${options.timeoutMs}ms` : undefined,
        });
    });
});
const cleanupPathSafely = (targetPath) => {
    if (!targetPath)
        return;
    try {
        fs_1.default.rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: process.platform === 'win32' ? 5 : 0,
            retryDelay: process.platform === 'win32' ? 200 : 0,
        });
    }
    catch (error) {
        console.warn('[skills] Failed to cleanup temporary directory:', targetPath, error);
    }
};
const listSkillDirs = (root) => {
    if (!fs_1.default.existsSync(root))
        return [];
    const skillFile = path_1.default.join(root, SKILL_FILE_NAME);
    if (fs_1.default.existsSync(skillFile)) {
        return [root];
    }
    const entries = fs_1.default.readdirSync(root);
    return entries
        .map(entry => path_1.default.join(root, entry))
        .filter((entryPath) => {
        try {
            const stat = fs_1.default.lstatSync(entryPath);
            if (!stat.isDirectory() && !stat.isSymbolicLink()) {
                return false;
            }
            return fs_1.default.existsSync(path_1.default.join(entryPath, SKILL_FILE_NAME));
        }
        catch {
            return false;
        }
    });
};
const collectSkillDirsFromSource = (source) => {
    const resolved = path_1.default.resolve(source);
    if (fs_1.default.existsSync(path_1.default.join(resolved, SKILL_FILE_NAME))) {
        return [resolved];
    }
    const nestedRoot = path_1.default.join(resolved, SKILLS_DIR_NAME);
    if (fs_1.default.existsSync(nestedRoot) && fs_1.default.statSync(nestedRoot).isDirectory()) {
        const nestedSkills = listSkillDirs(nestedRoot);
        if (nestedSkills.length > 0) {
            return nestedSkills;
        }
    }
    const directSkills = listSkillDirs(resolved);
    if (directSkills.length > 0) {
        return directSkills;
    }
    return collectSkillDirsRecursively(resolved);
};
const collectSkillDirsRecursively = (root) => {
    const resolvedRoot = path_1.default.resolve(root);
    if (!fs_1.default.existsSync(resolvedRoot))
        return [];
    const matchedDirs = [];
    const queue = [resolvedRoot];
    const seen = new Set();
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current)
            continue;
        const normalized = path_1.default.resolve(current);
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        let stat;
        try {
            stat = fs_1.default.lstatSync(normalized);
        }
        catch {
            continue;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink())
            continue;
        if (fs_1.default.existsSync(path_1.default.join(normalized, SKILL_FILE_NAME))) {
            matchedDirs.push(normalized);
            continue;
        }
        let entries = [];
        try {
            entries = fs_1.default.readdirSync(normalized);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry || entry === '.git' || entry === 'node_modules')
                continue;
            queue.push(path_1.default.join(normalized, entry));
        }
    }
    return matchedDirs;
};
const deriveRepoName = (source) => {
    const cleaned = source.replace(/[#?].*$/, '');
    const base = cleaned.split('/').filter(Boolean).pop() || 'skill';
    return normalizeFolderName(base.replace(/\.git$/, ''));
};
const extractErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
const parseGithubRepoSource = (repoUrl) => {
    const trimmed = repoUrl.trim();
    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (sshMatch) {
        return {
            owner: sshMatch[1],
            repo: sshMatch[2],
        };
    }
    try {
        const parsedUrl = new URL(trimmed);
        if (!['github.com', 'www.github.com'].includes(parsedUrl.hostname.toLowerCase())) {
            return null;
        }
        const segments = parsedUrl.pathname
            .replace(/\.git$/i, '')
            .split('/')
            .filter(Boolean);
        if (segments.length < 2) {
            return null;
        }
        return {
            owner: segments[0],
            repo: segments[1],
        };
    }
    catch {
        return null;
    }
};
const downloadGithubArchive = async (source, tempRoot, ref) => {
    const encodedRef = ref ? encodeURIComponent(ref) : '';
    const archiveUrlCandidates = [];
    if (encodedRef) {
        archiveUrlCandidates.push({
            url: `https://github.com/${source.owner}/${source.repo}/archive/refs/heads/${encodedRef}.zip`,
            headers: { 'User-Agent': 'LobsterAI Skill Downloader' },
        }, {
            url: `https://github.com/${source.owner}/${source.repo}/archive/refs/tags/${encodedRef}.zip`,
            headers: { 'User-Agent': 'LobsterAI Skill Downloader' },
        }, {
            url: `https://github.com/${source.owner}/${source.repo}/archive/${encodedRef}.zip`,
            headers: { 'User-Agent': 'LobsterAI Skill Downloader' },
        });
    }
    archiveUrlCandidates.push({
        url: `https://api.github.com/repos/${source.owner}/${source.repo}/zipball${encodedRef ? `/${encodedRef}` : ''}`,
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'LobsterAI Skill Downloader',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    let buffer = null;
    let lastError = null;
    for (const candidate of archiveUrlCandidates) {
        try {
            const response = await electron_1.session.defaultSession.fetch(candidate.url, {
                method: 'GET',
                headers: candidate.headers,
            });
            if (!response.ok) {
                const detail = (await response.text()).trim();
                lastError = `Archive download failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`;
                continue;
            }
            buffer = Buffer.from(await response.arrayBuffer());
            break;
        }
        catch (error) {
            lastError = extractErrorMessage(error);
        }
    }
    if (!buffer) {
        throw new Error(lastError || 'Archive download failed');
    }
    const zipPath = path_1.default.join(tempRoot, 'github-archive.zip');
    const extractRoot = path_1.default.join(tempRoot, 'github-archive');
    fs_1.default.writeFileSync(zipPath, buffer);
    fs_1.default.mkdirSync(extractRoot, { recursive: true });
    await (0, extract_zip_1.default)(zipPath, { dir: extractRoot });
    const extractedDirs = fs_1.default.readdirSync(extractRoot)
        .map(entry => path_1.default.join(extractRoot, entry))
        .filter(entryPath => {
        try {
            return fs_1.default.statSync(entryPath).isDirectory();
        }
        catch {
            return false;
        }
    });
    if (extractedDirs.length === 1) {
        return extractedDirs[0];
    }
    return extractRoot;
};
const isRemoteZipUrl = (source) => {
    try {
        const url = new URL(source);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && url.pathname.toLowerCase().endsWith('.zip');
    }
    catch {
        return false;
    }
};
const downloadZipUrl = async (zipUrl, tempRoot) => {
    const response = await electron_1.session.defaultSession.fetch(zipUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'LobsterAI Skill Downloader' },
    });
    if (!response.ok) {
        throw new Error(`Download failed (${response.status} ${response.statusText})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const zipPath = path_1.default.join(tempRoot, 'remote-skill.zip');
    const extractRoot = path_1.default.join(tempRoot, 'remote-skill');
    fs_1.default.writeFileSync(zipPath, buffer);
    fs_1.default.mkdirSync(extractRoot, { recursive: true });
    await (0, extract_zip_1.default)(zipPath, { dir: extractRoot });
    const extractedDirs = fs_1.default.readdirSync(extractRoot)
        .map(entry => path_1.default.join(extractRoot, entry))
        .filter(entryPath => {
        try {
            return fs_1.default.statSync(entryPath).isDirectory();
        }
        catch {
            return false;
        }
    });
    if (extractedDirs.length === 1) {
        return extractedDirs[0];
    }
    return extractRoot;
};
const normalizeGithubSubpath = (value) => {
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
    if (!trimmed)
        return null;
    const segments = trimmed
        .split('/')
        .filter(Boolean)
        .map(segment => {
        try {
            return decodeURIComponent(segment);
        }
        catch {
            return segment;
        }
    });
    if (segments.some(segment => segment === '.' || segment === '..')) {
        return null;
    }
    return segments.join('/');
};
const parseGithubTreeOrBlobUrl = (source) => {
    try {
        const parsedUrl = new URL(source);
        if (!['github.com', 'www.github.com'].includes(parsedUrl.hostname)) {
            return null;
        }
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        if (segments.length < 5) {
            return null;
        }
        const [owner, repoRaw, mode, ref, ...rest] = segments;
        if (!owner || !repoRaw || !ref || (mode !== 'tree' && mode !== 'blob')) {
            return null;
        }
        const repo = repoRaw.replace(/\.git$/i, '');
        const sourceSubpath = normalizeGithubSubpath(rest.join('/'));
        if (!repo || !sourceSubpath) {
            return null;
        }
        return {
            repoUrl: `https://github.com/${owner}/${repo}.git`,
            sourceSubpath,
            ref: decodeURIComponent(ref),
            repoNameHint: repo,
        };
    }
    catch {
        return null;
    }
};
const isWebSearchSkillBroken = (skillRoot) => {
    const startServerScript = path_1.default.join(skillRoot, 'scripts', 'start-server.sh');
    const searchScript = path_1.default.join(skillRoot, 'scripts', 'search.sh');
    const serverEntry = path_1.default.join(skillRoot, 'dist', 'server', 'index.js');
    const requiredPaths = [
        startServerScript,
        searchScript,
        serverEntry,
        path_1.default.join(skillRoot, 'node_modules', 'iconv-lite', 'encodings', 'index.js'),
    ];
    if (requiredPaths.some(requiredPath => !fs_1.default.existsSync(requiredPath))) {
        return true;
    }
    try {
        const startScript = fs_1.default.readFileSync(startServerScript, 'utf-8');
        const searchScriptContent = fs_1.default.readFileSync(searchScript, 'utf-8');
        const serverEntryContent = fs_1.default.readFileSync(serverEntry, 'utf-8');
        if (!startScript.includes('WEB_SEARCH_FORCE_REPAIR')) {
            return true;
        }
        if (!startScript.includes('detect_healthy_bridge_server')) {
            return true;
        }
        if (!searchScriptContent.includes('ACTIVE_SERVER_URL')) {
            return true;
        }
        if (!searchScriptContent.includes('try_switch_to_local_server')) {
            return true;
        }
        if (!searchScriptContent.includes('build_search_payload')) {
            return true;
        }
        if (!searchScriptContent.includes('@query_file')) {
            return true;
        }
        if (!serverEntryContent.includes('decodeJsonRequestBody')) {
            return true;
        }
        if (!serverEntryContent.includes("TextDecoder('gb18030'")) {
            return true;
        }
        if (serverEntryContent.includes('scoreDecodedJsonText') && serverEntryContent.includes('Request body decoded using gb18030 (score')) {
            return true;
        }
    }
    catch {
        return true;
    }
    return false;
};
class SkillManager {
    getStore;
    watchers = [];
    notifyTimer = null;
    constructor(getStore) {
        this.getStore = getStore;
    }
    getSkillsRoot() {
        return path_1.default.resolve(electron_1.app.getPath('userData'), SKILLS_DIR_NAME);
    }
    ensureSkillsRoot() {
        const root = this.getSkillsRoot();
        if (!fs_1.default.existsSync(root)) {
            fs_1.default.mkdirSync(root, { recursive: true });
        }
        return root;
    }
    syncBundledSkillsToUserData() {
        if (!electron_1.app.isPackaged) {
            return;
        }
        console.log('[skills] syncBundledSkillsToUserData: start');
        const userRoot = this.ensureSkillsRoot();
        console.log('[skills] syncBundledSkillsToUserData: userRoot =', userRoot);
        const bundledRoot = this.getBundledSkillsRoot();
        console.log('[skills] syncBundledSkillsToUserData: bundledRoot =', bundledRoot);
        if (!bundledRoot || bundledRoot === userRoot || !fs_1.default.existsSync(bundledRoot)) {
            console.log('[skills] syncBundledSkillsToUserData: bundledRoot skipped (missing or same as userRoot)');
            return;
        }
        try {
            const bundledSkillDirs = listSkillDirs(bundledRoot);
            console.log('[skills] syncBundledSkillsToUserData: found', bundledSkillDirs.length, 'bundled skills');
            bundledSkillDirs.forEach((dir) => {
                const id = path_1.default.basename(dir);
                const targetDir = path_1.default.join(userRoot, id);
                const targetExists = fs_1.default.existsSync(targetDir);
                let shouldRepair = false;
                let needsCleanCopy = false;
                if (targetExists) {
                    const bundledVer = this.getSkillVersion(dir);
                    if (bundledVer && compareVersions(bundledVer, this.getSkillVersion(targetDir) || '0.0.0') > 0) {
                        shouldRepair = true;
                        needsCleanCopy = true;
                    }
                    else if (id === 'web-search' && isWebSearchSkillBroken(targetDir)) {
                        shouldRepair = true;
                    }
                    else if (!this.isSkillRuntimeHealthy(targetDir, dir)) {
                        shouldRepair = true;
                    }
                }
                if (targetExists && !shouldRepair)
                    return;
                try {
                    console.log(`[skills] syncBundledSkillsToUserData: copying "${id}" from ${dir} to ${targetDir}`);
                    let envBackup = null;
                    const envPath = path_1.default.join(targetDir, '.env');
                    if (needsCleanCopy && fs_1.default.existsSync(envPath)) {
                        envBackup = fs_1.default.readFileSync(envPath);
                    }
                    if (needsCleanCopy) {
                        fs_1.default.rmSync(targetDir, { recursive: true, force: true });
                    }
                    (0, deps_1.cpRecursiveSync)(dir, targetDir, {
                        dereference: true,
                        force: shouldRepair,
                    });
                    if (envBackup !== null) {
                        fs_1.default.writeFileSync(envPath, envBackup);
                    }
                    console.log(`[skills] syncBundledSkillsToUserData: copied "${id}" successfully`);
                    if (shouldRepair) {
                        console.log(`[skills] Repaired bundled skill "${id}" in user data`);
                    }
                }
                catch (error) {
                    console.warn(`[skills] Failed to sync bundled skill "${id}":`, error);
                }
            });
            const bundledConfig = path_1.default.join(bundledRoot, SKILLS_CONFIG_FILE);
            const targetConfig = path_1.default.join(userRoot, SKILLS_CONFIG_FILE);
            if (fs_1.default.existsSync(bundledConfig)) {
                if (!fs_1.default.existsSync(targetConfig)) {
                    console.log('[skills] syncBundledSkillsToUserData: copying skills.config.json');
                    (0, deps_1.cpRecursiveSync)(bundledConfig, targetConfig);
                }
                else {
                    this.mergeSkillsConfig(bundledConfig, targetConfig);
                }
            }
            console.log('[skills] syncBundledSkillsToUserData: done');
        }
        catch (error) {
            console.warn('[skills] Failed to sync bundled skills:', error);
        }
    }
    isSkillRuntimeHealthy(targetDir, bundledDir) {
        const bundledNodeModules = path_1.default.join(bundledDir, 'node_modules');
        const targetNodeModules = path_1.default.join(targetDir, 'node_modules');
        const targetPackageJson = path_1.default.join(targetDir, 'package.json');
        if (!fs_1.default.existsSync(targetPackageJson)) {
            return true;
        }
        if (!fs_1.default.existsSync(bundledNodeModules)) {
            return true;
        }
        if (!fs_1.default.existsSync(targetNodeModules)) {
            return false;
        }
        return true;
    }
    getSkillVersion(skillDir) {
        try {
            const raw = fs_1.default.readFileSync(path_1.default.join(skillDir, SKILL_FILE_NAME), 'utf8');
            const { frontmatter } = parseFrontmatter(raw);
            return typeof frontmatter.version === 'string' ? frontmatter.version
                : typeof frontmatter.version === 'number' ? String(frontmatter.version)
                    : '';
        }
        catch {
            return '';
        }
    }
    mergeSkillsConfig(bundledPath, targetPath) {
        try {
            const bundled = JSON.parse(fs_1.default.readFileSync(bundledPath, 'utf-8'));
            const target = JSON.parse(fs_1.default.readFileSync(targetPath, 'utf-8'));
            if (!bundled.defaults || !target.defaults)
                return;
            let changed = false;
            for (const [id, config] of Object.entries(bundled.defaults)) {
                if (!(id in target.defaults)) {
                    target.defaults[id] = config;
                    changed = true;
                }
            }
            if (changed) {
                const tmpPath = targetPath + '.tmp';
                fs_1.default.writeFileSync(tmpPath, JSON.stringify(target, null, 2) + '\n', 'utf-8');
                fs_1.default.renameSync(tmpPath, targetPath);
                console.log('[skills] mergeSkillsConfig: merged new skill entries into user config');
            }
        }
        catch (e) {
            console.warn('[skills] Failed to merge skills config:', e);
        }
    }
    listSkills() {
        const primaryRoot = this.ensureSkillsRoot();
        const state = this.loadSkillStateMap();
        const roots = this.getSkillRoots(primaryRoot);
        const orderedRoots = roots.filter(root => root !== primaryRoot).concat(primaryRoot);
        const defaults = this.loadSkillsDefaults(roots);
        const builtInSkillIds = this.listBuiltInSkillIds();
        const skillMap = new Map();
        orderedRoots.forEach(root => {
            if (!fs_1.default.existsSync(root))
                return;
            const skillDirs = listSkillDirs(root);
            skillDirs.forEach(dir => {
                const skill = this.parseSkillDir(dir, state, defaults, builtInSkillIds.has(path_1.default.basename(dir)));
                if (!skill)
                    return;
                skillMap.set(skill.id, skill);
            });
        });
        const skills = Array.from(skillMap.values());
        skills.sort((a, b) => {
            const orderA = defaults[a.id]?.order ?? 999;
            const orderB = defaults[b.id]?.order ?? 999;
            if (orderA !== orderB)
                return orderA - orderB;
            return a.name.localeCompare(b.name);
        });
        return skills;
    }
    buildAutoRoutingPrompt() {
        const skills = this.listSkills();
        const enabled = skills.filter(s => s.enabled && s.prompt);
        if (enabled.length === 0)
            return null;
        const skillEntries = enabled
            .map(s => `  <skill><id>${s.id}</id><name>${s.name}</name><description>${s.description}</description><location>${s.skillPath}</location></skill>`)
            .join('\n');
        return [
            '## Skills (mandatory)',
            'Before replying: scan <available_skills> <description> entries.',
            '- If exactly one skill clearly applies: read its SKILL.md at <location> with the Read tool, then follow it.',
            '- If multiple could apply: choose the most specific one, then read/follow it.',
            '- If none clearly apply: do not read any SKILL.md.',
            '- IMPORTANT: If a description contains "Do NOT use" constraints, strictly respect them. If the user\'s request falls into a "Do NOT" category, treat that skill as non-matching — do NOT read its SKILL.md.',
            '- For the selected skill, treat <location> as the canonical SKILL.md path.',
            '- Resolve relative paths mentioned by that SKILL.md against its directory (dirname(<location>)), not the workspace root.',
            'Constraints: never read more than one skill up front; only read additional skills if the first one explicitly references them.',
            '',
            '<available_skills>',
            skillEntries,
            '</available_skills>',
        ].join('\n');
    }
    setSkillEnabled(id, enabled) {
        const state = this.loadSkillStateMap();
        state[id] = { enabled };
        this.saveSkillStateMap(state);
        this.notifySkillsChanged();
        return this.listSkills();
    }
    deleteSkill(id) {
        const root = this.ensureSkillsRoot();
        if (id !== path_1.default.basename(id)) {
            throw new Error('Invalid skill id');
        }
        if (this.isBuiltInSkillId(id)) {
            throw new Error('Built-in skills cannot be deleted');
        }
        const targetDir = resolveWithin(root, id);
        if (!fs_1.default.existsSync(targetDir)) {
            throw new Error('Skill not found');
        }
        fs_1.default.rmSync(targetDir, { recursive: true, force: true });
        const state = this.loadSkillStateMap();
        delete state[id];
        this.saveSkillStateMap(state);
        this.startWatching();
        this.notifySkillsChanged();
        return this.listSkills();
    }
    async downloadSkill(source) {
        let cleanupPath = null;
        try {
            const trimmed = source.trim();
            if (!trimmed) {
                return { success: false, error: 'Missing skill source' };
            }
            const root = this.ensureSkillsRoot();
            let localSource = trimmed;
            if (fs_1.default.existsSync(localSource)) {
                const stat = fs_1.default.statSync(localSource);
                if (stat.isFile()) {
                    if (isZipFile(localSource)) {
                        const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-zip-'));
                        await (0, extract_zip_1.default)(localSource, { dir: tempRoot });
                        localSource = tempRoot;
                        cleanupPath = tempRoot;
                    }
                    else if (path_1.default.basename(localSource) === SKILL_FILE_NAME) {
                        localSource = path_1.default.dirname(localSource);
                    }
                    else {
                        return { success: false, error: 'Skill source must be a directory, zip file, or SKILL.md file' };
                    }
                }
            }
            else if (isRemoteZipUrl(trimmed)) {
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-zip-'));
                cleanupPath = tempRoot;
                localSource = await downloadZipUrl(trimmed, tempRoot);
            }
            else {
                const normalized = this.normalizeGitSource(trimmed);
                if (!normalized) {
                    return { success: false, error: 'Invalid skill source. Use owner/repo, repo URL, or a GitHub tree/blob URL.' };
                }
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-'));
                cleanupPath = tempRoot;
                const repoName = normalizeFolderName(normalized.repoNameHint || deriveRepoName(normalized.repoUrl));
                const clonePath = path_1.default.join(tempRoot, repoName);
                const cloneArgs = ['clone', '--depth', '1'];
                if (normalized.ref) {
                    cloneArgs.push('--branch', normalized.ref);
                }
                cloneArgs.push(normalized.repoUrl, clonePath);
                const gitRuntime = resolveGitCommand();
                const githubSource = parseGithubRepoSource(normalized.repoUrl);
                let downloadedSourceRoot = clonePath;
                try {
                    await runCommand(gitRuntime.command, cloneArgs, { env: gitRuntime.env });
                }
                catch (error) {
                    const errno = error?.code;
                    if (githubSource) {
                        try {
                            downloadedSourceRoot = await downloadGithubArchive(githubSource, tempRoot, normalized.ref);
                        }
                        catch (archiveError) {
                            const gitMessage = extractErrorMessage(error);
                            const archiveMessage = extractErrorMessage(archiveError);
                            if (errno === 'ENOENT' && process.platform === 'win32') {
                                throw new Error('Git executable not found. Please install Git for Windows or reinstall LobsterAI with bundled PortableGit.'
                                    + ` Archive fallback also failed: ${archiveMessage}`);
                            }
                            throw new Error(`Git clone failed: ${gitMessage}. Archive fallback failed: ${archiveMessage}`);
                        }
                    }
                    else if (errno === 'ENOENT' && process.platform === 'win32') {
                        throw new Error('Git executable not found. Please install Git for Windows or reinstall LobsterAI with bundled PortableGit.');
                    }
                    else {
                        throw error;
                    }
                }
                if (normalized.sourceSubpath) {
                    const scopedSource = resolveWithin(downloadedSourceRoot, normalized.sourceSubpath);
                    if (!fs_1.default.existsSync(scopedSource)) {
                        return { success: false, error: `Path "${normalized.sourceSubpath}" not found in repository` };
                    }
                    const scopedStat = fs_1.default.statSync(scopedSource);
                    if (scopedStat.isFile()) {
                        if (path_1.default.basename(scopedSource) === SKILL_FILE_NAME) {
                            localSource = path_1.default.dirname(scopedSource);
                        }
                        else {
                            return { success: false, error: 'GitHub path must point to a directory or SKILL.md file' };
                        }
                    }
                    else {
                        localSource = scopedSource;
                    }
                }
                else {
                    localSource = downloadedSourceRoot;
                }
            }
            const skillDirs = collectSkillDirsFromSource(localSource);
            if (skillDirs.length === 0) {
                cleanupPathSafely(cleanupPath);
                cleanupPath = null;
                return { success: false, error: 'No SKILL.md found in source' };
            }
            for (const skillDir of skillDirs) {
                const folderName = normalizeFolderName(path_1.default.basename(skillDir));
                let targetDir = resolveWithin(root, folderName);
                let suffix = 1;
                while (fs_1.default.existsSync(targetDir)) {
                    targetDir = resolveWithin(root, `${folderName}-${suffix}`);
                    suffix += 1;
                }
                (0, deps_1.cpRecursiveSync)(skillDir, targetDir);
            }
            cleanupPathSafely(cleanupPath);
            cleanupPath = null;
            this.startWatching();
            this.notifySkillsChanged();
            return { success: true, skills: this.listSkills() };
        }
        catch (error) {
            cleanupPathSafely(cleanupPath);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to download skill' };
        }
    }
    startWatching() {
        this.stopWatching();
        const primaryRoot = this.ensureSkillsRoot();
        const roots = this.getSkillRoots(primaryRoot);
        const watchHandler = () => this.scheduleNotify();
        roots.forEach(root => {
            if (!fs_1.default.existsSync(root))
                return;
            try {
                this.watchers.push(fs_1.default.watch(root, watchHandler));
            }
            catch (error) {
                console.warn('[skills] Failed to watch skills root:', root, error);
            }
            const skillDirs = listSkillDirs(root);
            skillDirs.forEach(dir => {
                try {
                    this.watchers.push(fs_1.default.watch(dir, watchHandler));
                }
                catch (error) {
                    console.warn('[skills] Failed to watch skill directory:', dir, error);
                }
            });
        });
    }
    stopWatching() {
        this.watchers.forEach(watcher => watcher.close());
        this.watchers = [];
        if (this.notifyTimer) {
            clearTimeout(this.notifyTimer);
            this.notifyTimer = null;
        }
    }
    handleWorkingDirectoryChange() {
        this.startWatching();
        this.notifySkillsChanged();
    }
    scheduleNotify() {
        if (this.notifyTimer) {
            clearTimeout(this.notifyTimer);
        }
        this.notifyTimer = setTimeout(() => {
            this.startWatching();
            this.notifySkillsChanged();
        }, WATCH_DEBOUNCE_MS);
    }
    notifySkillsChanged() {
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('skills:changed');
            }
        });
    }
    parseSkillDir(dir, state, defaults, isBuiltIn) {
        const skillFile = path_1.default.join(dir, SKILL_FILE_NAME);
        if (!fs_1.default.existsSync(skillFile))
            return null;
        try {
            const raw = fs_1.default.readFileSync(skillFile, 'utf8');
            const { frontmatter, content } = parseFrontmatter(raw);
            const name = (String(frontmatter.name || '') || path_1.default.basename(dir)).trim() || path_1.default.basename(dir);
            const description = (String(frontmatter.description || '') || extractDescription(content) || name).trim();
            const isOfficial = isTruthy(frontmatter.official) || isTruthy(frontmatter.isOfficial);
            const version = typeof frontmatter.version === 'string' ? frontmatter.version
                : typeof frontmatter.version === 'number' ? String(frontmatter.version)
                    : undefined;
            const updatedAt = fs_1.default.statSync(skillFile).mtimeMs;
            const id = path_1.default.basename(dir);
            const prompt = content.trim();
            const defaultEnabled = defaults[id]?.enabled ?? true;
            const enabled = state[id]?.enabled ?? defaultEnabled;
            return { id, name, description, enabled, isOfficial, isBuiltIn, updatedAt, prompt, skillPath: skillFile, version };
        }
        catch (error) {
            console.warn('[skills] Failed to parse skill:', dir, error);
            return null;
        }
    }
    listBuiltInSkillIds() {
        const builtInRoot = this.getBundledSkillsRoot();
        if (!builtInRoot || !fs_1.default.existsSync(builtInRoot)) {
            return new Set();
        }
        return new Set(listSkillDirs(builtInRoot).map(dir => path_1.default.basename(dir)));
    }
    isBuiltInSkillId(id) {
        return this.listBuiltInSkillIds().has(id);
    }
    loadSkillStateMap() {
        const store = this.getStore();
        const raw = store.get(SKILL_STATE_KEY);
        if (Array.isArray(raw)) {
            const migrated = {};
            raw.forEach(skill => {
                migrated[skill.id] = { enabled: skill.enabled };
            });
            store.set(SKILL_STATE_KEY, migrated);
            return migrated;
        }
        return raw ?? {};
    }
    saveSkillStateMap(map) {
        this.getStore().set(SKILL_STATE_KEY, map);
    }
    loadSkillsDefaults(roots) {
        const merged = {};
        const reversedRoots = [...roots].reverse();
        for (const root of reversedRoots) {
            const configPath = path_1.default.join(root, SKILLS_CONFIG_FILE);
            if (!fs_1.default.existsSync(configPath))
                continue;
            try {
                const raw = fs_1.default.readFileSync(configPath, 'utf8');
                const config = JSON.parse(raw);
                if (config.defaults && typeof config.defaults === 'object') {
                    for (const [id, settings] of Object.entries(config.defaults)) {
                        merged[id] = { ...merged[id], ...settings };
                    }
                }
            }
            catch (error) {
                console.warn('[skills] Failed to load skills config:', configPath, error);
            }
        }
        return merged;
    }
    getSkillRoots(primaryRoot) {
        const resolvedPrimary = primaryRoot ?? this.getSkillsRoot();
        const roots = [resolvedPrimary];
        const claudeSkillsRoot = this.getClaudeSkillsRoot();
        if (claudeSkillsRoot && fs_1.default.existsSync(claudeSkillsRoot)) {
            roots.push(claudeSkillsRoot);
        }
        const appRoot = this.getBundledSkillsRoot();
        if (appRoot !== resolvedPrimary && fs_1.default.existsSync(appRoot)) {
            roots.push(appRoot);
        }
        return roots;
    }
    getClaudeSkillsRoot() {
        const homeDir = electron_1.app.getPath('home');
        return path_1.default.join(homeDir, CLAUDE_SKILLS_DIR_NAME, CLAUDE_SKILLS_SUBDIR);
    }
    getBundledSkillsRoot() {
        if (electron_1.app.isPackaged) {
            const resourcesRoot = path_1.default.resolve(process.resourcesPath, SKILLS_DIR_NAME);
            if (fs_1.default.existsSync(resourcesRoot)) {
                return resourcesRoot;
            }
            return path_1.default.resolve(electron_1.app.getAppPath(), SKILLS_DIR_NAME);
        }
        const projectRoot = path_1.default.resolve(__dirname, '..', '..', '..');
        return path_1.default.resolve(projectRoot, SKILLS_DIR_NAME);
    }
    getSkillConfig(skillId) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const envPath = path_1.default.join(skillDir, '.env');
            if (!fs_1.default.existsSync(envPath)) {
                return { success: true, config: {} };
            }
            const raw = fs_1.default.readFileSync(envPath, 'utf8');
            const config = {};
            for (const line of raw.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx < 0)
                    continue;
                const key = trimmed.slice(0, eqIdx).trim();
                const value = trimmed.slice(eqIdx + 1).trim();
                config[key] = value;
            }
            return { success: true, config };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to read skill config' };
        }
    }
    setSkillConfig(skillId, config) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const envPath = path_1.default.join(skillDir, '.env');
            const lines = Object.entries(config)
                .filter(([key]) => key.trim())
                .map(([key, value]) => `${key}=${value}`);
            fs_1.default.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to write skill config' };
        }
    }
    repairSkillFromBundled(skillId, skillPath) {
        if (!electron_1.app.isPackaged)
            return false;
        const bundledRoot = this.getBundledSkillsRoot();
        if (!bundledRoot || !fs_1.default.existsSync(bundledRoot)) {
            return false;
        }
        const bundledPath = path_1.default.join(bundledRoot, skillId);
        if (!fs_1.default.existsSync(bundledPath) || bundledPath === skillPath) {
            return false;
        }
        const bundledNodeModules = path_1.default.join(bundledPath, 'node_modules');
        if (!fs_1.default.existsSync(bundledNodeModules)) {
            console.log(`[skills] Bundled ${skillId} does not have node_modules, skipping repair`);
            return false;
        }
        try {
            console.log(`[skills] Repairing ${skillId} from bundled resources...`);
            fs_1.default.cpSync(bundledPath, skillPath, {
                recursive: true,
                dereference: true,
                force: true,
                errorOnExist: false,
            });
            console.log(`[skills] Repaired ${skillId} from bundled resources`);
            return true;
        }
        catch (error) {
            console.warn(`[skills] Failed to repair ${skillId} from bundled resources:`, error);
            return false;
        }
    }
    ensureSkillDependencies(skillDir) {
        const nodeModulesPath = path_1.default.join(skillDir, 'node_modules');
        const packageJsonPath = path_1.default.join(skillDir, 'package.json');
        const skillId = path_1.default.basename(skillDir);
        console.log(`[skills] Checking dependencies for ${skillId}...`);
        console.log(`[skills]   node_modules exists: ${fs_1.default.existsSync(nodeModulesPath)}`);
        console.log(`[skills]   package.json exists: ${fs_1.default.existsSync(packageJsonPath)}`);
        console.log(`[skills]   skillDir: ${skillDir}`);
        if (fs_1.default.existsSync(nodeModulesPath)) {
            console.log(`[skills] Dependencies already installed for ${skillId}`);
            return { success: true };
        }
        if (!fs_1.default.existsSync(packageJsonPath)) {
            console.log(`[skills] No package.json found for ${skillId}, skipping install`);
            return { success: true };
        }
        if (this.repairSkillFromBundled(skillId, skillDir)) {
            if (fs_1.default.existsSync(nodeModulesPath)) {
                console.log(`[skills] Dependencies restored from bundled resources for ${skillId}`);
                return { success: true };
            }
        }
        const env = buildSkillEnv();
        const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === 'path');
        console.log(`[skills]   PATH keys in env: ${JSON.stringify(pathKeys)}`);
        console.log(`[skills]   PATH (first 300 chars): ${env.PATH?.substring(0, 300)}`);
        const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        if (!hasCommand(npmCommand, env) && !hasCommand('npm', env)) {
            const errorMsg = 'npm is not available and skill cannot be repaired from bundled resources. Please install Node.js from https://nodejs.org/';
            console.error(`[skills] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
        console.log(`[skills] npm is available`);
        console.log(`[skills] Installing dependencies for ${skillId}...`);
        console.log(`[skills]   Working directory: ${skillDir}`);
        try {
            const isWin = process.platform === 'win32';
            const result = (0, child_process_1.spawnSync)('npm', ['install'], {
                cwd: skillDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 120000,
                env,
                shell: isWin,
            });
            console.log(`[skills] npm install exit code: ${result.status}`);
            if (result.stdout) {
                console.log(`[skills] npm install stdout: ${result.stdout.substring(0, 500)}`);
            }
            if (result.stderr) {
                console.log(`[skills] npm install stderr: ${result.stderr.substring(0, 500)}`);
            }
            if (result.status !== 0) {
                const errorMsg = result.stderr || result.stdout || 'npm install failed';
                console.error(`[skills] Failed to install dependencies for ${skillId}:`, errorMsg);
                return { success: false, error: `Failed to install dependencies: ${errorMsg}` };
            }
            if (!fs_1.default.existsSync(nodeModulesPath)) {
                const errorMsg = 'npm install appeared to succeed but node_modules was not created';
                console.error(`[skills] ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
            console.log(`[skills] Dependencies installed successfully for ${skillId}`);
            return { success: true };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[skills] Error installing dependencies for ${skillId}:`, errorMsg);
            return { success: false, error: `Failed to install dependencies: ${errorMsg}` };
        }
    }
    async testEmailConnectivity(skillId, config) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const depsResult = this.ensureSkillDependencies(skillDir);
            if (!depsResult.success) {
                console.error('[email-connectivity] Dependency install failed:', depsResult.error);
                return { success: false, error: depsResult.error };
            }
            const imapScript = path_1.default.join(skillDir, 'scripts', 'imap.js');
            const smtpScript = path_1.default.join(skillDir, 'scripts', 'smtp.js');
            if (!fs_1.default.existsSync(imapScript) || !fs_1.default.existsSync(smtpScript)) {
                console.error('[email-connectivity] Scripts not found:', { imapScript, smtpScript });
                return { success: false, error: 'Email connectivity scripts not found' };
            }
            const safeConfig = { ...config };
            if (safeConfig.IMAP_PASS)
                safeConfig.IMAP_PASS = '***';
            if (safeConfig.SMTP_PASS)
                safeConfig.SMTP_PASS = '***';
            console.log('[email-connectivity] Testing with config:', JSON.stringify(safeConfig, null, 2));
            const envOverrides = Object.fromEntries(Object.entries(config ?? {})
                .filter(([key]) => key.trim())
                .map(([key, value]) => [key, String(value ?? '')]));
            console.log('[email-connectivity] Running IMAP test (list-mailboxes)...');
            const imapResult = await this.runSkillScriptWithEnv(skillDir, imapScript, ['list-mailboxes'], envOverrides, 20000);
            console.log('[email-connectivity] IMAP result:', JSON.stringify({
                success: imapResult.success,
                exitCode: imapResult.exitCode,
                timedOut: imapResult.timedOut,
                durationMs: imapResult.durationMs,
                stdout: imapResult.stdout?.slice(0, 500),
                stderr: imapResult.stderr?.slice(0, 500),
                error: imapResult.error,
                spawnErrorCode: imapResult.spawnErrorCode,
            }, null, 2));
            console.log('[email-connectivity] Running SMTP test (verify)...');
            const smtpResult = await this.runSkillScriptWithEnv(skillDir, smtpScript, ['verify'], envOverrides, 20000);
            console.log('[email-connectivity] SMTP result:', JSON.stringify({
                success: smtpResult.success,
                exitCode: smtpResult.exitCode,
                timedOut: smtpResult.timedOut,
                durationMs: smtpResult.durationMs,
                stdout: smtpResult.stdout?.slice(0, 500),
                stderr: smtpResult.stderr?.slice(0, 500),
                error: smtpResult.error,
                spawnErrorCode: smtpResult.spawnErrorCode,
            }, null, 2));
            const checks = [
                this.buildEmailConnectivityCheck('imap_connection', imapResult),
                this.buildEmailConnectivityCheck('smtp_connection', smtpResult),
            ];
            const verdict = checks.every(check => check.level === 'pass') ? 'pass' : 'fail';
            console.log('[email-connectivity] Final verdict:', verdict, 'checks:', JSON.stringify(checks, null, 2));
            return {
                success: true,
                result: {
                    testedAt: Date.now(),
                    verdict,
                    checks,
                },
            };
        }
        catch (error) {
            console.error('[email-connectivity] Unexpected error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to test email connectivity',
            };
        }
    }
    resolveSkillDir(skillId) {
        const skills = this.listSkills();
        const skill = skills.find(s => s.id === skillId);
        if (!skill) {
            throw new Error('Skill not found');
        }
        return path_1.default.dirname(skill.skillPath);
    }
    getScriptRuntimeCandidates(env) {
        const candidates = [];
        if (hasCommand('node', env)) {
            candidates.push({ command: 'node' });
        }
        candidates.push({
            command: (0, deps_1.getElectronNodeRuntimePath)(),
            extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
        });
        return candidates;
    }
    async runSkillScriptWithEnv(skillDir, scriptPath, scriptArgs, envOverrides, timeoutMs) {
        let lastResult = null;
        const baseEnv = buildSkillEnv();
        for (const runtime of this.getScriptRuntimeCandidates(baseEnv)) {
            const env = {
                ...baseEnv,
                ...runtime.extraEnv,
                ...envOverrides,
            };
            const result = await runScriptWithTimeout({
                command: runtime.command,
                args: [scriptPath, ...scriptArgs],
                cwd: skillDir,
                env,
                timeoutMs,
            });
            lastResult = result;
            if (result.spawnErrorCode === 'ENOENT') {
                continue;
            }
            return result;
        }
        return lastResult ?? {
            success: false,
            exitCode: null,
            stdout: '',
            stderr: '',
            durationMs: 0,
            timedOut: false,
            error: 'Failed to run skill script',
        };
    }
    parseScriptMessage(stdout) {
        if (!stdout) {
            return null;
        }
        try {
            const parsed = JSON.parse(stdout);
            if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string' && parsed.message.trim()) {
                return parsed.message.trim();
            }
            return null;
        }
        catch {
            return null;
        }
    }
    getLastOutputLine(text) {
        return text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .slice(-1)[0] || '';
    }
    buildEmailConnectivityCheck(code, result) {
        const label = code === 'imap_connection' ? 'IMAP' : 'SMTP';
        if (result.success) {
            const parsedMessage = this.parseScriptMessage(result.stdout);
            return {
                code,
                level: 'pass',
                message: parsedMessage || `${label} connection successful`,
                durationMs: result.durationMs,
            };
        }
        const message = result.timedOut
            ? `${label} connectivity check timed out`
            : result.error
                || this.getLastOutputLine(result.stderr)
                || this.getLastOutputLine(result.stdout)
                || `${label} connection failed`;
        return {
            code,
            level: 'fail',
            message,
            durationMs: result.durationMs,
        };
    }
    normalizeGitSource(source) {
        const githubTreeOrBlob = parseGithubTreeOrBlobUrl(source);
        if (githubTreeOrBlob) {
            return githubTreeOrBlob;
        }
        if (/^[\w.-]+\/[\w.-]+$/.test(source)) {
            return {
                repoUrl: `https://github.com/${source}.git`,
            };
        }
        if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@')) {
            return {
                repoUrl: source,
            };
        }
        if (source.endsWith('.git')) {
            return {
                repoUrl: source,
            };
        }
        return null;
    }
}
exports.SkillManager = SkillManager;
exports.__skillManagerTestUtils = {
    parseFrontmatter,
    isTruthy,
    extractDescription,
};
//# sourceMappingURL=skillManager.js.map