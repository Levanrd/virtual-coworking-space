import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryLink } from '../src/authLinks.js';

test('recovery links preserve the workspace and pending invitation while scrubbing credentials', () => {
  assert.deepEqual(recoveryLink('https://example.test/?space=team#verify=secret&invite=invite-token'), {
    kind:'verify', token:'secret', cleanURL:'/?space=team#invite=invite-token',
  });
  assert.deepEqual(recoveryLink('https://example.test/#reset=one&verify=two'), {
    kind:'reset', token:'one', cleanURL:'/',
  });
  assert.equal(recoveryLink('https://example.test/#invite=invite-token'), null);
  assert.equal(recoveryLink('https://example.test/'), null);
});
