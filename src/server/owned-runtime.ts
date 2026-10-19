/** Pure injected ownership boundary. A slot includes reservation, commit, queue and execution.
 * The existing bound is 32 batches INCLUDING the running batch; it is not 32 per model.
 */
export class RuntimeRefused extends Error {
  constructor(readonly code: 'runner_closed' | 'runner_queue_full' | 'runner_fenced') { super(code); }
}
export interface RuntimeReceipt<T> { value: T; jobIds: string[]; replay: boolean }
export interface RuntimeFence { phase: 'admission' | 'queue' | 'execution'; jobIds: readonly string[] }
interface OwnedBatch {
  controller: AbortController; jobIds: string[];
  phase: 'committing' | 'queued' | 'running';
  admission?: Promise<unknown>; execution?: Promise<void>;
  done: Promise<void>; finish: () => void;
}
export class OwnedRuntime {
  private readonly batches = new Set<OwnedBatch>();
  private tail: Promise<void> = Promise.resolve();
  private stopped = false;
  private failure: RuntimeFence | null = null;
  constructor(private readonly execute: (ids: readonly string[], signal: AbortSignal) => Promise<void>) {}
  status() { return { stopped: this.stopped, fence: this.failure && { ...this.failure, jobIds: [...this.failure.jobIds] }, owned: this.batches.size }; }
  assertOpen(): void {
    if (this.failure) throw new RuntimeRefused('runner_fenced');
    if (this.stopped) throw new RuntimeRefused('runner_closed');
  }
  private fence(phase: RuntimeFence['phase'], jobIds: readonly string[]): void {
    this.failure ??= { phase, jobIds: [...jobIds] };
    this.stopAdmission();
  }
  stopAdmission(): void {
    this.stopped = true;
    for (const batch of this.batches) batch.controller.abort();
  }
  /** Reserve synchronously before invoking commit. Receipt completion never awaits execution.
   * A definitive refusal must prove no commit effects; every other failure is sticky.
   */
  async admit<T>(commit: () => Promise<RuntimeReceipt<T>>, definitiveRefusal: (error: unknown) => boolean): Promise<T> {
    this.assertOpen();
    if (this.batches.size >= 32) throw new RuntimeRefused('runner_queue_full');
    let finish!: () => void;
    const batch: OwnedBatch = { controller: new AbortController(), jobIds: [], phase: 'committing', done: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    this.batches.add(batch);
    const release = () => { this.batches.delete(batch); batch.finish(); };
    // This observed promise cannot reject. Both admission and execution remain retained here.
    const admission = Promise.resolve().then(commit).then(receipt => {
      try {
        batch.jobIds = [...receipt.jobIds];
        if (receipt.replay) { release(); return { ok: true as const, value: receipt.value }; }
        if (this.failure) throw new RuntimeRefused('runner_fenced');
        if (batch.jobIds.length < 1 || batch.jobIds.length > 2 || new Set(batch.jobIds).size !== batch.jobIds.length) throw new Error('invalid_owned_batch');
        batch.phase = 'queued';
        const execution = this.tail.then(async () => {
          // A previous failure never silently opens the next slot or starts more work.
          if (this.failure) throw new RuntimeRefused('runner_fenced');
          batch.phase = 'running';
          await this.execute(batch.jobIds, batch.controller.signal);
        }).then(() => { release(); }, () => { this.fence('execution', batch.jobIds); release(); });
        batch.execution = execution;
        this.tail = execution;
        return { ok: true as const, value: receipt.value };
      } catch (error) {
        this.fence('queue', batch.jobIds); release(); return { ok: false as const, error };
      }
    }, error => {
      let refusedBeforeEffects = false;
      try { refusedBeforeEffects = definitiveRefusal(error); } catch { /* A classifier failure supplies no refusal proof. */ }
      if (!refusedBeforeEffects) this.fence('admission', batch.jobIds);
      release(); return { ok: false as const, error: error as unknown };
    });
    batch.admission = admission;
    const result = await admission;
    if (!result.ok) throw result.error;
    return result.value;
  }
  /** After stopAdmission this is a stable complete join, including in-flight commits.
   * Cancellation-aware work is awaited; the process owner supplies the hard shutdown bound.
   */
  async drain(): Promise<void> {
    while (this.batches.size) await Promise.all([...this.batches].map(batch => batch.done));
    if (this.failure) throw new RuntimeRefused('runner_fenced');
  }
}
