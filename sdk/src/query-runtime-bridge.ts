import type { QueryRegistry } from './query/registry.js';
import type { TransportMode } from './gsd-transport-policy.js';
import type { QueryCommandResolution } from './query/query-command-resolution-strategy.js';
import { resolveQueryCommand } from './query/query-command-resolution-strategy.js';
import { QueryExecutionPolicy } from './query-execution-policy.js';
import { QueryNativeHotpathAdapter } from './query-native-hotpath-adapter.js';

export interface RuntimeBridgeExecuteInput {
  legacyCommand: string;
  legacyArgs: string[];
  registryCommand: string;
  registryArgs: string[];
  mode: TransportMode;
  projectDir: string;
  workstream?: string;
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
  ) {}

  getRegistry(): QueryRegistry {
    return this.registry;
  }

  resolve(command: string, args: string[]): QueryCommandResolution | null {
    return resolveQueryCommand(command, args, this.registry);
  }

  async execute(input: RuntimeBridgeExecuteInput): Promise<unknown> {
    return this.executionPolicy.execute({
      legacyCommand: input.legacyCommand,
      legacyArgs: input.legacyArgs,
      registryCommand: input.registryCommand,
      registryArgs: input.registryArgs,
      mode: input.mode,
      projectDir: input.projectDir,
      workstream: input.workstream,
      preferNativeQuery: this.shouldUseNativeQuery(),
    });
  }

  async dispatchHotpath(
    legacyCommand: string,
    legacyArgs: string[],
    registryCommand: string,
    registryArgs: string[],
    mode: TransportMode,
  ): Promise<unknown> {
    return this.nativeHotpathAdapter.dispatch(
      legacyCommand,
      legacyArgs,
      registryCommand,
      registryArgs,
      mode,
    );
  }
}
