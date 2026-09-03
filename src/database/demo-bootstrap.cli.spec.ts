import { credentialFrom } from './demo-bootstrap.cli';

const url = 'postgresql://app_user:s3cret@ep-x-pooler.eu.aws.neon.tech/neondb?sslmode=require';

const parse = (raw: string | undefined) =>
  credentialFrom(raw, 'DATABASE_URL', 'app_user', 'app_password');

describe('credentialFrom', () => {
  it('takes the role and password out of the app connection string', () => {
    expect(parse(url)).toEqual({ role: 'app_user', password: 's3cret' });
  });

  it('decodes a percent-encoded password', () => {
    expect(parse('postgresql://app_user:p%40ss%2Fword@host/db').password).toBe('p@ss/word');
  });

  // The whole point of the rotation: a demo left on the password migration
  // 0001 hardcodes is a Neon endpoint the public repository holds the key to.
  it('refuses the password committed in the migration', () => {
    expect(() => parse('postgresql://app_user:app_password@host/db')).toThrow(
      /published in this repository/,
    );
  });

  it.each([
    ['unset', undefined],
    ['passwordless', 'postgresql://app_user@host/db'],
    ['wrong role', 'postgresql://neondb_owner:s3cret@host/db'],
    ['not a URL', 'host=neon user=app_user'],
  ])('rejects a %s value', (_label, raw) => {
    expect(() => parse(raw)).toThrow('DATABASE_URL');
  });
});
