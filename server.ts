import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, {type Request, type Response} from 'express';

const PORT = 3000;
const ROOT_DIR = process.cwd();

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const ENV_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEFAULT_PASSWORD_SALT = 'hydropin_admin_salt_2026';
const DEFAULT_PASSWORD_HASH =
  'bd1705113fb79e7617c47ce842db400e83b5e929804bd57fb1f4de9400c783cdc1c2fe385706410230fb56c89dc6130e991b75dc0ee0724a63770a622d88c6bf';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function timingSafeUtf8Equal(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyAdminPassword(candidate: string): boolean {
  if (ENV_ADMIN_PASSWORD.length > 0) {
    return timingSafeUtf8Equal(candidate, ENV_ADMIN_PASSWORD);
  }
  const derivedHex = crypto
    .scryptSync(candidate, DEFAULT_PASSWORD_SALT, 64)
    .toString('hex');
  return timingSafeHexEqual(derivedHex, DEFAULT_PASSWORD_HASH);
}

function signSessionToken(username: string): {token: string; expiresAt: number} {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({sub: username, role: 'admin', exp: expiresAt}),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return {token: `${payload}.${sig}`, expiresAt};
}

function verifySessionToken(
  token: string
): {sub: string; role: string; exp: number} | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (!timingSafeUtf8Equal(sig, expectedSig)) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as {sub?: string; role?: string; exp?: number};
    if (
      !decoded ||
      decoded.role !== 'admin' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Date.now()
    ) {
      return null;
    }
    return {sub: decoded.sub, role: decoded.role, exp: decoded.exp};
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = req.body as {username?: unknown; password?: unknown};
    const username =
      typeof body?.username === 'string' ? body.username.trim() : '';
    const password =
      typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({
        ok: false,
        error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
      });
      return;
    }

    const userOk = timingSafeUtf8Equal(username, ADMIN_USERNAME);
    const passOk = verifyAdminPassword(password);
    if (!userOk || !passOk) {
      res.status(401).json({
        ok: false,
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      });
      return;
    }

    const {token, expiresAt} = signSessionToken(username);
    res.json({
      ok: true,
      token,
      user: {username, role: 'admin'},
      expiresAt,
    });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      res.json({authenticated: false});
      return;
    }
    const verified = verifySessionToken(token);
    if (!verified) {
      res.status(401).json({authenticated: false});
      return;
    }
    res.json({
      authenticated: true,
      user: {username: verified.sub, role: verified.role},
    });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.json({ok: true});
  });

  app.get('/api/maps-config', (_req: Request, res: Response) => {
    const apiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
    ).trim();
    res.setHeader('Cache-Control', 'no-store');
    res.json({apiKey});
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
