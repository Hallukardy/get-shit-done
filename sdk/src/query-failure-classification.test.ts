import { describe, expect, it } from 'vitest';
import {
  errorMessage,
  isTimeoutMessage,
  parseTimeoutMs,
  timeoutMessage,
  toFailureSignal,
} from './query-failure-classification.js';
import { GSDToolsError } from './gsd-tools-error.js';

describe('query failure classification', () => {
  it('extracts timeout metadata from message', () => {
    const msg = timeoutMessage('state', ['load'], 30000);
    expect(isTimeoutMessage(msg)).toBe(true);
    expect(parseTimeoutMs(msg)).toBe(30000);
  });

  it('normalizes unknown error values', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(new Error('x'))).toBe('x');
  });

  it('prefers typed classification from GSDToolsError', () => {
    const err = new GSDToolsError('x', 'state', ['load'], null, '', {
      classification: { kind: 'timeout', timeoutMs: 2000 },
    });
    expect(toFailureSignal(err)).toEqual({ kind: 'timeout', message: 'x', timeoutMs: 2000 });
  });
});
