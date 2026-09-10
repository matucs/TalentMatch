export interface PendingEventStore<TCommand> {
  findPending(limit: number): Promise<readonly TCommand[]>;
  markDispatched(command: TCommand, dispatchedAt: Date): Promise<void>;
}

export interface CommandQueue<TCommand> {
  enqueue(command: TCommand): Promise<void>;
}

export interface RelayObserver<TCommand> {
  delivered(command: TCommand, duration: number): void;
  failed(command: TCommand, error: unknown, duration: number): void;
}

export class OutboxRelay<TCommand> {
  public constructor(
    private readonly store: PendingEventStore<TCommand>,
    private readonly queue: CommandQueue<TCommand>,
    private readonly observer: RelayObserver<TCommand>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async runOnce(batchSize: number): Promise<number> {
    const commands = await this.store.findPending(batchSize);
    await Promise.all(commands.map(async (command) => this.deliver(command)));
    return commands.length;
  }

  private async deliver(command: TCommand): Promise<void> {
    const startedAt = performance.now();
    try {
      await this.queue.enqueue(command);
      await this.store.markDispatched(command, this.now());
      this.observer.delivered(command, performance.now() - startedAt);
    } catch (error) {
      this.observer.failed(command, error, performance.now() - startedAt);
    }
  }
}
