import * as rruleNamespace from "rrule";
import type { Options } from "rrule";

/**
 * Interop shim for `rrule`.
 *
 * The package ships a CommonJS `main` and an ESM `module`. esbuild picks the
 * ESM build and gets named exports; Node's ESM loader picks the CJS bundle and
 * cannot statically detect them, so `import { RRule } from "rrule"` throws in
 * the test runner while working fine in the plugin bundle. Reading through the
 * namespace covers both shapes, so `recurrence.ts` has one import that works
 * everywhere and the tests exercise the same code the plugin ships.
 */

type RRuleCtor = typeof rruleNamespace.RRule;

const ns = rruleNamespace as unknown as {
	RRule?: RRuleCtor;
	default?: { RRule?: RRuleCtor };
};

export const RRule: RRuleCtor = (ns.RRule ?? ns.default?.RRule) as RRuleCtor;

export type RRuleInstance = InstanceType<RRuleCtor>;
export type RRuleOptions = Options;
