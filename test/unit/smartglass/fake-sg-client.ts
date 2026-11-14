// Stand-in for the library's client object, implementing just the
// surface SmartGlassAdapter uses. Crypto is an identity stub so packet
// payloads stay readable in assertions.

import { EventEmitter } from 'node:events';
import type { SgClient, SgCrypto, SgDiscoveryResult, SgManager } from 'xbox-smartglass-core-node';

export const SIG = Buffer.alloc(32, 0xaa);

export const stubCrypto: SgCrypto = {
  _encrypt: (data: Buffer) => Buffer.from(data),
  _sign: () => SIG,
  getIv: () => Buffer.alloc(16),
  getEncryptionKey: () => Buffer.alloc(16),
};

export class FakeSgClient implements SgClient {
  _events = new EventEmitter();
  _console = {
    _request_num: 0,
    _target_participant_id: 0,
    _source_participant_id: 7,
    _crypto: stubCrypto,
    get_requestnum(): number {
      return this._request_num++;
    },
  };
  _managers: Record<string, SgManager> = {};
  _connection_status = false;
  _last_received_time = Math.floor(Date.now() / 1000);
  _interval_timeout: NodeJS.Timeout | false = false;
  sent: Buffer[] = [];
  connectError: unknown = null;
  discoveryResult: SgDiscoveryResult[] = [];
  closed = false;

  _send(packet: Buffer): void { this.sent.push(packet); }
  _closeClient(): void { this.closed = true; this._connection_status = false; }
  discovery(): Promise<SgDiscoveryResult[]> { return Promise.resolve(this.discoveryResult); }
  connect(): Promise<unknown> {
    // The library rejects with plain objects ({ error, message }), so the fake does too.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (this.connectError) return Promise.reject(this.connectError);
    this._connection_status = true;
    return Promise.resolve({});
  }
  disconnect(): void { this._connection_status = false; }
  isConnected(): boolean { return this._connection_status; }
  addManager(name: string, manager: SgManager): void { this._managers[name] = manager; }
  getManager(name: string): SgManager | undefined { return this._managers[name]; }
  getActiveApp(): unknown { return null; }
  powerOn(): Promise<unknown> { return Promise.resolve({}); }

  /** Simulate the Xbox accepting a channel request. */
  acceptChannel(clientId: number, channelId: Buffer): void {
    this._events.emit('_on_start_channel_response', {
      packet_decoded: { protected_payload: { channel_request_id: clientId, result: 0, target_channel_id: channelId } },
    });
  }
}

/** Split a sealed packet (identity crypto) into header fields and payload. */
export function unseal(packet: Buffer): { len: number; seq: number; flags: string; channel: string; payload: Buffer } {
  const len = packet.readUInt16BE(2);
  return {
    len,
    seq: packet.readUInt32BE(4),
    flags: packet.subarray(16, 18).toString('hex'),
    channel: packet.subarray(18, 26).toString('hex'),
    payload: packet.subarray(26, 26 + len),
  };
}
