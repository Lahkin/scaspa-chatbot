/**
 * The demo script, and the opening state.
 *
 * One question per facility — cruise, ferry, cargo collection, container tariff —
 * so whichever a judge taps lands on a different part of the knowledge base
 * rather than four variations of the same retrieval.
 *
 * In its own module because a file that exports both components and constants
 * breaks fast refresh: editing the list would reload the component tree and drop
 * the conversation being demonstrated.
 */
export const SUGGESTED_QUESTIONS = [
  'Where do cruise ships dock in St. Kitts?',
  'What time is the last ferry back from Nevis?',
  'Where do I collect a barrel shipped to St. Kitts?',
  'How much is a 40-foot container?',
] as const;
