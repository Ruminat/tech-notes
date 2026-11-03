#!/usr/bin/env node
// Orchestrates read-only code reviews by OpenAI Codex CLI and keeps a persistent
// per-repo/branch/thread review session so iterative reviews preserve context.
//
// Version control is abstracted behind vc-adapter.mjs (Git).
//
// Subcommands:
//   doctor                 Check codex availability + auth + store location.
//   status  [opts]         Print the current review thread metadata as JSON.
//   snapshot [opts]        Produce a review snapshot (diff + file contents).
//   fingerprint [opts]     Print a change fingerprint to detect edits during review.
//   run     [opts]         Run one Codex review and print a JSON result.
//   record  [opts]         Attach findings/resolutions to the latest review iteration.
//
// Machine output is a single JSON object on stdout; progress logs go to stderr.
// Prompts reach Codex over stdin (never argv), so there is no shell-injection surface.

import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {getAdapter} from './vc-adapter.mjs';

const HISTORY_LIMIT = 20;
const LOG_LIMIT = 20;
const DEFAULT_TIMEOUT_SEC = 600;
const SNAPSHOT_DEFAULT_BYTES = 300 * 1024;
const STORE_ROOT =
    process.env.CODEX_REVIEW_HOME || path.join(os.homedir(), '.claude', 'codex-review');

function log(...a) {
    process.stderr.write(a.join(' ') + '\n');
}

function emit(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(message, extra = {}) {
    emit({ok: false, error: message, ...extra});
    process.exit(extra.exitCode ?? 1);
}

function parseArgs(argv) {
    const args = {_: []};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                args[key] = true;
            } else {
                args[key] = next;
                i++;
            }
        } else {
            args._.push(a);
        }
    }
    return args;
}

// Repository identity via the version-control adapter (Git).
function identifyRepo(cwd) {
    const adapter = getAdapter(cwd);
    if (!adapter) {
        const root = fs.realpathSync(cwd);
        return {
            adapter: null,
            vcs: null,
            repoRoot: root,
            repoId: root,
            branch: 'no-vcs',
            baseline: null,
            head: null,
        };
    }
    return {adapter, ...adapter.identify()};
}

// Thread identity: stable repo id + branch + logical thread name.
function threadKeyOf(repoId, branch, thread) {
    return createHash('sha1')
        .update(`${repoId} ${branch} ${thread}`)
        .digest('hex')
        .slice(0, 16);
}

function threadFile(key) {
    return path.join(STORE_ROOT, 'threads', `${key}.json`);
}

function logDir(key) {
    return path.join(STORE_ROOT, 'logs', key);
}

function ensureDir(p) {
    fs.mkdirSync(p, {recursive: true});
}

function loadThread(key) {
    const file = threadFile(key);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function saveThread(meta) {
    ensureDir(path.dirname(threadFile(meta.threadKey)));
    if (meta.history && meta.history.length > HISTORY_LIMIT) {
        meta.history = meta.history.slice(-HISTORY_LIMIT);
    }
    fs.writeFileSync(threadFile(meta.threadKey), JSON.stringify(meta, null, 2));
}

function nowIso() {
    return new Date().toISOString();
}

function pruneLogs(key) {
    const dir = logDir(key);
    if (!fs.existsSync(dir)) return;
    const entries = fs
        .readdirSync(dir)
        .map((name) => {
            // A concurrent run on the same thread may delete a file between readdir
            // and stat; skip it rather than letting ENOENT abort a finished review.
            try {
                return {name, mtime: fs.statSync(path.join(dir, name)).mtimeMs};
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => a.mtime - b.mtime);
    const excess = entries.length - LOG_LIMIT;
    for (let i = 0; i < excess; i++) {
        fs.rmSync(path.join(dir, entries[i].name), {force: true});
    }
}

function codexAvailable() {
    try {
        const v = execFileSync('codex', ['--version'], {encoding: 'utf8'}).trim();
        return {available: true, version: v};
    } catch (e) {
        return {available: false, version: null, detail: String(e.message || e)};
    }
}

function codexLoggedIn() {
    // `codex login status` writes its result to stderr, so capture both streams.
    const r = spawnSync('codex', ['login', 'status'], {encoding: 'utf8'});
    if (r.error) return {loggedIn: false, detail: String(r.error.message || r.error)};
    const combined = `${r.stdout || ''}${r.stderr || ''}`.trim();
    // Require a clean exit AND a positive phrase — "Not logged in" contains "logged in".
    const loggedIn =
        r.status === 0 && /logged in/i.test(combined) && !/not logged in/i.test(combined);
    return {loggedIn, detail: combined};
}

function parseEvents(jsonl) {
    let sessionId = null;
    let finalMessage = null;
    const errors = [];
    for (const line of jsonl.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        let o;
        try {
            o = JSON.parse(t);
        } catch {
            continue;
        }
        if (!o || typeof o !== 'object') continue;
        if (o.type === 'thread.started' && o.thread_id) sessionId = o.thread_id;
        const item = o.type === 'item.completed' ? o.item : null;
        if (item) {
            if (item.type === 'agent_message' && typeof item.text === 'string') {
                finalMessage = item.text;
            }
            if (item.type === 'error' && item.message) errors.push(item.message);
        }
    }
    return {sessionId, finalMessage, errors};
}

function readIfExists(file) {
    try {
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    } catch {
        return '';
    }
}

function isUsableReview(text) {
    if (!text || !text.trim()) return false;
    // A review that was interrupted, or an exec that could not read files under an
    // approval lock, reports that instead of a real review — treat both as unusable.
    return !/review was interrupted|approval request failed|could not inspect|couldn['’]t (?:read|inspect)/i.test(
        text,
    );
}

function spawnCodex({codexArgs, cwd, promptText, timeoutMs}) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn('codex', codexArgs, {cwd, stdio: ['pipe', 'pipe', 'pipe']});
        } catch (e) {
            resolve({spawnError: String(e.message || e), stdout: '', stderr: '', code: null});
            return;
        }
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {}
            }, 5000);
        }, timeoutMs);
        // setEncoding decodes UTF-8 across chunk boundaries (a multibyte char split
        // between two chunks would otherwise become replacement characters).
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('error', (e) => {
            clearTimeout(timer);
            resolve({spawnError: String(e.message || e), stdout, stderr, code: null, timedOut});
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({stdout, stderr, code, timedOut});
        });
        child.stdin.on('error', () => {});
        child.stdin.write(promptText);
        child.stdin.end();
    });
}

function reconstructContext(meta) {
    // Used when a resume fails and a fresh session must be created: Codex then has
    // no memory, so the prior review and Claude's resolutions are replayed as plain text.
    const last = meta.history && meta.history.length ? meta.history[meta.history.length - 1] : null;
    if (!last) return null;
    let priorReview = '';
    try {
        if (last.reviewFile && fs.existsSync(last.reviewFile)) {
            priorReview = fs.readFileSync(last.reviewFile, 'utf8');
        }
    } catch {}
    const parts = [
        '## Reconstructed context from a previous review session',
        '',
        'Your previous Codex session for this thread could not be resumed, so the prior',
        'review and its resolutions are replayed below. Treat them as context, not as',
        'unquestionable truth — re-verify against the current code.',
        '',
        `Previous iteration: ${last.iteration}`,
    ];
    if (priorReview.trim()) {
        parts.push('', '### Your previous review output', '', priorReview.trim());
    }
    if (last.resolutions && last.resolutions.trim()) {
        parts.push('', '### What Claude did afterwards', '', last.resolutions.trim());
    }
    return parts.join('\n');
}

function initMeta(key, repo, thread) {
    return {
        version: 2,
        threadKey: key,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        repoId: repo.repoId,
        branch: repo.branch,
        thread,
        sessionId: null,
        iteration: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        retiredSessions: [],
        history: [],
    };
}

// Build the snapshot text used by the embedded-snapshot engine: either the file the
// caller already prepared, or freshly generated from the adapter.
function resolveSnapshot(args, repo) {
    if (args.snapshot) {
        const p = path.resolve(args.snapshot);
        if (!fs.existsSync(p)) fail(`snapshot file not found: ${p}`);
        return {text: fs.readFileSync(p, 'utf8'), files: null, source: p};
    }
    if (repo.adapter) {
        const maxBytes = Number(args['max-bytes']) || SNAPSHOT_DEFAULT_BYTES;
        const snap = repo.adapter.snapshot({maxBytes});
        return {text: snap.text, files: snap.files, truncated: snap.truncated, source: 'generated'};
    }
    return {text: '', files: null, source: null};
}

async function cmdRun(args) {
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const thread = args.thread || 'default';
    const fresh = Boolean(args.fresh);
    const timeoutMs = Math.max(1, Number(args.timeout || DEFAULT_TIMEOUT_SEC)) * 1000;

    if (!args['prompt-file']) fail('--prompt-file is required for run');
    const promptPath = path.resolve(args['prompt-file']);
    if (!fs.existsSync(promptPath)) fail(`prompt file not found: ${promptPath}`);
    const basePrompt = fs.readFileSync(promptPath, 'utf8');
    if (!basePrompt.trim()) fail('prompt file is empty');

    const avail = codexAvailable();
    if (!avail.available) fail('codex CLI not found on PATH', {detail: avail.detail});

    const repo = identifyRepo(cwd);
    const key = threadKeyOf(repo.repoId, repo.branch, thread);
    let meta = loadThread(key) || initMeta(key, repo, thread);
    const warnings = [];
    if (!repo.vcs) warnings.push('no Git repo detected; using realpath(cwd) as identity');

    ensureDir(logDir(key));
    const stamp = nowIso().replace(/[:.]/g, '-');
    const iterationNo = meta.iteration + 1;
    const lastFile = path.join(logDir(key), `${iterationNo}-${stamp}.review.md`);
    const eventsFile = path.join(logDir(key), `${iterationNo}-${stamp}.events.jsonl`);
    const stderrFile = path.join(logDir(key), `${iterationNo}-${stamp}.stderr.log`);

    if (fresh && meta.sessionId) {
        meta.retiredSessions.push(meta.sessionId);
        meta.sessionId = null;
    }

    // Engine selection:
    //  - explicit --snapshot, or no VCS -> embedded-snapshot `codex exec`. Codex
    //    reviews a prepared diff + file contents; it never runs Git itself.
    //  - Git with no snapshot -> `codex exec review` (diff-based).
    const useSnapshot = Boolean(args.snapshot) || repo.vcs === null;

    let mode = null;
    let engine = useSnapshot ? 'exec-snapshot' : 'review';
    let promptText = basePrompt;
    let result = null;
    let nativeFailed = false;
    const started = Date.now();

    // Opt-in native persistent session (plain `codex exec resume`). Works only where
    // non-interactive exec may run shell reads; disabled by default, falls back below.
    if (
        process.env.CODEX_REVIEW_NATIVE_RESUME === '1' &&
        meta.sessionId &&
        !fresh &&
        engine !== 'exec-snapshot'
    ) {
        log(`[codex-review] attempting native resume of ${meta.sessionId}`);
        const resumeArgs = [
            'exec',
            'resume',
            meta.sessionId,
            '-c',
            'sandbox_mode="read-only"',
            '--json',
            '--skip-git-repo-check',
            '-o',
            lastFile,
            '-',
        ];
        const r = await spawnCodex({codexArgs: resumeArgs, cwd: repo.repoRoot, promptText, timeoutMs});
        if (r.code === 0 && !r.timedOut && isUsableReview(readIfExists(lastFile))) {
            mode = 'resumed';
            engine = 'exec-resume';
            result = r;
        } else {
            nativeFailed = true;
            warnings.push(
                `native resume of ${meta.sessionId} was not usable (code=${r.code}); falling back and replaying saved history`,
            );
            meta.retiredSessions.push(meta.sessionId);
            meta.sessionId = null;
            const preamble = reconstructContext(meta);
            if (preamble) promptText = `${preamble}\n\n---\n\n${basePrompt}`;
        }
    }

    if (!result && engine === 'exec-snapshot') {
        // Embedded-snapshot engine: read-only, Git-free. The change set is supplied in the
        // prompt so Codex reviews the actual changes without discovering them via VCS.
        const snap = resolveSnapshot(args, repo);
        if (!snap.text.trim()) {
            warnings.push('snapshot is empty; Codex will review only the instructions + repo files');
        }
        const header = [
            '## Changes under review (prepared read-only)',
            '',
            'Review the supplied changes and the included file contents.',
            '',
            snap.text || '(no textual changes were produced)',
        ].join('\n');
        promptText = `${promptText}\n\n---\n\n${header}`;
        mode = nativeFailed ? 'snapshot-fallback' : 'snapshot';
        const execArgs = [
            'exec',
            '--json',
            '-s',
            'read-only',
            '--skip-git-repo-check',
            '-o',
            lastFile,
            '-',
        ];
        log(`[codex-review] thread=${thread} key=${key} engine=exec-snapshot iter=${iterationNo} vcs=${repo.vcs}`);
        result = await runWithRetry(execArgs, repo.repoRoot, promptText, timeoutMs, lastFile, warnings);
    }

    if (!result) {
        // Git review engine: diff-based `codex exec review` (read-only by construction).
        engine = 'review';
        mode = nativeFailed ? 'review-fallback' : 'review';
        const reviewArgs = [
            'exec',
            'review',
            '-c',
            'sandbox_mode="read-only"',
            '--json',
            '-o',
            lastFile,
            '-',
        ];
        log(`[codex-review] thread=${thread} key=${key} engine=review iter=${iterationNo} vcs=${repo.vcs}`);
        result = await runWithRetry(reviewArgs, repo.repoRoot, promptText, timeoutMs, lastFile, warnings);
    }

    const continued = meta.history.length > 0 && !fresh;
    const durationMs = Date.now() - started;
    try {
        fs.writeFileSync(eventsFile, result.stdout || '');
        fs.writeFileSync(stderrFile, result.stderr || '');
    } catch {}

    if (result.spawnError) fail('failed to spawn codex', {detail: result.spawnError, warnings});

    const parsed = parseEvents(result.stdout || '');
    let reviewText = readIfExists(lastFile);
    if (!reviewText.trim() && parsed.finalMessage) reviewText = parsed.finalMessage;

    if (result.timedOut) warnings.push(`codex timed out after ${timeoutMs / 1000}s`);
    for (const e of parsed.errors) warnings.push(`codex event error: ${e}`);

    const ok =
        result.code === 0 &&
        !result.timedOut &&
        Boolean(reviewText.trim()) &&
        isUsableReview(reviewText);
    // Only adopt a new Codex session id from a usable run; retire a failed new session
    // so a later native-resume never continues a broken/empty thread.
    let sessionId = meta.sessionId;
    if (parsed.sessionId) {
        if (ok) sessionId = parsed.sessionId;
        else if (parsed.sessionId !== meta.sessionId)
            meta.retiredSessions.push(parsed.sessionId);
    }
    let fingerprint = null;
    try {
        if (repo.adapter) fingerprint = repo.adapter.fingerprint();
    } catch {}

    meta.sessionId = sessionId;
    meta.iteration = iterationNo;
    meta.updatedAt = nowIso();
    meta.history.push({
        iteration: iterationNo,
        ts: nowIso(),
        reviewer: 'codex',
        mode,
        engine,
        continued,
        sessionId,
        vcs: repo.vcs,
        baseline: repo.baseline,
        head: repo.head,
        fingerprint,
        scope: args.scope || null,
        promptChars: promptText.length,
        reviewChars: reviewText.length,
        reviewFile: lastFile,
        eventsFile,
        stderrFile,
        exitCode: result.code,
        durationMs,
        timedOut: Boolean(result.timedOut),
        resolutions: null,
    });
    saveThread(meta);
    pruneLogs(key);

    emit({
        ok,
        threadKey: key,
        thread,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        repoId: repo.repoId,
        branch: repo.branch,
        baseline: repo.baseline,
        head: repo.head,
        fingerprint,
        mode,
        engine,
        continued,
        sessionId,
        iteration: iterationNo,
        exitCode: result.code,
        timedOut: Boolean(result.timedOut),
        durationMs,
        reviewText,
        reviewFile: lastFile,
        eventsFile,
        stderrFile,
        warnings,
    });
}

async function runWithRetry(codexArgs, cwd, promptText, timeoutMs, lastFile, warnings) {
    const maxAttempts = 2;
    let result = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            fs.rmSync(lastFile, {force: true});
        } catch {}
        result = await spawnCodex({codexArgs, cwd, promptText, timeoutMs});
        const text = readIfExists(lastFile) || parseEvents(result.stdout || '').finalMessage || '';
        const transient = !result.timedOut && (result.code !== 0 || !isUsableReview(text));
        if (!transient || attempt === maxAttempts) break;
        warnings.push(`codex attempt ${attempt} was not usable; retried once`);
        log(`[codex-review] attempt ${attempt} not usable; retrying`);
    }
    return result;
}

function cmdSnapshot(args) {
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const thread = args.thread || 'default';
    const repo = identifyRepo(cwd);
    if (!repo.adapter) fail('no Git repository detected at ' + cwd);
    const maxBytes = Number(args['max-bytes']) || SNAPSHOT_DEFAULT_BYTES;
    const snap = repo.adapter.snapshot({maxBytes});
    const fingerprint = repo.adapter.fingerprint();
    const key = threadKeyOf(repo.repoId, repo.branch, thread);
    ensureDir(logDir(key));
    const stamp = nowIso().replace(/[:.]/g, '-');
    const outFile = args.out ? path.resolve(args.out) : path.join(logDir(key), `snapshot-${stamp}.md`);
    fs.writeFileSync(outFile, snap.text);
    pruneLogs(key);
    emit({
        ok: true,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        repoId: repo.repoId,
        branch: repo.branch,
        baseline: repo.baseline,
        head: repo.head,
        fingerprint,
        files: snap.files,
        fileCount: snap.files ? snap.files.length : null,
        truncated: Boolean(snap.truncated),
        bytes: snap.text.length,
        snapshotFile: outFile,
        threadKey: key,
    });
}

function cmdFingerprint(args) {
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const repo = identifyRepo(cwd);
    if (!repo.adapter) fail('no Git repository detected at ' + cwd);
    emit({
        ok: true,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        branch: repo.branch,
        baseline: repo.baseline,
        head: repo.head,
        fingerprint: repo.adapter.fingerprint(),
    });
}

function cmdStatus(args) {
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const thread = args.thread || 'default';
    const repo = identifyRepo(cwd);
    const key = threadKeyOf(repo.repoId, repo.branch, thread);
    const meta = loadThread(key);
    const last = meta && meta.history.length ? meta.history[meta.history.length - 1] : null;
    emit({
        ok: true,
        exists: Boolean(meta && meta.sessionId),
        threadKey: key,
        thread,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        repoId: repo.repoId,
        branch: repo.branch,
        baseline: repo.baseline,
        sessionId: meta ? meta.sessionId : null,
        iteration: meta ? meta.iteration : 0,
        retiredSessions: meta ? meta.retiredSessions : [],
        lastReview: last
            ? {
                  iteration: last.iteration,
                  ts: last.ts,
                  mode: last.mode,
                  engine: last.engine,
                  fingerprint: last.fingerprint || null,
                  reviewFile: last.reviewFile,
                  hasResolutions: Boolean(last.resolutions),
                  hasData: Boolean(last.data),
              }
            : null,
        storeRoot: STORE_ROOT,
    });
}

function cmdRecord(args) {
    const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
    const thread = args.thread || 'default';
    const repo = identifyRepo(cwd);
    const key = threadKeyOf(repo.repoId, repo.branch, thread);
    const meta = loadThread(key);
    if (!meta || !meta.history.length) fail('no review history to record against');
    const entry = meta.history[meta.history.length - 1];
    let recorded = 0;

    if (args['resolutions-file']) {
        const p = path.resolve(args['resolutions-file']);
        if (!fs.existsSync(p)) fail(`resolutions file not found: ${p}`);
        const text = fs.readFileSync(p, 'utf8');
        entry.resolutions = text;
        recorded += text.length;
    } else if (typeof args.note === 'string') {
        entry.resolutions = args.note;
        recorded += args.note.length;
    }

    // Structured data (findings, confirmed, rejected, fixes, remaining, etc.) merged
    // into the latest iteration so future reviews can reconstruct the full picture.
    if (args['data-file']) {
        const p = path.resolve(args['data-file']);
        if (!fs.existsSync(p)) fail(`data file not found: ${p}`);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (e) {
            fail('data file is not valid JSON', {detail: String(e.message || e)});
        }
        entry.data = {...(entry.data || {}), ...data};
        recorded += JSON.stringify(data).length;
    }

    if (!recorded) fail('provide --resolutions-file, --note, and/or --data-file');
    meta.updatedAt = nowIso();
    saveThread(meta);
    emit({ok: true, threadKey: key, iteration: meta.iteration, recordedChars: recorded});
}

function cmdDoctor() {
    const avail = codexAvailable();
    const auth = avail.available ? codexLoggedIn() : {loggedIn: false, detail: 'codex missing'};
    const cwd = process.cwd();
    const repo = identifyRepo(cwd);
    ensureDir(path.join(STORE_ROOT, 'threads'));
    ensureDir(path.join(STORE_ROOT, 'logs'));
    emit({
        ok: avail.available && auth.loggedIn,
        codex: avail,
        auth,
        vcs: repo.vcs,
        repoRoot: repo.repoRoot,
        branch: repo.branch,
        storeRoot: STORE_ROOT,
        node: process.version,
    });
}

async function main() {
    const argv = process.argv.slice(2);
    const sub = argv[0];
    const args = parseArgs(argv.slice(1));
    try {
        if (sub === 'run') await cmdRun(args);
        else if (sub === 'status') cmdStatus(args);
        else if (sub === 'snapshot') cmdSnapshot(args);
        else if (sub === 'fingerprint') cmdFingerprint(args);
        else if (sub === 'record') cmdRecord(args);
        else if (sub === 'doctor') cmdDoctor();
        else
            fail(
                `unknown subcommand: ${sub || '(none)'} (use doctor|status|snapshot|fingerprint|run|record)`,
            );
    } catch (e) {
        fail('unexpected error', {detail: String(e && e.stack ? e.stack : e)});
    }
}

main();
