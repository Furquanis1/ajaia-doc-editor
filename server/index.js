'use strict';

/**
 * Express API for the collaborative document editor.
 *
 * Phase 2 scope: document CRUD, ownership/sharing authorization, GET /api/me.
 * `app` is exported without listening so tests can drive it with supertest.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

const { initialize, run, get, all } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// --- Helpers ----------------------------------------------------------------

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Load a document and report whether `userId` may access it. */
async function loadDocumentForUser(docId, userId) {
  const doc = await get('SELECT * FROM documents WHERE id = ?', [docId]);
  if (!doc) return { doc: null, allowed: false };

  if (doc.owner_id === userId) return { doc, allowed: true };

  const share = await get(
    'SELECT 1 AS ok FROM document_shares WHERE doc_id = ? AND user_id = ?',
    [docId, userId]
  );

  return { doc, allowed: Boolean(share) };
}

function forbidden(res, message = 'You do not have access to this document') {
  return res.status(403).json({ error: 'Forbidden', message });
}

// --- Auth middleware --------------------------------------------------------
// Every request must carry `x-user-id`. We only validate that it is present and
// numeric here; existence is checked where user data is actually read.
app.use('/api', (req, res, next) => {
  const header = req.header('x-user-id');

  if (header === undefined || String(header).trim() === '') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing x-user-id header',
    });
  }

  const userId = Number(header);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'x-user-id header must be a positive integer',
    });
  }

  req.userId = userId;
  next();
});

// --- Identity ---------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', userId: req.userId });
});

app.get('/api/me', async (req, res, next) => {
  try {
    const user = await get('SELECT id, email, name FROM users WHERE id = ?', [
      req.userId,
    ]);

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No user with id ${req.userId}`,
      });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// --- Documents --------------------------------------------------------------

// List documents the caller owns, plus documents shared with them.
app.get('/api/documents', async (req, res, next) => {
  try {
    const owned = await all(
      'SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC, id DESC',
      [req.userId]
    );

    const shared = await all(
      `SELECT d.*, u.name AS owner_name, u.email AS owner_email
         FROM documents d
         JOIN document_shares s ON s.doc_id = d.id
         JOIN users u ON u.id = d.owner_id
        WHERE s.user_id = ?
        ORDER BY d.updated_at DESC, d.id DESC`,
      [req.userId]
    );

    res.json({ owned, shared });
  } catch (err) {
    next(err);
  }
});

// Create a document owned by the caller.
app.post('/api/documents', async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = body.title === undefined ? 'Untitled document' : body.title;
    const content = body.content === undefined ? '' : body.content;

    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'title must be a non-empty string',
      });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'content must be a string',
      });
    }

    const result = await run(
      `INSERT INTO documents (title, content, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title.trim(), content, req.userId]
    );

    const doc = await get('SELECT * FROM documents WHERE id = ?', [
      result.lastID,
    ]);

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// Read a single document: owner or shared user only.
app.get('/api/documents/:id', async (req, res, next) => {
  try {
    const docId = parseId(req.params.id);
    if (!docId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid document id' });
    }

    const { doc, allowed } = await loadDocumentForUser(docId, req.userId);

    if (!doc) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No document with id ${docId}`,
      });
    }

    if (!allowed) return forbidden(res);

    const sharedWith = await all(
      `SELECT u.id, u.name, u.email
         FROM document_shares s
         JOIN users u ON u.id = s.user_id
        WHERE s.doc_id = ?
        ORDER BY u.name ASC`,
      [docId]
    );

    res.json({ ...doc, sharedWith });
  } catch (err) {
    next(err);
  }
});

// Update title and/or content: owner or shared user only.
app.put('/api/documents/:id', async (req, res, next) => {
  try {
    const docId = parseId(req.params.id);
    if (!docId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid document id' });
    }

    const { doc, allowed } = await loadDocumentForUser(docId, req.userId);

    if (!doc) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No document with id ${docId}`,
      });
    }

    if (!allowed) return forbidden(res);

    const body = req.body || {};
    const fields = [];
    const params = [];

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'title must be a non-empty string',
        });
      }
      fields.push('title = ?');
      params.push(body.title.trim());
    }

    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'content must be a string',
        });
      }
      fields.push('content = ?');
      params.push(body.content);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide at least one of title or content',
      });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(docId);

    await run(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = await get('SELECT * FROM documents WHERE id = ?', [docId]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete a document and its shares: owner only.
app.delete('/api/documents/:id', async (req, res, next) => {
  try {
    const docId = parseId(req.params.id);

    if (!docId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid document id',
      });
    }

    const doc = await get('SELECT * FROM documents WHERE id = ?', [docId]);

    if (!doc) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No document with id ${docId}`,
      });
    }

    if (doc.owner_id !== req.userId) {
      return forbidden(
        res,
        'You do not have permission to delete this document'
      );
    }

    await run('DELETE FROM document_shares WHERE doc_id = ?', [docId]);
    await run('DELETE FROM documents WHERE id = ?', [docId]);

    res.json({ ok: true, id: docId });
  } catch (err) {
    next(err);
  }
});

// Share a document: owner only.
app.post('/api/documents/:id/share', async (req, res, next) => {
  try {
    const docId = parseId(req.params.id);
    if (!docId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid document id' });
    }

    const targetId = parseId((req.body || {}).userId);
    if (!targetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'userId must be a positive integer',
      });
    }

    const doc = await get('SELECT * FROM documents WHERE id = ?', [docId]);

    if (!doc) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No document with id ${docId}`,
      });
    }

    if (doc.owner_id !== req.userId) {
      return forbidden(res, 'Only the document owner can share it');
    }

    if (targetId === doc.owner_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The owner already has access to this document',
      });
    }

    const target = await get('SELECT id, email, name FROM users WHERE id = ?', [
      targetId,
    ]);

    if (!target) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No user with id ${targetId}`,
      });
    }

    await run(
      'INSERT OR IGNORE INTO document_shares (doc_id, user_id) VALUES (?, ?)',
      [docId, targetId]
    );

    res.status(201).json({
      doc_id: docId,
      user_id: targetId,
      user: target,
    });
  } catch (err) {
    next(err);
  }
});

// Revoke a document share: owner only.
app.delete('/api/documents/:id/share/:userId', async (req, res, next) => {
  try {
    const docId = parseId(req.params.id);
    const targetId = parseId(req.params.userId);

    if (!docId || !targetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Document id and user id must be positive integers',
      });
    }

    const doc = await get('SELECT * FROM documents WHERE id = ?', [docId]);

    if (!doc) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No document with id ${docId}`,
      });
    }

    if (doc.owner_id !== req.userId && targetId !== req.userId) {
      return forbidden(
        res,
        'You can only remove your own access to this document'
      );
    }

    await run(
      'DELETE FROM document_shares WHERE doc_id = ? AND user_id = ?',
      [docId, targetId]
    );

    res.json({ ok: true, doc_id: docId, user_id: targetId });
  } catch (err) {
    next(err);
  }
});

// --- Frontend & Fallbacks ---------------------------------------------------

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Unmatched API routes return JSON 404
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No route ${req.method} ${req.path}`,
  });
});

// Client-side routing fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  res.status(status).json({
    error: 'Bad Request',
    message: err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message,
  });
});

// --- Startup ----------------------------------------------------------------

async function start() {
  await initialize();
  return app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

// Only listen when run directly; tests import `app` and manage the DB themselves.
if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
module.exports.PORT = PORT;
