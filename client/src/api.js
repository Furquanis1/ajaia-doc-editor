/**
 * API client for the Ajaia Docs server.
 *
 * Every request carries the `x-user-id` header, which is the demo identity
 * mechanism used by the Express API. Components should pass `activeUserId`
 * from AuthContext as the first argument.
 */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(
  /\/$/,
  ''
);

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { userId, method = 'GET', body } = {}) {
  if (!Number.isInteger(userId)) {
    throw new ApiError('A numeric user id is required for API calls', 0, null);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-user-id': String(userId),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${API_URL}. Is the server running?`,
      0,
      null
    );
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      (payload && payload.message) ||
      (payload && payload.error) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

// --- Auth -------------------------------------------------------------------

export function getMe(userId) {
  return request('/api/me', { userId });
}

// --- Documents --------------------------------------------------------------

/** Returns `{ owned: Document[], shared: Document[] }`. */
export function getDocuments(userId) {
  return request('/api/documents', { userId });
}

export function getDocument(userId, documentId) {
  return request(`/api/documents/${documentId}`, { userId });
}

export function createDocument(userId, { title, content } = {}) {
  return request('/api/documents', {
    userId,
    method: 'POST',
    body: { title, content },
  });
}

export function updateDocument(userId, documentId, patch) {
  return request(`/api/documents/${documentId}`, {
    userId,
    method: 'PUT',
    body: patch,
  });
}

export function shareDocument(userId, documentId, targetUserId) {
  return request(`/api/documents/${documentId}/share`, {
    userId,
    method: 'POST',
    body: { userId: targetUserId },
  });
}

export function revokeDocumentShare(userId, documentId, targetUserId) {
  return request(`/api/documents/${documentId}/share/${targetUserId}`, {
    userId,
    method: 'DELETE',
  });
}

export { API_URL };
