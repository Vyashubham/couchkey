// Matches the Xbox's Acknowledge messages to the sequence numbers of
// packets we sent with need_ack, resolving each pending send exactly once.

export type AckOutcome = 'confirmed' | 'rejected' | 'timeout';

export interface AckBody {
  low_watermark?: number;
  processed_list?: { id: number }[];
  rejected_list?: { id: number }[];
}

interface Pending {
  resolve: (o: AckOutcome) => void;
  timer: NodeJS.Timeout;
}

export class AckTracker {
  private readonly pending = new Map<number, Pending>();

  /** Wait for the Xbox to acknowledge `seq`, or time out. */
  track(seq: number, timeoutMs: number): Promise<AckOutcome> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.settle(seq, 'timeout'); }, timeoutMs);
      this.pending.set(seq, { resolve, timer });
    });
  }

  /** Feed an Acknowledge payload. Unknown shapes are ignored. */
  handle(body: unknown): void {
    if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) return;
    const ack = body as AckBody;
    for (const r of ack.rejected_list ?? []) this.settle(r.id, 'rejected');
    for (const r of ack.processed_list ?? []) this.settle(r.id, 'confirmed');
    if (typeof ack.low_watermark === 'number') {
      for (const seq of [...this.pending.keys()]) if (seq <= ack.low_watermark) this.settle(seq, 'confirmed');
    }
  }

  /** Resolve everything still pending as timed out (e.g. on disconnect). */
  clear(): void {
    for (const seq of [...this.pending.keys()]) this.settle(seq, 'timeout');
  }

  get size(): number {
    return this.pending.size;
  }

  private settle(seq: number, outcome: AckOutcome): void {
    const p = this.pending.get(seq);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(seq);
    p.resolve(outcome);
  }
}
