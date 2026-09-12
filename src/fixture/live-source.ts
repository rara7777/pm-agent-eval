import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ReadonlySource } from './fixture.ts';

const exec = promisify(execFile);

/**
 * The read-only tools with a real backend behind them. Eval mode never uses
 * this — it goes through the fixture — so the two modes share the loop, the
 * prompt and the model, and differ only in what answers the four questions.
 *
 * A tool with no backend throws rather than inventing an answer. Production
 * should not offer the model a tool that cannot work; `availableTools()` says
 * which ones this config can actually serve.
 */
export type LiveConfig = {
  /** Directories `search_repo` may grep, absolute paths. */
  repoRoots: string[];
  /** Directories `read_docs` may read from, absolute paths. */
  docsRoots: string[];
  maxHits?: number;
};

export class NoBackendError extends Error {
  constructor(tool: string) {
    super(`production 沒有接 ${tool} 的後端，這個工具不應該出現在給模型的清單裡`);
    this.name = 'NoBackendError';
  }
}

export class OutsideRootError extends Error {
  constructor(path: string) {
    super(`${path} 不在允許讀取的目錄底下`);
    this.name = 'OutsideRootError';
  }
}

type GitGrep = (root: string, query: string) => Promise<string>;

const gitGrep: GitGrep = async (root, query) => {
  try {
    const { stdout } = await exec('git', ['grep', '-n', '--no-color', '-e', query], { cwd: root });
    return stdout;
  } catch (err) {
    // git grep exits 1 when nothing matched, which is not a failure here.
    if ((err as { code?: number }).code === 1) return '';
    throw err;
  }
};

export class LiveSource implements ReadonlySource {
  #config: LiveConfig;
  #grep: GitGrep;

  constructor(config: LiveConfig, grep: GitGrep = gitGrep) {
    this.#config = config;
    this.#grep = grep;
  }

  /** Which of the four this config can answer. The rest must not be offered. */
  availableTools(): string[] {
    const out: string[] = [];
    if (this.#config.repoRoots.length > 0) out.push('search_repo');
    if (this.#config.docsRoots.length > 0) out.push('read_docs');
    return out;
  }

  async fetch(tool: string, args: Record<string, unknown>): Promise<string> {
    switch (tool) {
      case 'search_repo':
        return this.#searchRepo(String(args.query ?? ''));
      case 'read_docs':
        return this.#readDocs(String(args.path ?? ''));
      default:
        throw new NoBackendError(tool);
    }
  }

  async #searchRepo(query: string): Promise<string> {
    if (query.trim() === '') return '沒有給查詢字串。';
    const max = this.#config.maxHits ?? 30;
    const lines: string[] = [];

    for (const root of this.#config.repoRoots) {
      const stdout = await this.#grep(root, query);
      for (const line of stdout.split('\n')) {
        if (line.trim() === '' || lines.length >= max) continue;
        lines.push(`${relative(process.cwd(), root) || '.'}/${line}`);
      }
    }

    if (lines.length === 0) return `找不到符合 ${query} 的程式碼。`;
    const capped = lines.length >= max ? `\n（只列前 ${max} 筆）` : '';
    return lines.join('\n') + capped;
  }

  async #readDocs(path: string): Promise<string> {
    if (path.startsWith('redmine://')) throw new NoBackendError('read_docs 的 redmine:// 來源');

    const wanted = resolve(path);
    const allowed = this.#config.docsRoots.some((root) => {
      const rel = relative(resolve(root), wanted);
      // An empty rel is the root itself; `..` climbs out of it; an absolute rel
      // means the two paths share no prefix at all.
      return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    });
    if (!allowed) throw new OutsideRootError(path);

    return readFileSync(wanted, 'utf8');
  }
}
