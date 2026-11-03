// Minimal version-control adapter shared by the review skills.
//
// Git only. Exposes conceptual operations — identify repo, working-copy state,
// baseline, list changes, produce a review snapshot, compute a fingerprint —
// mapped to read-only Git commands. No writes, no VCS mutation.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_BUFFER = 128 * 1024 * 1024;
const DEFAULT_SNAPSHOT_BYTES = 300 * 1024;

function run(cmd, cmdArgs, cwd) {
    try {
        return {
            ok: true,
            out: execFileSync(cmd, cmdArgs, {
                cwd,
                encoding: 'utf8',
                maxBuffer: MAX_BUFFER,
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trimEnd(),
        };
    } catch (e) {
        return {ok: false, out: '', err: String((e && e.message) || e)};
    }
}

export function detectVcs(cwd) {
    if (run('git', ['rev-parse', '--show-toplevel'], cwd).ok) return 'git';
    return null;
}

export function getAdapter(cwd) {
    return detectVcs(cwd) === 'git' ? new GitAdapter(cwd) : null;
}

function parseNameStatus(text) {
    const files = [];
    for (const line of text.split('\n')) {
        const t = line.trimEnd();
        if (!t.trim()) continue;
        // Rename/copy (R/C) rows carry old AND new paths; the destination (last
        // field) is what changed.
        let fields = t.split('\t').filter(Boolean);
        if (fields.length < 2) fields = t.trim().split(/\s+/).filter(Boolean);
        if (fields.length < 2) continue;
        files.push({status: fields[0], path: fields[fields.length - 1].trim()});
    }
    return files;
}

function clip(text, budget) {
    if (text.length <= budget) return {text, truncated: false};
    return {
        text:
            text.slice(0, budget) +
            `\n\n[... snapshot truncated at ${budget} bytes; ${text.length - budget} more bytes omitted ...]\n`,
        truncated: true,
    };
}

class GitAdapter {
    constructor(cwd) {
        this.vcs = 'git';
        this.cwd = cwd;
    }

    _git(a) {
        return run('git', a, this.cwd);
    }

    identify() {
        const root = fs.realpathSync(this._git(['rev-parse', '--show-toplevel']).out || this.cwd);
        let branch = this._git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
        if (!branch || branch === 'HEAD') {
            const sha = this._git(['rev-parse', '--short', 'HEAD']).out;
            branch = sha ? `detached-${sha}` : 'detached';
        }
        const head = this._git(['rev-parse', 'HEAD']).out || null;
        let baseline = null;
        for (const base of ['@{u}', 'origin/main', 'origin/master', 'main', 'master']) {
            const mb = this._git(['merge-base', 'HEAD', base]);
            if (mb.ok && mb.out) {
                baseline = mb.out;
                break;
            }
        }
        return {vcs: 'git', repoRoot: root, repoId: root, branch, baseline, head, extra: {}};
    }

    listChanges() {
        const id = this.identify();
        const committed = id.baseline
            ? parseNameStatus(this._git(['diff', '--name-status', `${id.baseline}..HEAD`]).out)
            : [];
        const staged = parseNameStatus(this._git(['diff', '--cached', '--name-status']).out);
        const unstaged = parseNameStatus(this._git(['diff', '--name-status']).out);
        const untracked = [];
        const u = this._git(['ls-files', '--others', '--exclude-standard']);
        if (u.ok) {
            for (const line of u.out.split('\n')) {
                const p = line.trim();
                if (p) untracked.push({status: '?', path: p});
            }
        }
        return {committed, staged, unstaged, untracked};
    }

    snapshot({maxBytes = DEFAULT_SNAPSHOT_BYTES} = {}) {
        const id = this.identify();
        // --no-ext-diff / --no-textconv: don't run configured external diff or
        // text-conversion helpers during a review (keep it inert and read-only).
        const flags = ['--no-ext-diff', '--no-textconv'];
        const layers = [];
        if (id.baseline)
            layers.push([
                'committed branch changes vs baseline',
                ['diff', ...flags, `${id.baseline}..HEAD`],
            ]);
        layers.push(['staged changes', ['diff', ...flags, '--cached']]);
        layers.push(['unstaged working-tree changes', ['diff', ...flags]]);
        const parts = [];
        for (const [label, a] of layers) {
            const r = this._git(a);
            if (r.ok && r.out.trim()) parts.push(`### ${label}\n\n\`\`\`diff\n${r.out}\n\`\`\``);
        }
        const {text, truncated} = clip(parts.join('\n\n'), maxBytes);
        const c = this.listChanges();
        return {
            text,
            truncated,
            files: dedupePaths([...c.committed, ...c.staged, ...c.unstaged, ...c.untracked]),
        };
    }

    fingerprint() {
        const id = this.identify();
        const f = ['--no-ext-diff', '--no-textconv'];
        // Hash actual diff CONTENT (not just name-status/stat) so an edit that keeps
        // the same line counts still changes the fingerprint. Include untracked paths.
        const content = [
            id.baseline ? this._git(['diff', ...f, `${id.baseline}..HEAD`]).out : '',
            this._git(['diff', ...f, '--cached']).out,
            this._git(['diff', ...f]).out,
        ].join('\n');
        const untracked = this.listChanges()
            .untracked.map((u) => u.path)
            .join('\n');
        return createHash('sha256')
            .update(`${id.baseline || ''}\n${id.head || ''}\n${content}\n${untracked}`)
            .digest('hex')
            .slice(0, 32);
    }
}

function dedupePaths(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
        if (item && item.path && !seen.has(item.path)) {
            seen.add(item.path);
            out.push(item);
        }
    }
    return out;
}
