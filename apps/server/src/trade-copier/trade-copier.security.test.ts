import assert from 'node:assert/strict';

import {
  buildJoinCode,
  maskAccountLogin,
  normalizeJoinCode,
  validateFollowerTokenBinding,
} from './utils/trade-copier.security';

const code = buildJoinCode('Yassine Gold Signals');
assert.match(code, /^YGS-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
assert.equal(normalizeJoinCode(' ygs-82k4-pro '), 'YGS-82K4-PRO');
assert.equal(maskAccountLogin('16005208'), '****5208');
assert.equal(maskAccountLogin('123'), '***');

assert.equal(
  validateFollowerTokenBinding(
    {
      accountLoginHash: 'login-hash',
      brokerServer: 'ICMarketsSC-Live',
      terminalFingerprintHash: 'terminal-hash',
    },
    {
      accountLoginHash: 'login-hash',
      brokerServer: 'ICMarketsSC-Live',
      terminalFingerprintHash: 'terminal-hash',
    },
  ).valid,
  true,
);

assert.deepEqual(
  validateFollowerTokenBinding(
    {
      accountLoginHash: 'login-hash',
      brokerServer: 'ICMarketsSC-Live',
      terminalFingerprintHash: 'terminal-hash',
    },
    {
      accountLoginHash: 'other-login',
      brokerServer: 'ICMarketsSC-Live',
      terminalFingerprintHash: 'terminal-hash',
    },
  ),
  { valid: false, reason: 'ACCOUNT_LOGIN_MISMATCH' },
);
