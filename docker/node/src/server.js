const express = require('express');

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'mysecrettoken';

const app = express();
app.use(express.raw({ type: '*/*', limit: '1mb' }));

// Serialise JSON exactly like the original app: two-space pretty printing with
// the keys in insertion order and a trailing newline.
app.use((req, res, next) => {
  res.json = (body) => {
    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(body, null, 2) + '\n');
  };
  next();
});

const databases = { dev: new Map(), prod: new Map() };

function dbFor(env) {
  return databases[env];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Returns { invalid: true } when the request has no body, the body is not JSON,
// or the JSON is a bare `null` (the original app reports all of them as 400).
function parseJsonBody(req) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!raw.trim()) return { invalid: true };
  try {
    const value = JSON.parse(raw);
    return value === null ? { invalid: true } : { value };
  } catch {
    return { invalid: true };
  }
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function serverError(res) {
  return res.status(500).json({ error: 'Internal server error' });
}

// Serialised in the same field order as the original application: age, email, name.
function user(name, email, age) {
  return { age, email, name };
}

function validate(body) {
  if (!body.name) return 'name is required';
  if (!body.email) return 'email is required';
  if (!Object.prototype.hasOwnProperty.call(body, 'age')) return 'age is required';
  const { age } = body;
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > 150) {
    return 'Age must be between 1 and 150';
  }
  return null;
}

app.get('/:env/users', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });
  res.status(200).json([...db.values()]);
});

app.post('/:env/users', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const parsed = parseJsonBody(req);
  if (parsed.invalid) return badRequest(res, 'Invalid JSON body');
  if (!isPlainObject(parsed.value)) return serverError(res);
  const body = parsed.value;

  const problem = validate(body);
  if (problem) return badRequest(res, problem);

  // BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
  if (db.has(body.email)) return serverError(res);

  // BUG-03: no email format validation, so malformed addresses are accepted with 201.
  const created = user(body.name, body.email, body.age);
  db.set(body.email, created);
  res.status(201).json(created);
});

app.get('/:env/users/:email', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const existing = db.get(req.params.email);
  // BUG-01: an unknown email should return 404 but surfaces as a server error.
  if (!existing) return serverError(res);
  res.status(200).json(existing);
});

app.put('/:env/users/:email', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const parsed = parseJsonBody(req);
  if (parsed.invalid) return badRequest(res, 'Invalid JSON body');
  if (!isPlainObject(parsed.value)) return serverError(res);
  const body = parsed.value;

  const problem = validate(body);
  if (problem) return badRequest(res, problem);

  const email = req.params.email;
  if (!db.has(email)) return res.status(404).json({ error: 'User not found' });
  if (body.email !== email && db.has(body.email)) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  // Quirk of the original app: PUT never persists anything — it validates the
  // request and echoes it back with 200, leaving the stored record untouched.
  res.status(200).json(user(body.name, body.email, body.age));
});

app.delete('/:env/users/:email', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  // BUG-04: dev skips the authentication check entirely; prod enforces it.
  if (req.params.env === 'prod' && req.get('Authentication') !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!db.has(req.params.email)) {
    return res.status(404).json({ error: 'User not found' });
  }
  db.delete(req.params.email);
  res.status(204).end();
});

// Quirk of the original app: an unmatched route is reported as a server error,
// not as a 404.
app.use((req, res) => serverError(res));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`User Management API (node) listening on http://0.0.0.0:${PORT}`);
});
