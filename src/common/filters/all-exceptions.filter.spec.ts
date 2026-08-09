import { Logger, type ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AllExceptionsFilter } from './all-exceptions.filter';

const makeHost = (response: Partial<Response>, request: Partial<Request> = {}): ArgumentsHost =>
  ({
    switchToHttp: () => ({
      getResponse: () => response as Response,
      getRequest: () => request as Request,
    }),
  }) as ArgumentsHost;

describe('AllExceptionsFilter — mid-stream cancellation (headersSent)', () => {
  it('destroys the response and never touches it, once headers are already sent — but still logs the error', () => {
    // This filter is the app-wide APP_FILTER (src/app.module.ts), so the
    // headersSent bail-out must not silently drop logging for every
    // streaming endpoint — only response-writing is unsafe here, not
    // observability. Regression for the security-review finding that the
    // first cut of this guard returned before ever reaching logger.error().
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const response: Partial<Response> = {
      headersSent: true,
      destroy: jest.fn(),
      status: jest.fn(),
      setHeader: jest.fn(),
      type: jest.fn(),
      json: jest.fn(),
    };
    const filter = new AllExceptionsFilter();

    filter.catch(new Error('client disconnected mid-export'), makeHost(response));

    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.type).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('still builds and writes a Problem Details response when headers are not yet sent', () => {
    const statusChain = { type: jest.fn(), json: jest.fn() };
    statusChain.type.mockReturnValue(statusChain);
    const response: Partial<Response> = {
      headersSent: false,
      destroy: jest.fn(),
      status: jest.fn(() => statusChain) as unknown as Response['status'],
    };
    const filter = new AllExceptionsFilter();

    filter.catch(new Error('boom'), makeHost(response, { url: '/api/whatever' }));

    expect(response.destroy).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(statusChain.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, instance: '/api/whatever' }),
    );
  });
});
