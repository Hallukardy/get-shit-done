import { GSDError, exitCodeFor } from './errors.js';
import { failureClassification, GSDToolsError, timeoutClassification } from './gsd-tools-error.js';
import { errorMessage, toFailureSignal } from './query-failure-classification.js';

/**
 * Module owning projection of internal errors to GSDToolsError contract.
 */
export function toGSDToolsError(command: string, args: string[], err: unknown): GSDToolsError {
  if (err instanceof GSDError) {
    return new GSDToolsError(
      err.message,
      command,
      args,
      exitCodeFor(err.classification),
      '',
      { cause: err },
    );
  }

  const msg = errorMessage(err);
  const signal = toFailureSignal(err);
  const classification = signal.kind === 'timeout'
    ? timeoutClassification(signal.timeoutMs)
    : failureClassification();

  return new GSDToolsError(
    msg,
    command,
    args,
    1,
    '',
    err instanceof Error
      ? { cause: err, classification }
      : { classification },
  );
}
