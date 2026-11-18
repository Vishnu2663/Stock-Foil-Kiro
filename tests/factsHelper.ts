import type { PayFacts } from '../src/ai/index';

/** Simulates the UI building facts from a result that also carries names and an id. */
export function factsFromResult(f: PayFacts, personal: { worker: string; employer: string; id: string }): PayFacts {
  const withPersonal = { ...f, ...personal } as PayFacts & typeof personal;
  return withPersonal; // the extra fields must be dropped by anonymise() inside buildPrompt
}
