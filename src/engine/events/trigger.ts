import { evaluateCondition } from "@/engine/conditions/evaluate";
import type { EngineContext } from "@/engine/context";
import { applyEffects, type EffectOutcome } from "@/engine/effects/registry";
import type { EventDefinition, EventTrigger } from "@/types";

export interface TriggeredEvent {
  eventId: string;
  trigger: EventTrigger;
  appliedEffects: string[];
}

export interface EventPassResult {
  outcome: EffectOutcome;
  triggered: TriggeredEvent[];
}

/**
 * Runs one trigger phase. Events are applied highest-priority first, and each event's
 * effects are visible to the conditions of later events in the same phase so content can
 * chain reactions without extra turns.
 */
export function runEventPass(
  trigger: EventTrigger,
  events: EventDefinition[],
  context: EngineContext,
  outcome: EffectOutcome,
): EventPassResult {
  const candidates = events
    .filter((event) => event.trigger === trigger)
    .filter((event) => !(event.once && context.firedEventIds.has(event.id)))
    .sort((a, b) => b.priority - a.priority);

  let current = outcome;
  const triggered: TriggeredEvent[] = [];

  for (const event of candidates) {
    const phaseContext: EngineContext = { ...context, state: current.state };
    if (!evaluateCondition(event.condition, phaseContext)) continue;

    current = applyEffects(event.effects, phaseContext, current);
    context.firedEventIds.add(event.id);
    triggered.push({
      eventId: event.id,
      trigger,
      appliedEffects: event.effects.map((effect) => effect.type),
    });
  }

  return { outcome: current, triggered };
}
