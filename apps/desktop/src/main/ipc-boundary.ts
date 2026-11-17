import { randomUUID } from 'node:crypto';
import { parseIpcRequest } from '../../../../packages/contracts/src/ipc.js';

export class CapabilityRegistry {
  private readonly entries = new Map<string, { owner: number; kind: 'document' | 'job' | 'recovery'; value: unknown }>();
  issue(owner: number, kind: 'document' | 'job' | 'recovery', value: unknown): string {
    const id = randomUUID(); this.entries.set(id, { owner, kind, value }); return id;
  }
  resolve(id: string, owner: number, kind: 'document' | 'job' | 'recovery'): unknown {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner || entry.kind !== kind) throw new Error('Capacidad no autorizada.');
    return entry.value;
  }
  revokeOwner(owner: number): void {
    for (const [id, entry] of this.entries) if (entry.owner === owner) this.entries.delete(id);
  }
}

export function authorizeIpc(input: unknown, senderId: number, frameUrl: string, allowedUrl: string, isMainFrame: boolean, capabilities: CapabilityRegistry) {
  if (!isMainFrame || frameUrl !== allowedUrl) throw new Error('Origen IPC no autorizado.');
  const request = parseIpcRequest(input);
  for (const [field, kind] of [['documentHandle', 'document'], ['jobId', 'job'], ['recoveryId', 'recovery']] as const) {
    if (typeof request[field] === 'string') capabilities.resolve(request[field], senderId, kind);
  }
  return request;
}
