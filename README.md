# PDFShare Pro

A web application for uploading PDFs, controlling who can view or edit them, and collaborating on them in real time through live annotations and a change history.

## What it does

- Every PDF has one owner and one state: `PRIVATE`, `PUBLISHED`, or `PUBLIC`.
- The owner grants `VIEW` or `EDIT` access to specific users by email, and can revoke it at any time.
- Users with `EDIT` access can add annotations (highlights, comments, drawings) on top of a PDF. Annotations do not modify the original PDF file.
- All connected viewers see new annotations appear immediately, without refreshing.
- Every annotation records who made it, when, and on which page. A sidebar shows this history for the document.

## Access rules

| State | Who can view | Who can edit |
|---|---|---|
| Private | Owner only | Owner only |
| Published | Owner + users granted VIEW/EDIT | Owner + users granted EDIT |
| Public | Anyone with the link | Owner + users granted EDIT |

Only the owner can change a document's state, grant or revoke access, or delete the document. A non-owner cannot re-share a document.

## Backend architecture

### Components

| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Handles concurrent requests and WebSocket connections without blocking |
| Framework | Express.js | HTTP routing and middleware |
| ORM | Prisma | Type-safe database access and migrations |
| Database | PostgreSQL (Supabase) | Stores users, PDFs, access grants, annotations |
| File storage | AWS S3 | Stores the actual PDF files |
| Real-time layer | Socket.io | Broadcasts new annotations to connected clients |
| Auth | JWT + bcrypt | Stateless authentication, 7-day token expiry |

### Request flow

1. A client sends a request with a JWT in the `Authorization` header.
2. Express middleware verifies the token and identifies the user.
3. For any PDF-scoped route, a second middleware checks the user's access level (owner, VIEW, EDIT, or none) before the route handler runs.
4. The handler reads from or writes to PostgreSQL through Prisma.

### File upload flow (presigned URLs)

The PDF file itself never passes through the Express server. This avoids holding large files in server memory.

1. Client calls `POST /pdf/presign` and receives a short-lived (15 minute) S3 URL scoped to a `PUT` request.
2. Client uploads the file directly to S3 using that URL.
3. Client calls `POST /pdf/confirm` once the upload finishes.
4. Express writes the file's S3 key, size, and owner to PostgreSQL, with state defaulting to `PRIVATE`.

### Real-time annotation flow

Each PDF has its own Socket.io room, identified by `pdfId`.

1. A client opens a PDF and emits `join-pdf` with `{ pdfId }`, joining that document's room.
2. A client with EDIT access creates an annotation and emits `new-annotation` with `{ pdfId, annotation }`.
3. The server saves the annotation to PostgreSQL, then emits `annotation-added` to every other client in the room.
4. Other clients render the new annotation without a page reload.
5. specific for organization.

The server also emits `user-joined` and `user-left` so clients can show who is currently viewing a document.

### Database schema

- **User** — id, name, email, password, and relations to owned PDFs, access grants, and annotations.
- **Pdf** — id, S3 filename, original name, file URL, size, state (`PRIVATE` / `PUBLISHED` / `PUBLIC`), owner.
- **PdfAccess** — links a PDF to a user with an `accessType` of `VIEW` or `EDIT`. One record per user per PDF.
- **Annotation** — id, PDF, author, type (`HIGHLIGHT` / `COMMENT` / `DRAWING`), page number, and a JSON `data` field holding position, color, and text.

Full schema is in `prisma/schema.prisma`.

### API routes

**Auth**
```
POST /auth/register
POST /auth/login
```

**PDFs**
```
POST   /pdf/presign              request a presigned S3 upload URL
POST   /pdf/confirm              confirm upload finished, create DB record
GET    /pdf/                     list PDFs owned by the current user
GET    /pdf/shared               list PDFs shared with the current user
GET    /pdf/:id                  get PDF metadata (requires access)
DELETE /pdf/:id                  delete a PDF (owner only)
PATCH  /pdf/:id/state            change state: PRIVATE / PUBLISHED / PUBLIC (owner only)
```

**Access control**
```
POST   /pdf/:id/access           grant VIEW or EDIT access by email (owner only)
DELETE /pdf/:id/access/:userId   revoke access (owner only)
GET    /pdf/:id/access           list everyone with access (owner only)
```

**Annotations**
```
GET    /pdf/:id/annotations      list annotations (requires access)
POST   /pdf/:id/annotations      create an annotation (requires EDIT access)
DELETE /annotation/:id           delete your own annotation
```

**Socket.io events**
```
Client → Server:  join-pdf         { pdfId }
Client → Server:  new-annotation   { pdfId, annotation }
Server → Clients: annotation-added { annotation }
Server → Clients: user-joined      { userId, name }
Server → Clients: user-left        { userId }
```

## Frontend

| Component | Technology |
|---|---|
| Framework | React + Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| HTTP client | Axios |
| PDF rendering | react-pdf (PDF.js) |
| Real-time client | Socket.io-client |
| Annotation drawing | Fabric.js or Konva.js |

## Non-functional targets

| Metric | Target |
|---|---|
| Real-time annotation latency | < 300ms |
| PDF load time (up to 10MB) | < 3 seconds |
| Concurrent users per document | up to 50 |
| Max file size | 50MB |
| Uptime | 99.9% |
| Auth token expiry | 7 days |

## Infrastructure

- Object storage: AWS S3
- Database: Supabase PostgreSQL
- Backend hosting: Render or Railway
- Frontend hosting: Vercel

## Why S3 instead of Supabase Storage

| Factor | Supabase Storage | AWS S3 |
|---|---|---|
| Access control | Row-level security policies (limited) | IAM + bucket policies (fine-grained) |
| Presigned URLs | Basic support | Full support (expiry, HTTP method, content-type enforcement) |
| Scale | Suited to small apps | Handles large scale |
| Cost at scale | Increases quickly | Lower per GB at volume |
| CDN | Basic | CloudFront integration |

## Roadmap

**Phase 1 — Access control**
Migrate storage to S3, add `state` and `PdfAccess` to the schema, build state and access-grant routes, add sharing UI.

**Phase 2 — Annotations**
Add `Annotation` model and routes, render annotation overlays on PDF pages, add highlight and comment tools, add an annotation sidebar.

**Phase 3 — Real-time collaboration**
Add Socket.io, create per-document rooms, broadcast annotation events, show presence indicators on the frontend.

**Phase 4 — Production hardening**
Rate limiting, file size validation, error boundaries, loading states, mobile layout, deployment, IAM least-privilege policy, optional CloudFront CDN, architecture diagram.

## Setup

```bash
# install dependencies
npm install

# set environment variables (.env)
DATABASE_URL=***************
JWT_SECRET=*****************
AWS_ACCESS_KEY_ID=**********
AWS_SECRET_ACCESS_KEY=******
AWS_S3_BUCKET=**************

# run database migrations
npx prisma migrate dev

# start the backend
npm run dev
```
