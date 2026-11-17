import { expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import { DefaultDenyGuard, SafeExceptionFilter } from '../../apps/api/src/http/bootstrap.js';

it.each([[400, 'INVALID_INPUT'], [404, 'RESOURCE_UNAVAILABLE'], [413, 'FILE_TOO_LARGE']] as const)('conserva estado HTTP %s sin filtrar el mensaje interno', (status, code) => {
  const body = vi.fn();
  const reply = { status: vi.fn().mockReturnThis(), setHeader: vi.fn(), json: body };
  const host = { switchToHttp: () => ({ getResponse: () => reply }) } as unknown as ArgumentsHost;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    new SafeExceptionFilter().catch(new HttpException('secret-token', status), host);
    expect(reply.status).toHaveBeenCalledWith(status);
    expect(body.mock.calls[0]?.[0]).toMatchObject({ code });
    expect(JSON.stringify(body.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
    expect(reply.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  } finally { log.mockRestore(); }
});

it('sin resolver del servidor no hay autorización implícita', async () => {
  await expect(new DefaultDenyGuard().canActivate({} as ExecutionContext)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
});
