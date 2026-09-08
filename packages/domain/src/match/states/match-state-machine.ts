export type MatchState =
  | 'PENDING'
  | 'AWAITING_APPROVAL'
  | 'DISPUTED'
  | 'FINISHED'
  | 'CANCELED';

export type MatchEvent =
  | 'SUBMIT_WITH_VALIDATION'
  | 'SUBMIT_WITHOUT_VALIDATION'
  | 'APPROVE'
  | 'REJECT'
  | 'HOST_RESOLVE'
  | 'HOST_CANCEL';

const transitions: Readonly<Record<MatchState, Partial<Record<MatchEvent, MatchState>>>> = {
  PENDING: {
    SUBMIT_WITH_VALIDATION: 'AWAITING_APPROVAL',
    SUBMIT_WITHOUT_VALIDATION: 'FINISHED',
    HOST_CANCEL: 'CANCELED',
  },
  AWAITING_APPROVAL: {
    APPROVE: 'FINISHED',
    REJECT: 'DISPUTED',
    HOST_CANCEL: 'CANCELED',
  },
  DISPUTED: {
    HOST_RESOLVE: 'FINISHED',
    HOST_CANCEL: 'CANCELED',
  },
  FINISHED: {},
  CANCELED: {},
};

export class InvalidMatchTransitionError extends Error {
  constructor(from: MatchState, event: MatchEvent) {
    super(`Invalid match transition: ${from} -> ${event}`);
    this.name = 'InvalidMatchTransitionError';
  }
}

export function transitionMatch(from: MatchState, event: MatchEvent): MatchState {
  const next = transitions[from][event];
  if (!next) throw new InvalidMatchTransitionError(from, event);
  return next;
}
