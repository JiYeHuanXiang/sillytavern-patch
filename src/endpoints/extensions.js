import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import sanitize from 'sanitize-filename';
import { CheckRepoActions, default as simpleGit } from 'simple-git';

import { PUBLIC_DIRECTORIES } from '../constants.js';
import { getConfigValue, isValidUrl, extractFilesFromZipBuffer, getZipEntryList, ensureDirectory, normalizeZipEntryPath } from '../util.js';
import { createGitClient } from '../git/client.js';

const gitBackend = getConfigValue('git.backend', 'auto');

/**
 * @type {Partial<import('simple-git').SimpleGitOptions>}
 */
const OPTIONS = Object.freeze({ timeout: { block: 5 * 60 * 1000 } });

/**
 * Size limits for the ZIP extension import: a cap on the uploaded archive
 * itself and a cap on the total decompressed size (zip bomb protection).
 */
const MAX_EXTENSION_ZIP_SIZE = 200 * 1024 * 1024;
const MAX_EXTENSION_ZIP_UNCOMPRESSED_SIZE = 512 * 1024 * 1024;

/**
 * This function extracts the extension information from the manifest file.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<Object>} - Returns the manifest data as an object
 */
async function getManifest(extensionPath) {
    const manifestPath = path.join(extensionPath, 'manifest.json');

    // Check if manifest.json exists
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file not found at ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest;
}

/**
 * This function checks if the local repository is up-to-date with the remote repository.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<Object>} - Returns the extension information as an object
 */
async function checkIfRepoIsUpToDate(extensionPath) {
    const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
    await git.fetch('origin');
    const currentBranch = await git.branch();
    const currentCommitHash = await git.revparse(['HEAD']);
    const log = await git.log({
        from: currentCommitHash,
        to: `origin/${currentBranch.current}`,
    });

    // Fetch remote repository information
    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
        return {
            isUpToDate: true,
            remoteUrl: '',
        };
    }

    return {
        isUpToDate: log.total === 0,
        remoteUrl: remotes[0].refs.fetch, // URL of the remote repository
    };
}

export const router = express.Router();

/**
 * Feature flag guard: don't allow calling any of the endpoints if extensions are disabled
 * @type {import('express').RequestHandler}
 */
export const extensionsEnabledFeatureGuard = (_, response, next) => {
    const enabled = !!getConfigValue('extensions.enabled', true, 'boolean');
    if (!enabled) {
        response.sendStatus(404);
        return;
    }
    next();
};

router.use(extensionsEnabledFeatureGuard);

/**
 * HTTP POST handler function to clone a git repository from a provided URL, read the extension manifest,
 * and return extension information and path.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with a 'url' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/install', async (request, response) => {
    try {
        const { url, global, branch } = request.body;

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to install global extensions.`);
            return response.status(403).send('Forbidden: No permission to install global extensions.');
        }

        if (!isValidUrl(url)) {
            return response.status(400).send('Bad Request: A valid URL is required in the request body.');
        }

        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return response.status(400).send('Bad Request: Only HTTP and HTTPS protocols are supported for the Extension URL.');
        }

        const git = createGitClient({ backend: gitBackend });

        // make sure the third-party directory exists
        if (!fs.existsSync(path.join(request.user.directories.extensions))) {
            fs.mkdirSync(path.join(request.user.directories.extensions));
        }

        if (!fs.existsSync(PUBLIC_DIRECTORIES.globalExtensions)) {
            fs.mkdirSync(PUBLIC_DIRECTORIES.globalExtensions);
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionNameSanitized = sanitize(path.basename(parsedUrl.pathname, '.git'));
        if (!extensionNameSanitized) {
            return response.status(400).send('Could not determine the extension name from the URL. Please provide a valid git repository URL.');
        }

        const extensionPath = path.join(basePath, extensionNameSanitized);
        const folderName = path.basename(extensionPath);

        if (fs.existsSync(extensionPath)) {
            return response.status(409).send(`Directory already exists at ${extensionPath}`);
        }

        const cloneOptions = { depth: 1 };
        if (branch) {
            cloneOptions.branch = branch;
        }
        await git.clone(parsedUrl.href, extensionPath, cloneOptions);
        console.info(`Extension has been cloned to ${extensionPath} from ${parsedUrl.href} at ${branch || '(default)'} branch`);

        try {
            const manifest = await getManifest(extensionPath);
            if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
                throw new Error('Manifest is not a valid JSON object.');
            }
            const { version, author, display_name, name } = manifest;
            return response.send({ version, author, display_name: display_name || name, extensionPath, folderName });
        } catch (manifestError) {
            await fs.promises.rm(extensionPath, { recursive: true, force: true });
            throw manifestError;
        }
    } catch (error) {
        console.error('Importing extension failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

/**
 * HTTP POST handler function to install a third-party extension from an uploaded ZIP archive.
 * The archive is received as multipart form data (field name 'avatar') via the global multer middleware.
 *
 * The archive is only accepted if it actually looks like an extension package:
 * manifest.json at the archive root, declaring a display name and a "js" entry point
 * script that is present in the archive. This keeps arbitrary ZIP files from being
 * placed in the extensions directory, where they would be discovered and loaded as extensions.
 *
 * Imports are always user-scoped; an admin can move the extension to the global
 * scope from the extension manager afterwards.
 *
 * @param {Object} request - HTTP Request object, multipart form data with an 'avatar' field containing a ZIP archive.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/install-zip', async (request, response) => {
    const file = request.file;
    let tempPath = file?.path ?? null;
    let extensionPath = null;
    let directoryCreated = false;

    try {
        if (!file) {
            return response.status(400).send('Bad Request: No file uploaded.');
        }

        if (path.extname(file.originalname || '').toLowerCase() !== '.zip') {
            return response.status(400).send('Bad Request: Please provide a ZIP archive.');
        }

        if (file.size > MAX_EXTENSION_ZIP_SIZE) {
            return response.status(400).send(`Bad Request: The ZIP archive must be smaller than ${MAX_EXTENSION_ZIP_SIZE / 1024 / 1024} MB.`);
        }

        const archiveBuffer = await fs.promises.readFile(file.path);

        const entries = await getZipEntryList(archiveBuffer);
        if (!entries || entries.length === 0) {
            return response.status(400).send('Bad Request: The uploaded file is not a valid ZIP archive or is empty.');
        }

        /** @type {string[]} */
        const filePaths = [];

        for (const entry of entries) {
            // macOS archives ship junk metadata under __MACOSX/
            if (entry.fileName.startsWith('__MACOSX') || entry.isDirectory) {
                continue;
            }

            const normalized = normalizeZipEntryPath(entry.fileName);
            // null means the entry would escape the extraction directory
            if (!normalized) {
                return response.status(400).send('Bad Request: The ZIP archive contains an unsafe entry path.');
            }

            // Windows drive-absolute paths ("C:/...") resolve outside the extension directory
            if (/^[a-zA-Z]:/.test(normalized)) {
                return response.status(400).send('Bad Request: The ZIP archive contains an unsafe entry path.');
            }

            // Unix symlink mode (S_IFLNK): such entries only store the target path as content
            const unixMode = (entry.externalAttributes >>> 16) & 0o170000;
            if (unixMode === 0o120000) {
                return response.status(400).send('Bad Request: The ZIP archive contains symbolic links, which are not supported.');
            }

            filePaths.push(normalized);
        }

        if (filePaths.length === 0) {
            return response.status(400).send('Bad Request: The ZIP archive is empty.');
        }

        // GitHub-style archives nest everything under a single top-level directory
        const topSegments = new Set(filePaths.map(p => p.split('/')[0]));
        const stripPrefix = topSegments.size === 1 && filePaths.some(p => p.includes('/')) ? `${[...topSegments][0]}/` : '';
        const relativePaths = [...new Set(filePaths.map(p => p.slice(stripPrefix.length)).filter(p => p.length > 0))];

        if (relativePaths.length === 0) {
            return response.status(400).send('Bad Request: The ZIP archive is empty.');
        }

        if (!relativePaths.includes('manifest.json')) {
            return response.status(400).send('Bad Request: manifest.json was not found at the archive root.');
        }

        const rawFolderName = stripPrefix
            ? stripPrefix.slice(0, -1)
            : path.basename(file.originalname, path.extname(file.originalname));
        const folderName = sanitize(rawFolderName);
        if (!folderName) {
            return response.status(400).send('Bad Request: Could not determine the extension name from the ZIP archive.');
        }

        // make sure the third-party directory exists
        if (!fs.existsSync(request.user.directories.extensions)) {
            fs.mkdirSync(request.user.directories.extensions, { recursive: true });
        }

        extensionPath = path.join(request.user.directories.extensions, folderName);

        if (fs.existsSync(extensionPath)) {
            return response.status(409).send(`Directory already exists at ${extensionPath}`);
        }

        // Extraction matches on raw archive entry names, so map each raw name
        // to its stripped (extension-root-relative) path
        const strippedOf = new Map();
        for (const p of filePaths) {
            strippedOf.set(p, p.slice(stripPrefix.length));
        }

        const extracted = await extractFilesFromZipBuffer(archiveBuffer, [...strippedOf.keys()]);
        if (!extracted || extracted.size < strippedOf.size) {
            return response.status(400).send('Bad Request: Could not read the files from the ZIP archive.');
        }

        // Zip bomb protection: cap the total decompressed size
        let uncompressedSize = 0;
        for (const buffer of extracted.values()) {
            uncompressedSize += buffer.length;
        }
        if (uncompressedSize > MAX_EXTENSION_ZIP_UNCOMPRESSED_SIZE) {
            return response.status(400).send('Bad Request: The ZIP archive is too large when decompressed.');
        }

        let manifest;
        try {
            const manifestKey = [...strippedOf.keys()].find(k => strippedOf.get(k) === 'manifest.json');
            manifest = JSON.parse(extracted.get(manifestKey)?.toString('utf8') ?? '');
        } catch {
            manifest = null;
        }

        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            return response.status(400).send('Bad Request: manifest.json is not a valid JSON object.');
        }

        // The package must identify itself
        const displayName = manifest.display_name ?? manifest.name;
        if (typeof displayName !== 'string' || !displayName.trim()) {
            return response.status(400).send('Bad Request: manifest.json must provide a "display_name" or "name".');
        }

        // A loadable extension needs an entry point script, and it must be in the archive
        const jsEntryPath = normalizeZipEntryPath(typeof manifest.js === 'string' ? manifest.js.trim() : '');
        if (!jsEntryPath) {
            return response.status(400).send('Bad Request: manifest.json must declare a "js" entry point script.');
        }
        if (!relativePaths.includes(jsEntryPath)) {
            return response.status(400).send(`Bad Request: The "js" entry point "${manifest.js}" declared in manifest.json was not found in the archive.`);
        }

        // Same for the stylesheet, if one is declared
        if (manifest.css !== undefined) {
            const cssEntryPath = normalizeZipEntryPath(typeof manifest.css === 'string' ? manifest.css.trim() : '');
            if (!cssEntryPath || !relativePaths.includes(cssEntryPath)) {
                return response.status(400).send(`Bad Request: The "css" file "${manifest.css}" declared in manifest.json was not found in the archive.`);
            }
        }

        // Write the extension files, with the target constrained to the extension directory
        const rootDir = path.resolve(extensionPath);
        ensureDirectory(extensionPath);
        directoryCreated = true;

        for (const [rawPath, buffer] of extracted) {
            const relativePath = strippedOf.get(rawPath);
            if (!relativePath) {
                continue;
            }
            const targetPath = path.resolve(rootDir, relativePath);
            if (targetPath !== rootDir && !targetPath.startsWith(rootDir + path.sep)) {
                throw new Error(`Refusing to write outside the extension directory: ${relativePath}`);
            }
            ensureDirectory(path.dirname(targetPath));
            fs.writeFileSync(targetPath, buffer);
        }

        console.info(`Extension has been installed at ${extensionPath} from a ZIP archive uploaded by ${request.user.profile.handle}`);

        const { version, author, loading_order } = manifest;
        return response.send({
            version,
            author,
            loading_order,
            display_name: manifest.display_name || manifest.name,
            extensionPath,
            folderName,
        });
    } catch (error) {
        console.error('Importing extension from ZIP failed', error);

        // Clean up a half-written extension directory, but never one that
        // existed before this request (e.g. the 409 path)
        if (directoryCreated && extensionPath) {
            await fs.promises.rm(extensionPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
        }

        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    } finally {
        // The multer temp file is no longer needed: either it was read into memory
        // or the request failed before that
        if (tempPath) {
            try {
                await fs.promises.unlink(tempPath);
            } catch { /* ignore */ }
        }
    }
});

/**
 * HTTP POST handler function to pull the latest updates from a git repository
 * based on the extension name provided in the request body. It returns the latest commit hash,
 * the path of the extension, the status of the repository (whether it's up-to-date or not),
 * and the remote URL of the repository.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with an 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/update', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, global } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to update global extensions.`);
            return response.status(403).send('Forbidden: No permission to update global extensions.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const { isUpToDate, remoteUrl } = await checkIfRepoIsUpToDate(extensionPath);
        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
        if (!isRepo) {
            throw new Error(`Directory is not a Git repository at ${extensionPath}`);
        }
        const currentBranch = await git.branch();
        if (!isUpToDate) {
            await git.pull('origin', currentBranch.current);
            console.info(`Extension has been updated at ${extensionPath}`);
        } else {
            console.info(`Extension is up to date at ${extensionPath}`);
        }
        await git.fetch('origin');
        const fullCommitHash = await git.revparse(['HEAD']);
        const shortCommitHash = fullCommitHash.slice(0, 7);

        return response.send({ shortCommitHash, extensionPath, isUpToDate, remoteUrl });
    } catch (error) {
        console.error('Updating extension failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

router.post('/branches', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, global } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to list branches of global extensions.`);
            return response.status(403).send('Forbidden: No permission to list branches of global extensions.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        // Unshallow the repository if it is shallow
        const isShallow = await git.revparse(['--is-shallow-repository']) === 'true';
        if (isShallow) {
            console.info(`Unshallowing the repository at ${extensionPath}`);
            await git.fetch('origin', ['--unshallow']);
        }

        // Fetch all branches
        await git.remote(['set-branches', 'origin', '*']);
        await git.fetch('origin');
        const localBranches = await git.branchLocal();
        const remoteBranches = await git.branch(['-r', '--list', 'origin/*']);
        const result = [
            ...Object.values(localBranches.branches),
            ...Object.values(remoteBranches.branches),
        ].map(b => ({ current: b.current, commit: b.commit, name: b.name, label: b.label }));

        return response.send(result);
    } catch (error) {
        console.error('Getting branches failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

router.post('/switch', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, branch, global } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized || !branch) {
            return response.status(400).send('Bad Request: A valid extensionName and branch are required in the request body.');
        }

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to switch branches of global extensions.`);
            return response.status(403).send('Forbidden: No permission to switch branches of global extensions.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        const branches = await git.branchLocal();

        if (String(branch).startsWith('origin/')) {
            const localBranch = branch.replace('origin/', '');
            if (branches.all.includes(localBranch)) {
                console.info(`Branch ${localBranch} already exists locally, checking it out`);
                await git.checkout(localBranch);
                return response.sendStatus(204);
            }

            console.info(`Branch ${localBranch} does not exist locally, creating it from ${branch}`);
            await git.checkoutBranch(localBranch, branch);
            return response.sendStatus(204);
        }

        if (!branches.all.includes(branch)) {
            console.error(`Branch ${branch} does not exist locally`);
            return response.status(404).send(`Branch ${branch} does not exist locally`);
        }

        // Check if the branch is already checked out
        const currentBranch = await git.branch();
        if (currentBranch.current === branch) {
            console.info(`Branch ${branch} is already checked out`);
            return response.sendStatus(204);
        }

        // Checkout the branch
        await git.checkout(branch);
        console.info(`Checked out branch ${branch} at ${extensionPath}`);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Switching branches failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

router.post('/move', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, source, destination } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized || !source || !destination) {
            return response.status(400).send('Bad Request: A valid extensionName, source, and destination are required in the request body.');
        }

        if (!request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to move extensions.`);
            return response.status(403).send('Forbidden: No permission to move extensions.');
        }

        const sourceDirectory = source === 'global' ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const destinationDirectory = destination === 'global' ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const sourcePath = path.join(sourceDirectory, extensionNameSanitized);
        const destinationPath = path.join(destinationDirectory, extensionNameSanitized);

        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
            console.error(`Source directory does not exist at ${sourcePath}`);
            return response.status(404).send('Source directory does not exist.');
        }

        if (fs.existsSync(destinationPath)) {
            console.error(`Destination directory already exists at ${destinationPath}`);
            return response.status(409).send('Destination directory already exists.');
        }

        if (source === destination) {
            console.error('Source and destination directories are the same');
            return response.status(409).send('Source and destination directories are the same.');
        }

        fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
        fs.rmSync(sourcePath, { recursive: true, force: true });
        console.info(`Extension has been moved from ${sourcePath} to ${destinationPath}`);

        return response.sendStatus(204);
    } catch (error) {
        console.error('Moving extension failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

/**
 * HTTP POST handler function to get the current git commit hash and branch name for a given extension.
 * It checks whether the repository is up-to-date with the remote, and returns the status along with
 * the remote URL of the repository.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with an 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/version', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, global } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
        let currentCommitHash;
        try {
            const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) {
                throw new Error(`Directory is not a Git repository at ${extensionPath}`);
            }
            currentCommitHash = await git.revparse(['HEAD']);
        } catch (error) {
            // it is not a git repo, or has no commits yet, or is a bare repo
            // not possible to update it, most likely can't get the branch name either
            return response.send({ currentBranchName: '', currentCommitHash: '', isUpToDate: true, remoteUrl: '' });
        }

        const currentBranch = await git.branch();
        // get only the working branch
        const currentBranchName = currentBranch.current;
        await git.fetch('origin');
        console.debug(extensionNameSanitized, currentBranchName, currentCommitHash);
        const { isUpToDate, remoteUrl } = await checkIfRepoIsUpToDate(extensionPath);

        return response.send({ currentBranchName, currentCommitHash, isUpToDate, remoteUrl });
    } catch (error) {
        console.error('Getting extension version failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

/**
 * HTTP POST handler function to delete a git repository based on the extension name provided in the request body.
 *
 * @param {Object} request - HTTP Request object, expects a JSON body with a 'extensionName' property.
 * @param {Object} response - HTTP Response object used to respond to the HTTP request.
 *
 * @returns {void}
 */
router.post('/delete', async (request, response) => {
    try {
        if (typeof request.body.extensionName !== 'string') {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        const { extensionName, global } = request.body;
        const extensionNameSanitized = sanitize(extensionName);
        if (!extensionNameSanitized) {
            return response.status(400).send('Bad Request: A valid extensionName is required in the request body.');
        }

        if (global && !request.user.profile.admin) {
            console.error(`User ${request.user.profile.handle} does not have permission to delete global extensions.`);
            return response.status(403).send('Forbidden: No permission to delete global extensions.');
        }

        const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : request.user.directories.extensions;
        const extensionPath = path.join(basePath, extensionNameSanitized);

        if (!fs.existsSync(extensionPath)) {
            return response.status(404).send(`Directory does not exist at ${extensionPath}`);
        }

        await fs.promises.rm(extensionPath, { recursive: true });
        console.info(`Extension has been deleted at ${extensionPath}`);

        return response.send(`Extension has been deleted at ${extensionPath}`);
    } catch (error) {
        console.error('Deleting extension failed', error);
        return response.status(500).send('Internal Server Error. Check the server logs for more details.');
    }
});

/**
 * Discover the extension folders
 * If the folder is called third-party, search for subfolders instead
 */
router.get('/discover', function (request, response) {
    if (!fs.existsSync(path.join(request.user.directories.extensions))) {
        fs.mkdirSync(path.join(request.user.directories.extensions));
    }

    if (!fs.existsSync(PUBLIC_DIRECTORIES.globalExtensions)) {
        fs.mkdirSync(PUBLIC_DIRECTORIES.globalExtensions);
    }

    // Get all folders in system extensions folder, excluding third-party
    const builtInExtensions = fs
        .readdirSync(PUBLIC_DIRECTORIES.extensions)
        .filter(f => fs.statSync(path.join(PUBLIC_DIRECTORIES.extensions, f)).isDirectory())
        .filter(f => f !== 'third-party')
        .map(f => ({ type: 'system', name: f }));

    // Get all folders in local extensions folder
    const userExtensions = fs
        .readdirSync(path.join(request.user.directories.extensions))
        .filter(f => fs.statSync(path.join(request.user.directories.extensions, f)).isDirectory())
        .map(f => ({ type: 'local', name: `third-party/${f}` }));

    // Get all folders in global extensions folder
    // In case of a conflict, the extension will be loaded from the user folder
    const globalExtensions = fs
        .readdirSync(PUBLIC_DIRECTORIES.globalExtensions)
        .filter(f => fs.statSync(path.join(PUBLIC_DIRECTORIES.globalExtensions, f)).isDirectory())
        .map(f => ({ type: 'global', name: `third-party/${f}` }))
        .filter(f => !userExtensions.some(e => e.name === f.name));

    // Combine all extensions
    const allExtensions = [...builtInExtensions, ...userExtensions, ...globalExtensions];
    console.debug('Extensions available for', request.user.profile.handle, allExtensions);

    return response.send(allExtensions);
});
