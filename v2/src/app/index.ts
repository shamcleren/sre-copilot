import type { TurnInput, RuntimeResult } from '../contracts';
import { executeCase } from '../runtime';
import type { RuntimeExecutionOptions } from '../runtime';

export interface V2BootstrapResult {
  runTurn(input: TurnInput, options?: RuntimeExecutionOptions): RuntimeResult | Promise<RuntimeResult>;
}

function mergeRuntimeExecutionOptions(
  baseOptions?: RuntimeExecutionOptions,
  overrideOptions?: RuntimeExecutionOptions,
): RuntimeExecutionOptions | undefined {
  const adapter = overrideOptions?.adapter ?? baseOptions?.adapter;
  const adapterContext = {
    ...(baseOptions?.adapterContext ?? {}),
    ...(overrideOptions?.adapterContext ?? {}),
  };

  if (!adapter && Object.keys(adapterContext).length === 0) {
    return undefined;
  }

  return {
    ...(adapter ? { adapter } : {}),
    ...(Object.keys(adapterContext).length > 0 ? { adapterContext } : {}),
  };
}

export function bootstrapV2(defaultOptions: RuntimeExecutionOptions = {}): V2BootstrapResult {
  return {
    runTurn(input: TurnInput, options?: RuntimeExecutionOptions) {
      const mergedOptions = mergeRuntimeExecutionOptions(defaultOptions, options);
      if (!mergedOptions?.adapter) {
        return executeCase(input);
      }
      return executeCase(input, mergedOptions as RuntimeExecutionOptions & { adapter: NonNullable<RuntimeExecutionOptions['adapter']> });
    },
  };
}

export function runV2Turn(input: TurnInput) {
  return executeCase(input);
}

export function runV2TurnWithAdapter(input: TurnInput, options: RuntimeExecutionOptions) {
  const mergedOptions = mergeRuntimeExecutionOptions(undefined, options);
  if (!mergedOptions?.adapter) {
    throw new Error('runV2TurnWithAdapter requires a runtime adapter');
  }
  return executeCase(input, mergedOptions as RuntimeExecutionOptions & { adapter: NonNullable<RuntimeExecutionOptions['adapter']> });
}
