import type { QueryRegistry } from './query/registry.js';
import type { TransportMode } from './gsd-transport-policy.js';
import type { QueryCommandResolution } from './query/query-command-resolution-strategy.js';
import { resolveQueryCommand } from './query/query-command-resolution-strategy.js';
import { QueryExecutionPolicy } from './query-execution-policy.js';
import { QueryNativeHotpathAdapter } from './query-native-hotpath-adapter.js';
import { GSDToolsError } from './gsd-tools-error.js';
import type { TransportDecision } from './gsd-transport.js';

export interface RuntimeBridgeExecuteInput {
  legacyCommand: string;
  legacyArgs: string[];
  registryCommand: string;
  registryArgs: string[];
  mode: TransportMode;
  projectDir: string;
  workstream?: string;
}

export interface RuntimeBridgeDispatchEvent {
  type: 'query_dispatch';
  command: string;
  legacyCommand: string;
  mode: TransportMode;
  dispatchMode: 'native' | 'subprocess' | 'native_hotpath';
  reason?: TransportDecision['reason'];
  durationMs: number;
  outcome: 'success' | 'error';
  errorKind?: 'timeout' | 'failure';
}

export interface RuntimeBridgeHotpathEvent {
  type: 'query_hotpath_dispatch';
  command: string;
  legacyCommand: string;
  mode: TransportMode;
  dispatchMode: 'native_hotpath';
  durationMs: number;
  outcome: 'success' | 'error';
  errorKind?: 'timeout' | 'failure';
}

export interface RuntimeBridgeEvent {
  type: 'query_dispatch' | 'query_hotpath_dispatch';
}

export interface RuntimeBridgeOptions {
  strictSdk?: boolean;
  allowFallbackToSubprocess?: boolean;
  onDispatchEvent?: (event: RuntimeBridgeDispatchEvent | RuntimeBridgeHotpathEvent) => void;
}

/**
 * SDK Runtime Bridge Module.
 * Owns dispatch routing through the execution policy seam and hotpath/native fallback behavior.
 */
export class QueryRuntimeBridge {
  constructor(
    private readonly registry: QueryRegistry,
    private readonly executionPolicy: QueryExecutionPolicy,
    private readonly nativeHotpathAdapter: QueryNativeHotpathAdapter,
    private readonly shouldUseNativeQuery: () => boolean,
    private readonly options?: RuntimeBridgeOptions,
  ) {}

  getRegistry(): QueryRegistry {
    return this.registry;
  }

  resolve(command: string, args: string[]): QueryCommandResolution | null {
    return resolveQueryCommand(command, args, this.registry);
  }

  async execute(input: RuntimeBridgeExecuteInput): Promise<unknown> {
    const startedAt = Date.now();
    if (this.options?.strictSdk && !this.registry.has(input.registryCommand)) {
      const error = GSDToolsError.failure(
        `Strict SDK mode: command '${input.registryCommand}' has no native adapter`,
        input.legacyCommand,
        input.legacyArgs,
        null,
      );
      this.options?.onDispatchEvent?.({
        type: 'query_dispatch',
        command: input.registryCommand,
        legacyCommand: input.legacyCommand,
        mode: input.mode,
        dispatchMode: 'subprocess',
        reason: 'native_unregistered',
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        errorKind: 'failure',
      });
      throw error;
    }

    let transportDecision: TransportDecision | undefined;
    try {
      const result = await this.executionPolicy.execute({
        legacyCommand: input.legacyCommand,
        legacyArgs: input.legacyArgs,
        registryCommand: input.registryCommand,
        registryArgs: input.registryArgs,
        mode: input.mode,
        projectDir: input.projectDir,
        workstream: input.workstream,
        preferNativeQuery: this.shouldUseNativeQuery(),
        allowFallbackToSubprocess: this.options?.allowFallbackToSubprocess,
        onTransportDecision: (decision) => {
          transportDecision = decision;
        },
      });

      this.options?.onDispatchEvent?.({
        type: 'query_dispatch',
        command: input.registryCommand,
        legacyCommand: input.legacyCommand,
        mode: input.mode,
        dispatchMode: transportDecision?.dispatchMode ?? 'native',
        reason: transportDecision?.reason,
        durationMs: Date.now() - startedAt,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      const kind = error instanceof GSDToolsError ? error.classification.kind : 'failure';
      this.options?.onDispatchEvent?.({
        type: 'query_dispatch',
        command: input.registryCommand,
        legacyCommand: input.legacyCommand,
        mode: input.mode,
        dispatchMode: transportDecision?.dispatchMode ?? 'native',
        reason: transportDecision?.reason,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        errorKind: kind,
      });
      throw error;
    }
  }

  async dispatchHotpath(
    legacyCommand: string,
    legacyArgs: string[],
    registryCommand: string,
    registryArgs: string[],
    mode: TransportMode,
  ): Promise<unknown> {
    const startedAt = Date.now();
    try {
      const result = await this.nativeHotpathAdapter.dispatch(
        legacyCommand,
        legacyArgs,
        registryCommand,
        registryArgs,
        mode,
      );
      this.options?.onDispatchEvent?.({
        type: 'query_hotpath_dispatch',
        command: registryCommand,
        legacyCommand,
        mode,
        dispatchMode: 'native_hotpath',
        durationMs: Date.now() - startedAt,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      const kind = error instanceof GSDToolsError ? error.classification.kind : 'failure';
      this.options?.onDispatchEvent?.({
        type: 'query_hotpath_dispatch',
        command: registryCommand,
        legacyCommand,
        mode,
        dispatchMode: 'native_hotpath',
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        errorKind: kind,
      });
      throw error;
    }
  }
}
