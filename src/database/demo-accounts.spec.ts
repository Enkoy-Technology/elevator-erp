import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { USER_ROLES } from '../types/auth.types';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo-accounts';

/**
 * The login screen shows a picker built from its own copy of this list,
 * because `web/` builds separately and cannot import from `src/`. A demo
 * where a button signs you in as nobody is a bad way to find that out, so
 * this reads the actual login source and checks the two agree.
 */
const LOGIN_PAGE = readFileSync(
  join(__dirname, '../../web/src/app/login/page.tsx'),
  'utf8',
);

describe('demo accounts', () => {
  it('covers every role, so a demo can be given from any seat', () => {
    expect([...DEMO_ACCOUNTS].map((a) => a.role).sort()).toEqual(
      [...USER_ROLES].sort(),
    );
  });

  it('gives each account a distinct email', () => {
    const emails = DEMO_ACCOUNTS.map((a) => a.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('is mirrored exactly by the login screen picker', () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(LOGIN_PAGE).toContain(account.email);
      expect(LOGIN_PAGE).toContain(`'${account.role}'`);
    }
  });

  it('shares the password the login screen fills in', () => {
    expect(LOGIN_PAGE).toContain(`const DEMO_PASSWORD = '${DEMO_PASSWORD}';`);
  });

  it('keeps the picker out of production bundles', () => {
    // NODE_ENV is inlined at build time, so this guard removes the block
    // rather than hiding it. Without it, a production login screen would
    // offer real-looking accounts to anyone who opened it.
    expect(LOGIN_PAGE).toContain(
      "const IS_DEV = process.env.NODE_ENV !== 'production';",
    );
    expect(LOGIN_PAGE).toContain('{IS_DEV && (');
  });
});
