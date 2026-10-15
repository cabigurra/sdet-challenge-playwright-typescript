const express = require('express');

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'mysecrettoken';

const app = express();
app.use(express.json({ strict: false }));

const databases = { dev: new Map(), prod: new Map() };

function dbFor(env) {
  return databases[env];
}

function validateUserBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  for (const field of ['name', 'email', 'age']) {
    if (!(field in body) || body[field] === null) {
      return `Missing required field: ${field}`;
    }
  }
  if (typeof body.name !== 'string') return 'name must be a string';
  if (typeof body.email !== 'string') return 'email must be a string';
  if (typeof body.age !== 'number' || !Number.isInteger(body.age) || body.age < 1 || body.age > 150) {
    return 'age must be an integer between 1 and 150';
  }
  return null;
}

function validationError(res, message) {
  return res.status(400).json({ error: `Validation error: ${message}` });
}

app.get('/:env/users', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });
  res.status(200).json([...db.values()]);
});

app.post('/:env/users', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const problem = validateUserBody(req.body);
  if (problem) return validationError(res, problem);

  const { name, email, age } = req.body;

  // BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
  if (db.has(email)) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  // BUG-03: no email format validation, so malformed addresses are accepted with 201.
  const user = { name, email, age };
  db.set(email, user);
  res.status(201).json(user);
});

app.get('/:env/users/:email', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const user = db.get(req.params.email);
  // BUG-01: an unknown email should return 404 but surfaces as a server error.
  if (!user) return res.status(500).json({ error: 'Internal server error' });
  res.status(200).json(user);
});

app.put('/:env/users/:email', (req, res) => {
  const db = dbFor(req.params.env);
  if (!db) return res.status(404).json({ error: 'Not found' });

  const problem = validateUserBody(req.body);
  if (problem) return validationError(res, problem);

  const current = db.get(req.params.email);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const { name, email, age } = req.body;
  if (email !== req.params.email && db.has(email)) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  if (email !== req.params.email) db.delete(req.params.email);
  const user = { name, email, age };
  db.set(email, user);
  res.status(200).json(user);
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

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Validation error: malformed JSON body' });
  }
  next(err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`User Management API (node) listening on http://0.0.0.0:${PORT}`);
});
