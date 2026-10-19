/** Pure injected production owner; sockets are never proof of application completion. */
export interface HttpListener {
  subscribe(events: { ready(): void; error(error: unknown): void; close(): void }): () => void;
  /** Fulfillment proves the listener closed (including a failed bind with no listener). */
  close(): Promise<void>;
}
export interface HttpLifetimeOptions {
  stopAdmission(): void;
  cancel(): void;
  armDeadline(): void;
  joinStartup(): Promise<void>;
  joinRunner(): Promise<void>;
  dispose(): void;
  closeStore(): Promise<void>;
  clearDeadline(): void;
  removeSignals(): void;
}
interface OwnedRequest { task: Promise<unknown>; response: Promise<unknown>; done: Promise<void> }
export class HttpLifetime {
  private accepting = true;
  private readonly requests = new Set<OwnedRequest>();
  private failed = false;
  private failure: unknown;
  private listener: HttpListener | undefined;
  private unsubscribe: (() => void) | undefined;
  private listenerClosed = false;
  private expectedClose = false;
  private listenerReady = false;
  private finishReady!: () => void;
  private readonly readiness = new Promise<void>(resolve => { this.finishReady = resolve; });
  private finishLifetime!: () => void;
  private readonly lifetime = new Promise<void>(resolve => { this.finishLifetime = resolve; });
  private stopTask: Promise<void> | undefined;
  private stopObservation: Promise<void> | undefined;
  constructor(private readonly options: HttpLifetimeOptions) {}
  status() {
    return { accepting: this.accepting, requests: this.requests.size, failed: this.failed,
      failure: this.failure, listenerReady: this.listenerReady, listenerClosed: this.listenerClosed };
  }
  /** Register before invoking work. The returned promise itself is observed and retained.
   * Neither a disconnected caller nor its AbortSignal can release this ownership record.
   */
  handle<T>(work: () => T | PromiseLike<T>, refuse: () => T): Promise<T> {
    if (!this.accepting) return Promise.resolve().then(refuse);
    const task = Promise.resolve().then(work);
    const response = task.then(value => value, error => { this.fail(error); throw error; });
    let record!: OwnedRequest;
    // Retain a nonrejecting completion observation, even if the adapter drops response.
    const done = response.then(() => { this.requests.delete(record); }, () => { this.requests.delete(record); });
    record = { task, response, done }; this.requests.add(record);
    return response;
  }
  attach(listener: HttpListener): void {
    if (this.listener) throw new Error('http_listener_already_owned');
    this.listener = listener;
    this.unsubscribe = listener.subscribe({
      ready: () => { this.listenerReady = true; this.finishReady(); },
      error: error => { this.finishReady(); this.fail(error); },
      close: () => {
        this.listenerClosed = true; this.finishReady();
        if (!this.expectedClose) this.fail(new Error('http_listener_unexpected_close'));
      },
    });
  }
  private remember(error: unknown): void {
    if (!this.failed) { this.failed = true; this.failure = error; }
  }
  fail(error: unknown): Promise<void> { this.remember(error); return this.stop(); }
  /** Synchronous refusal/cancellation, one retained and immediately observed cleanup task. */
  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask;
    this.accepting = false;
    // Schedule joins only after publishing stopTask; reentrant notifications see the same task.
    this.stopTask = Promise.resolve().then(() => this.join());
    this.stopObservation = this.stopTask.then(() => { this.finishLifetime(); }, () => { this.finishLifetime(); });
    for (const action of [this.options.stopAdmission, this.options.armDeadline, this.options.cancel]) {
      try { action(); } catch (error) { this.remember(error); }
    }
    return this.stopTask;
  }
  private async joinRequests(): Promise<void> {
    while (this.requests.size) await Promise.all([...this.requests].map(request => request.done));
  }
  private async joinListener(): Promise<void> {
    if (!this.listener || this.listenerClosed) return;
    // Do not close a still-pending bind and then mistake NOT_RUNNING for final closure.
    await this.readiness;
    if (this.listenerClosed) return;
    this.expectedClose = true;
    await this.listener.close();
    this.listenerClosed = true;
  }
  private async join(): Promise<void> {
    const startup = Promise.resolve().then(this.options.joinStartup);
    const observe = (task: Promise<void>) => task.catch(error => { this.remember(error); throw error; });
    // Independent retained joins: no rejected listener/startup/Runner join skips another.
    // Runner/listener creation is finished before their final joins are captured.
    const joins = await Promise.allSettled([
      observe(startup),
      observe(startup.then(() => this.joinListener(), () => this.joinListener())),
      observe(this.joinRequests()),
      observe(startup.then(this.options.joinRunner, this.options.joinRunner)),
    ]);
    for (const result of joins) if (result.status === 'rejected') this.remember(result.reason);
    try { this.options.dispose(); } catch (error) { this.remember(error); }
    // Zero physical work never erases failed/unknown ownership or permits lock release.
    if (!this.failed) {
      try { await this.options.closeStore(); } catch (error) { this.remember(error); }
    }
    const listenerSafe = !this.listener || this.listenerClosed;
    if (listenerSafe) {
      try { this.unsubscribe?.(); this.options.removeSignals(); this.options.clearDeadline(); }
      catch (error) { this.remember(error); }
    }
    // An unproved listener close retains its observers and the original hard watchdog.
    if (this.failed) throw this.failure;
  }
  async wait(): Promise<void> {
    await this.lifetime;
    await this.stopObservation;
    await this.stopTask;
  }
}
