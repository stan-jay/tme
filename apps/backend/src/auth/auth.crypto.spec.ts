import { hashPassword, signToken, verifyPassword, verifyToken } from './auth.crypto';

describe('authentication cryptography', () => {
  const secret = 'a-secure-test-secret-that-is-longer-than-thirty-two-characters';

  it('hashes passwords with a random salt and verifies them safely', async () => {
    const first = await hashPassword('CorrectHorseBatteryStaple!');
    const second = await hashPassword('CorrectHorseBatteryStaple!');
    expect(first).not.toEqual(second);
    await expect(verifyPassword('CorrectHorseBatteryStaple!', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', first)).resolves.toBe(false);
  });

  it('signs and verifies tenant-scoped bearer tokens', () => {
    const token = signToken(
      {
        id: 'user-1',
        organizationId: 'org-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      secret,
      60,
    );
    expect(verifyToken(token, secret)).toMatchObject({
      id: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
    });
    expect(() => verifyToken(`${token}tampered`, secret)).toThrow();
  });
});
