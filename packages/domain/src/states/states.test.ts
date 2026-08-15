import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "../errors/InvalidTransitionError";
import { CONVERSATION_TRANSITIONS, assertConversationTransition } from "./conversation";
import { ORDER_TRANSITIONS, assertOrderTransition } from "./order";
import { ITEM_TRANSITIONS, assertItemTransition } from "./item";
import { STUDY_TRANSITIONS, assertStudyTransition } from "./study";
import { LISTING_TRANSITIONS, assertListingTransition } from "./listing";
import { MATCH_TRANSITIONS, assertMatchTransition } from "./match";

type Case<TState extends string> = {
  name: string;
  transitions: Record<TState, readonly TState[]>;
  assertFn: (from: TState, to: TState) => void;
};

function runStateMapCases<TState extends string>({ name, transitions, assertFn }: Case<TState>) {
  describe(name, () => {
    const states = Object.keys(transitions) as TState[];

    for (const from of states) {
      for (const to of transitions[from]) {
        it(`allows ${from} -> ${to}`, () => {
          expect(() => assertFn(from, to)).not.toThrow();
        });
      }

      const disallowed = states.filter((to) => !transitions[from].includes(to) && to !== from);
      const to = disallowed[0];
      if (to) {
        it(`rejects ${from} -> ${to}`, () => {
          expect(() => assertFn(from, to)).toThrow(InvalidTransitionError);
        });
      }
    }
  });
}

runStateMapCases({
  name: "conversation",
  transitions: CONVERSATION_TRANSITIONS,
  assertFn: assertConversationTransition,
});
runStateMapCases({
  name: "order",
  transitions: ORDER_TRANSITIONS,
  assertFn: assertOrderTransition,
});
runStateMapCases({ name: "item", transitions: ITEM_TRANSITIONS, assertFn: assertItemTransition });
runStateMapCases({
  name: "study",
  transitions: STUDY_TRANSITIONS,
  assertFn: assertStudyTransition,
});
runStateMapCases({
  name: "listing",
  transitions: LISTING_TRANSITIONS,
  assertFn: assertListingTransition,
});
runStateMapCases({
  name: "match",
  transitions: MATCH_TRANSITIONS,
  assertFn: assertMatchTransition,
});
