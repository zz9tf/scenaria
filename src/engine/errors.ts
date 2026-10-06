/** Base class for every deterministic engine failure. Thrown rather than silently defaulted. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class StatePathError extends EngineError {}
export class StateMutationError extends EngineError {}
export class UnknownConditionTypeError extends EngineError {}
export class UnknownEffectTypeError extends EngineError {}
export class ContentValidationError extends EngineError {}
export class ScenarioRuntimeError extends EngineError {}
