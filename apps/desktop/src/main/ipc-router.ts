import type { IpcMethod, IpcRequest, IpcResult } from '../../../../packages/contracts/src/ipc.js';
import { authorizeIpc, CapabilityRegistry } from './ipc-boundary.js';

export type LocalHandlers = Partial<Record<IpcMethod, (request: IpcRequest) => Promise<IpcResult<unknown>>>>;
export class IpcRouter {
  private readonly seen = new Map<number, Set<string>>();
  constructor(private readonly capabilities: CapabilityRegistry, private readonly handlers: LocalHandlers, private readonly localEnabled: () => boolean = () => false) {}
  release(owner: number): void { this.seen.delete(owner); this.capabilities.revokeOwner(owner); }
  async dispatch(input: unknown, senderId: number, frameUrl: string, allowedUrl: string, mainFrame: boolean): Promise<IpcResult<unknown>> {
    let requestId = '';
    try {
      const request = authorizeIpc(input, senderId, frameUrl, allowedUrl, mainFrame, this.capabilities);
      requestId = request.requestId;
      const seen = this.seen.get(senderId) ?? new Set<string>();
      if (seen.has(requestId)) throw new Error('Repeated request');
      seen.add(requestId); this.seen.set(senderId, seen);
      const handler = this.handlers[request.method];
      if (!handler) return { requestId, status: 'error', error: { code: 'STORAGE_UNAVAILABLE', message: 'Esta operación todavía no está disponible.' } };
      if (!request.method.startsWith('account.') && !request.method.startsWith('window.') && !this.localEnabled()) return { requestId, status: 'error', error: { code: 'SESSION_REQUIRED', message: 'Inicia sesión con una cuenta verificada para habilitar el CAD.' } };
      const result = await handler(request);
      return { ...result, requestId };
    } catch {
      return { requestId, status: 'error', error: { code: 'ACCESS_DENIED', message: 'No se pudo autorizar la solicitud local.' } };
    }
  }
}
