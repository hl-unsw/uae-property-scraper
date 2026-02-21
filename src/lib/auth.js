const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// ─── Cookie helpers ──────────────────────────────────

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try { result[key] = decodeURIComponent(val); } catch { result[key] = val; }
  }
  return result;
}

// ─── HMAC helpers ────────────────────────────────────

function hmacSign(payload) {
  const secret = process.env.HMAC_SECRET;
  if (!secret) throw new Error('HMAC_SECRET not configured');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createChallengeCookie(challenge) {
  const expires = Date.now() + 5 * 60 * 1000;
  const payload = `${challenge}:${expires}`;
  return `${payload}:${hmacSign(payload)}`;
}

function verifyChallengeCookie(cookieValue) {
  if (!cookieValue) return null;
  const parts = cookieValue.split(':');
  if (parts.length !== 3) return null;
  const [challenge, expires, sig] = parts;
  if (Date.now() > Number(expires)) return null;
  const expected = hmacSign(`${challenge}:${expires}`);
  try {
    const bufSig = Buffer.from(sig, 'hex');
    const bufExpected = Buffer.from(expected, 'hex');
    if (bufSig.length !== bufExpected.length) return null;
    return crypto.timingSafeEqual(bufSig, bufExpected) ? challenge : null;
  } catch { return null; }
}

function createSessionCookie() {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${nonce}:${expires}`;
  return `${payload}:${hmacSign(payload)}`;
}

function verifySessionCookie(cookieValue) {
  if (!cookieValue) return false;
  const parts = cookieValue.split(':');
  if (parts.length !== 3) return false;
  const [, expires, sig] = parts;
  if (Date.now() > Number(expires)) return false;
  const expected = hmacSign(`${parts[0]}:${expires}`);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

// ─── Auth check ──────────────────────────────────────

function isAdmin(req) {
  const cookies = parseCookies(req);
  return verifySessionCookie(cookies['__session']);
}

// ─── RP helpers ──────────────────────────────────────

function getRpId() {
  return process.env.WEBAUTHN_RP_ID || 'localhost';
}

function getRpOrigin() {
  const rpId = getRpId();
  if (rpId === 'localhost') return 'http://localhost:3000';
  return `https://${rpId}`;
}

function isSecure() {
  return !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

function challengeCookieHeader(value) {
  return `__challenge=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300${isSecure() ? '; Secure' : ''}`;
}

function clearChallengeCookieHeader() {
  return `__challenge=; Path=/; HttpOnly; Max-Age=0`;
}

function sessionCookieHeader(value, maxAge = 86400) {
  return `__session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure() ? '; Secure' : ''}`;
}

// ─── Express routes ──────────────────────────────────

function mountAuthRoutes(app) {
  // Session validation
  app.get('/api/auth/validate', (req, res) => {
    res.json({ valid: isAdmin(req) });
  });

  // Registration: generate options (requires ADMIN_TOKEN)
  app.post('/api/webauthn/register-options', async (req, res) => {
    try {
      const { token } = req.body;
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized — ADMIN_TOKEN required for registration' });
      }

      const options = await generateRegistrationOptions({
        rpName: 'UAE Property Dashboard',
        rpID: getRpId(),
        userName: 'admin',
        userDisplayName: 'Admin',
        attestationType: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
      });

      res.setHeader('Set-Cookie', challengeCookieHeader(createChallengeCookie(options.challenge)));
      res.json(options);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Registration: verify response
  app.post('/api/webauthn/register-verify', async (req, res) => {
    try {
      const cookies = parseCookies(req);
      const challenge = verifyChallengeCookie(cookies['__challenge']);
      if (!challenge) {
        return res.status(400).json({ error: 'Challenge expired or invalid' });
      }

      const verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: getRpOrigin(),
        expectedRPID: getRpId(),
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: 'Verification failed' });
      }

      const { credential } = verification.registrationInfo;
      res.setHeader('Set-Cookie', clearChallengeCookieHeader());
      res.json({
        verified: true,
        envVars: {
          WEBAUTHN_CREDENTIAL_ID: credential.id,
          WEBAUTHN_PUBLIC_KEY: Buffer.from(credential.publicKey).toString('base64'),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Login: generate options
  app.post('/api/webauthn/login-options', async (req, res) => {
    try {
      const credentialId = process.env.WEBAUTHN_CREDENTIAL_ID;
      if (!credentialId) {
        return res.status(400).json({ error: 'No credential registered — set WEBAUTHN_CREDENTIAL_ID' });
      }

      const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        userVerification: 'required',
        allowCredentials: [{ id: credentialId, type: 'public-key' }],
      });

      res.setHeader('Set-Cookie', challengeCookieHeader(createChallengeCookie(options.challenge)));
      res.json(options);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Login: verify response
  app.post('/api/webauthn/login-verify', async (req, res) => {
    try {
      const cookies = parseCookies(req);
      const challenge = verifyChallengeCookie(cookies['__challenge']);
      if (!challenge) {
        return res.status(400).json({ error: 'Challenge expired or invalid' });
      }

      const credentialId = process.env.WEBAUTHN_CREDENTIAL_ID;
      const publicKeyBase64 = process.env.WEBAUTHN_PUBLIC_KEY;
      if (!credentialId || !publicKeyBase64) {
        return res.status(400).json({ error: 'Credential not configured' });
      }

      const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));
      const verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: getRpOrigin(),
        expectedRPID: getRpId(),
        credential: { id: credentialId, publicKey, counter: 0 },
      });

      if (!verification.verified) {
        return res.status(401).json({ error: 'Authentication failed' });
      }

      res.setHeader('Set-Cookie', [
        sessionCookieHeader(createSessionCookie()),
        clearChallengeCookieHeader(),
      ]);
      res.json({ verified: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', sessionCookieHeader('', 0));
    res.json({ success: true });
  });
}

module.exports = { parseCookies, isAdmin, mountAuthRoutes };
