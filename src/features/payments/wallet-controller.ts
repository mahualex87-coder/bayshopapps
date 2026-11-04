import { WalletError, walletConfig, walletRequest, walletToken } from './wallet-contract.ts';
import type { NativeWallet, WalletConfig, WalletRequest, WalletToken } from './wallet-contract.ts';

// A shared lease prevents independent screen instances presenting two native sheets.
const leases = new WeakMap<NativeWallet, object>();
const retired = new WeakMap<NativeWallet, Set<string>>();
type Operation = { request: WalletRequest; lease: object; phase: 'presenting' | 'authorized' | 'completing'; timer: ReturnType<typeof setTimeout>; detach: () => void; reject: (e: WalletError) => void };
export function createWalletController(native: NativeWallet | null, platform: string, timing = { presentationMs: 130_000, processingMs: 25_000 }) {
  let current: Operation | null = null;
  let disposed = false;
  function available() { return !disposed && !!native && native.protocolVersion === 1 && (platform === 'ios' || platform === 'android'); }
  function release(op: Operation) {
    if (current !== op) return;
    clearTimeout(op.timer); op.detach(); current = null;
    if (native && leases.get(native) === op.lease) leases.delete(native);
  }
  function cancel(op: Operation, code: 'cancelled' | 'timeout') {
    if (current !== op) return;
    release(op);
    // Never leak a provider/native exception (which may contain payloads) to callers.
    if (native) void native.cancelAsync(op.request.requestId).catch(() => {});
    op.reject(new WalletError(code));
  }
  return {
    async isReadyAsync(config: WalletConfig): Promise<boolean> {
      if (!available() || !native || leases.has(native)) return false;
      try { return (await native.isReadyAsync(walletConfig(config, platform))) === true && available() && !leases.has(native); } catch { return false; }
    },
    presentAsync(input: WalletRequest, signal?: AbortSignal): Promise<WalletToken> {
      if (!available() || !native) return Promise.reject(new WalletError('unavailable'));
      let request: WalletRequest;
      try { request = walletRequest(input, platform); } catch (error) { return Promise.reject(error); }
      if (signal?.aborted) return Promise.reject(new WalletError('cancelled'));
      if (leases.has(native)) return Promise.reject(new WalletError('busy'));
      const used = retired.get(native) ?? new Set<string>();
      retired.set(native, used);
      // IDs are single-use for this JS runtime. Refuse exhaustion rather than permit a stale replay.
      if (used.has(request.requestId) || used.size >= 4096) return Promise.reject(new WalletError('invalid_request'));
      used.add(request.requestId);
      const lease = {}; leases.set(native, lease);
      return new Promise((resolve, reject) => {
        const op: Operation = { request, lease, phase: 'presenting', timer: setTimeout(() => cancel(op, 'timeout'), timing.presentationMs), detach: () => {}, reject };
        current = op;
        const abort = () => cancel(op, 'cancelled');
        signal?.addEventListener('abort', abort, { once: true });
        op.detach = () => signal?.removeEventListener('abort', abort);
        if (signal?.aborted) { cancel(op, 'cancelled'); return; }
        void native.presentAsync(request).then(value => {
          if (current !== op || signal?.aborted || disposed) return;
          try {
            const result = walletToken(value, request);
            op.phase = 'authorized'; clearTimeout(op.timer);
            op.timer = setTimeout(() => cancel(op, 'timeout'), timing.processingMs);
            // Do not store the token in controller state. Caller submits it once to BayShop.
            resolve(result);
          } catch (error) { release(op); void native.cancelAsync(request.requestId).catch(() => {}); reject(error); }
        }, error => {
          if (current !== op) return;
          release(op);
          const code = typeof error?.code === 'string' ? error.code : '';
          const mapped = { ERR_WALLET_CANCELLED: 'cancelled', ERR_WALLET_TIMEOUT: 'timeout', ERR_WALLET_BUSY: 'busy', ERR_WALLET_UNAVAILABLE: 'unavailable', ERR_WALLET_INVALID_REQUEST: 'invalid_request', ERR_WALLET_INVALID_RESULT: 'invalid_result' } as const;
          reject(new WalletError(mapped[code as keyof typeof mapped] ?? 'failed'));
        });
      });
    },
    async completeAsync(requestId: string, success: boolean): Promise<boolean> {
      const op = current;
      if (!native || !op || op.request.requestId !== requestId || op.phase !== 'authorized' || typeof success !== 'boolean') return false;
      op.phase = 'completing';
      try {
        const accepted = await native.completeAsync(requestId, success);
        if (current !== op) return false;
        release(op);
        return accepted === true;
      } catch { release(op); return false; }
    },
    async cancelAsync(requestId: string): Promise<boolean> {
      const op = current;
      if (!op || op.request.requestId !== requestId) return false;
      cancel(op, 'cancelled'); return true;
    },
    /** Call on account/route change and unmount; never reuse a controller after dispose. */
    dispose() { disposed = true; if (current) cancel(current, 'cancelled'); },
  };
}
