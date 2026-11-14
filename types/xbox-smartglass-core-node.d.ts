// Minimal typings for the parts of xbox-smartglass-core-node that
// src/console/smartglass/ uses. The library ships no types and reaches
// for many private fields; only the adapter may import it.

declare module 'xbox-smartglass-core-node' {
  import type { EventEmitter } from 'node:events';

  export interface SgCrypto {
    _encrypt(data: Buffer, key: Buffer, iv?: Buffer): Buffer;
    _sign(data: Buffer): Buffer | Uint8Array;
    getIv(): Buffer;
    getEncryptionKey(): Buffer;
  }

  export interface SgConsole {
    get_requestnum(): number;
    _request_num: number;
    _target_participant_id: number;
    _source_participant_id: number;
    _crypto: SgCrypto;
  }

  export interface SgDiscoveryResult {
    remote: { address: string; port: number };
    message: { name?: string; uuid?: string; type?: number; flags?: number; certificate?: Buffer };
  }

  export interface SgChannelManager {
    getStatus(): boolean;
    getChannel(): Buffer;
    _channel_status: boolean;
    _channel_server_id: Buffer | null;
    _channel_client_id: number;
    _smartglass: SgClient | null;
  }

  export interface SgManager {
    _channel_manager: SgChannelManager;
    sendCommand(cmd: string): Promise<unknown>;
  }

  export interface SgClient {
    _events: EventEmitter;
    _console: SgConsole;
    _managers: Record<string, SgManager>;
    _connection_status: boolean;
    _last_received_time: number;
    _interval_timeout: NodeJS.Timeout | false;
    _send(packet: Buffer): void;
    _closeClient(): void;
    discovery(ip?: string): Promise<SgDiscoveryResult[]>;
    connect(ip: string): Promise<unknown>;
    disconnect(): void;
    isConnected(): boolean;
    addManager(name: string, manager: SgManager): void;
    getManager(name: string): SgManager | undefined;
    getActiveApp(): unknown;
    powerOn(options: { ip: string; live_id: string; tries?: number }): Promise<unknown>;
  }

  const Smartglass: () => SgClient;
  export default Smartglass;
}

declare module 'xbox-smartglass-core-node/src/channels/systeminput' {
  import type { SgManager } from 'xbox-smartglass-core-node';
  const SystemInputChannel: () => SgManager & { _button_map: Record<string, number> };
  export = SystemInputChannel;
}

declare module 'xbox-smartglass-core-node/src/channels/systemmedia' {
  import type { SgManager } from 'xbox-smartglass-core-node';
  const SystemMediaChannel: () => SgManager & { _media_commands: Record<string, number> };
  export = SystemMediaChannel;
}

declare module 'xbox-smartglass-core-node/src/packet/packer' {
  import type { SgConsole } from 'xbox-smartglass-core-node';
  interface Packet {
    set(field: string, value: unknown): void;
    pack(console?: SgConsole): Buffer;
    setChannel(channel: Buffer): void;
  }
  const Packer: (type: string) => Packet;
  export = Packer;
}

declare module 'xbox-smartglass-core-node/src/packet/structure' {
  interface Structure {
    writeBytes(buf: Buffer): Structure;
    writeUInt16(n: number): Structure;
    writeUInt32(n: number): Structure;
    writeInt32(n: number): Structure;
    writeSGString(s: string): Structure;
    toBuffer(): Buffer;
  }
  const PacketStructure: (buf?: Buffer) => Structure;
  export = PacketStructure;
}
