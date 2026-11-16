import { describe, expect, it } from 'vitest';
import { optionOrderLock } from './option-order';

const base = {
  keepOptionOrder: false,
  explanation: 'The common peroneal nerve winds round the fibular neck.',
  options: [{ text: 'Common peroneal' }, { text: 'Tibial' }, { text: 'Deep peroneal' }],
};

describe('option order lock', () => {
  it('lets a question with no letter references be shuffled', () => {
    expect(optionOrderLock(base)).toBeNull();
    expect(optionOrderLock({ ...base, pearls: ['Fibular neck → common peroneal'], quickRevision: 'Deep = dorsiflexion.' })).toBeNull();
  });

  it('keeps the order when anything shown with the answer names an option by letter', () => {
    const lockedBy = (extra: object) => optionOrderLock({ ...base, ...extra });
    expect(lockedBy({ quickRevision: 'Remember option B.' })).toEqual({ reason: 'explanation-names-options', match: 'option B' });
    expect(lockedBy({ pearls: ['Choice (C) is a trap'] })).toMatchObject({ reason: 'explanation-names-options' });
    expect(
      lockedBy({ options: [{ text: 'Common peroneal' }, { text: 'Tibial', explanation: 'Unlike option A, it spares eversion.' }] }),
    ).toMatchObject({ reason: 'explanation-names-options' });
  });
});
