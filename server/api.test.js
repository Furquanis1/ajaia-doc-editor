'use strict';

/**
 * Integration tests for the Phase 2 document + sharing API.
 *
 * DB_PATH must be set before `./db` is required: db.js opens the connection at
 * module load time. `:memory:` keeps the suite isolated from database.sqlite.
 */

process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('./index');
const db = require('./db');

let documentId;

beforeAll(async () => {
  await db.initialize();
});

afterAll(async () => {
  await db.close();
});

describe('documents API and access control', () => {
  test('1. Alice (user 1) creates a document and it persists', async () => {
    const create = await request(app)
      .post('/api/documents')
      .set('x-user-id', '1')
      .send({ title: 'Phase 2 Plan', content: 'Draft content' });

    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({
      title: 'Phase 2 Plan',
      content: 'Draft content',
      owner_id: 1,
    });
    expect(create.body.id).toEqual(expect.any(Number));
    expect(create.body.created_at).toBeTruthy();

    documentId = create.body.id;

    // It is readable by its owner...
    const fetched = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '1');

    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Phase 2 Plan');

    // ...and appears in Alice's owned list, not in her shared list.
    const list = await request(app)
      .get('/api/documents')
      .set('x-user-id', '1');

    expect(list.status).toBe(200);
    expect(list.body.owned.map((doc) => doc.id)).toContain(documentId);
    expect(list.body.shared).toEqual([]);
  });

  test("2. Bob (user 2) gets 403 fetching Alice's document", async () => {
    const res = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '2');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('3. Alice shares the document with Bob', async () => {
    const share = await request(app)
      .post(`/api/documents/${documentId}/share`)
      .set('x-user-id', '1')
      .send({ userId: 2 });

    expect(share.status).toBe(201);
    expect(share.body).toMatchObject({
      doc_id: documentId,
      user_id: 2,
      user: { email: 'bob@demo.com' },
    });

    // The document now shows up in Bob's shared list.
    const list = await request(app)
      .get('/api/documents')
      .set('x-user-id', '2');

    expect(list.status).toBe(200);
    expect(list.body.owned).toEqual([]);
    expect(list.body.shared.map((doc) => doc.id)).toContain(documentId);
  });

  test("4. Bob can now fetch Alice's document", async () => {
    const res = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '2');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(documentId);
    expect(res.body.title).toBe('Phase 2 Plan');
    expect(res.body.owner_id).toBe(1);
  });

  test('5. Only the owner may share a document', async () => {
    const res = await request(app)
      .post(`/api/documents/${documentId}/share`)
      .set('x-user-id', '2')
      .send({ userId: 3 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('6. GET /api/documents/:id returns sharedWith', async () => {
    const res = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '1');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sharedWith)).toBe(true);
    expect(res.body.sharedWith).toEqual([
      { id: 2, name: 'Bob', email: 'bob@demo.com' },
    ]);
  });

  test('7. A non-owner cannot revoke a share', async () => {
    const res = await request(app)
      .delete(`/api/documents/${documentId}/share/3`)
      .set('x-user-id', '2');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test("8. The owner can revoke Bob's access", async () => {
    const revoke = await request(app)
      .delete(`/api/documents/${documentId}/share/2`)
      .set('x-user-id', '1');

    expect(revoke.status).toBe(200);
    expect(revoke.body).toEqual({
      ok: true,
      doc_id: documentId,
      user_id: 2,
    });

    const bobFetch = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '2');

    expect(bobFetch.status).toBe(403);
    expect(bobFetch.body.error).toBe('Forbidden');

    const ownerFetch = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '1');

    expect(ownerFetch.status).toBe(200);
    expect(ownerFetch.body.sharedWith).toEqual([]);
  });

  test('9. A shared user can remove their own access', async () => {
    const reshare = await request(app)
      .post(`/api/documents/${documentId}/share`)
      .set('x-user-id', '1')
      .send({ userId: 2 });

    expect(reshare.status).toBe(201);

    const selfRevoke = await request(app)
      .delete(`/api/documents/${documentId}/share/2`)
      .set('x-user-id', '2');

    expect(selfRevoke.status).toBe(200);
    expect(selfRevoke.body).toEqual({
      ok: true,
      doc_id: documentId,
      user_id: 2,
    });

    const bobFetch = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '2');

    expect(bobFetch.status).toBe(403);
  });

  test('10. A non-owner cannot delete the document', async () => {
    const res = await request(app)
      .delete(`/api/documents/${documentId}`)
      .set('x-user-id', '2');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.message).toBe(
      'You do not have permission to delete this document'
    );
  });

  test('11. The owner can delete the document', async () => {
    const res = await request(app)
      .delete(`/api/documents/${documentId}`)
      .set('x-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: documentId });

    const fetched = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('x-user-id', '1');

    expect(fetched.status).toBe(404);
    expect(fetched.body.error).toBe('Not Found');
  });
});
