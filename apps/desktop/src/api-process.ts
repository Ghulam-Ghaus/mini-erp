import { spawn, type ChildProcess } from 'node:child_process';

export interface ApiProcessOptions {
  /** Absolute path of the built API entry (apps/api/dist/main.js). */
  entry: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Called when the process exits. `expected` is true when we stopped it ourselves. */
  onExit?: (code: number | null, expected: boolean) => void;
}

/**
 * Runs the Nest API as a child process using Electron's bundled Node
 * (ELECTRON_RUN_AS_NODE), so no separate Node install is needed.
 */
export class ApiProcess {
  private child: ChildProcess | undefined;
  private readonly expectedExits = new WeakSet<ChildProcess>();

  constructor(private readonly options: ApiProcessOptions) {}

  get running(): boolean {
    return this.child !== undefined;
  }

  start(): void {
    if (this.child) return;
    const child = spawn(process.execPath, [this.options.entry], {
      cwd: this.options.cwd,
      env: { ...this.options.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(prefixLines(chunk)));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(prefixLines(chunk)));
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      this.options.onExit?.(code, this.expectedExits.has(child));
    });
    this.child = child;
  }

  /** Stops the process and waits for it to exit. */
  stop(): Promise<void> {
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      this.kill();
    });
  }

  /** Kills the process immediately without waiting (used while the app quits). */
  kill(): void {
    const child = this.child;
    if (!child) return;
    this.expectedExits.add(child);
    child.kill();
  }
}

function prefixLines(chunk: Buffer): string {
  return chunk
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => `[api] ${line}\n`)
    .join('');
}
