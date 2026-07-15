# Product & Engineering Document
## Collaborative PDF Viewer & Editor — "PDFShare Pro"
**Version:** 1.0 | **Author:** Engineering Team | **Status:** Planning

---

## 1. Product Vision

A web application where users can upload PDFs, control exactly who can view or edit them, and collaborate in real-time with live annotations and change tracking — built for teams that need document-level access control (LegalTech, HR, Finance).

---

## 2. Core Requirements

### 2.1 Functional Requirements

#### Document States
Every PDF exists in exactly one of three states:

| State | Who Can View | Who Can Edit |
|---|---|---|
| **Private** | Owner only | Owner only |
| **Published** | People explicitly granted view access | People explicitly granted edit access |
| **Public** | Anyone with the link | People explicitly granted edit access |

#### Access Control
- Owner can grant `VIEW` or `EDIT` access to specific users by email
- Owner can revoke access at any time
- Owner can promote a PDF from Private → Published → Public
- Owner can demote a PDF back to Private at any time
- Non-owners cannot change the state or share further

#### Collaboration Features
- Multiple users can view a PDF simultaneously
- Users with EDIT access can add annotations (highlights, comments, drawings)
- All annotations are live — other viewers see them appear in real-time
- Every annotation is stamped with: who made it, when, on which page
- A sidebar shows the full annotation/change history (audit trail)
- No two users can "conflict" on annotations since each annotation is additive (not modifying the raw PDF bytes)

#### User Management
- Register / Login (existing)
- Profile page (name, email)
- See all PDFs you own
- See all PDFs shared with you (with your access level shown)

---

### 2.2 Non-Functional Requirements

| Requirement | Target |
|---|---|
| Real-time annotation latency | < 300ms |
| PDF load time (up to 10MB) | < 3 seconds |
| Concurrent users per document | Up to 50 |
| File size limit | 50MB per PDF |
| Uptime | 99.9% |
| Auth token expiry | 7 days (refresh token pattern later) |

---

## 3. Tech Stack

### 3.1 Backend
| Component | Technology | Why |
|---|---|---|
| Runtime | Node.js | Non-blocking I/O, good for real-time WebSocket handling |
| Framework | Express.js | Minimal, full middleware control, existing codebase |
| ORM | Prisma | Type-safe queries, migration history, existing setup |
| Database | PostgreSQL (Supabase) | Relational — access control is inherently relational data |
| File Storage | **AWS S3** | Industry standard, fine-grained IAM, presigned URLs, scales to TB |
| Real-time | **Socket.io** | WebSocket library for live annotation broadcasting |
| Auth | JWT + bcrypt | Existing, stateless, works well at this scale |

### 3.2 Frontend
| Component | Technology | Why |
|---|---|---|
| Framework | React + Vite | Existing, fast HMR, component-based |
| Styling | Tailwind CSS | Existing |
| Routing | React Router | Existing |
| HTTP Client | Axios | Existing, with interceptors for auth |
| PDF Rendering | react-pdf (PDF.js) | Existing, page-level rendering, supports annotation overlays |
| Real-time | **Socket.io-client** | Pairs with backend Socket.io |
| Annotations UI | **Fabric.js or Konva.js** | Canvas-based drawing/highlighting on top of PDF pages |

### 3.3 Infrastructure
| Component | Technology |
|---|---|
| Object Storage | AWS S3 |
| Database | Supabase PostgreSQL |
| Backend Hosting | Render or Railway |
| Frontend Hosting | Vercel |
| Environment Config | dotenv |

---

## 4. Database Schema (Updated)

```prisma
model User {
  id          String       @id @default(uuid())
  name        String
  email       String       @unique
  password    String
  pdfs        Pdf[]        // PDFs this user owns
  accessGrants PdfAccess[] // PDFs shared with this user
  annotations Annotation[]
  createdAt   DateTime     @default(now())
}

model Pdf {
  id           String      @id @default(uuid())
  filename     String      // S3 key
  originalName String
  fileUrl      String      // S3 public/presigned URL
  size         Int
  state        PdfState    @default(PRIVATE)
  owner        User        @relation(fields: [ownerId], references: [id])
  ownerId      String
  accessGrants PdfAccess[]
  annotations  Annotation[]
  createdAt    DateTime    @default(now())
}

enum PdfState {
  PRIVATE
  PUBLISHED
  PUBLIC
}

model PdfAccess {
  id         String     @id @default(uuid())
  pdf        Pdf        @relation(fields: [pdfId], references: [id])
  pdfId      String
  user       User       @relation(fields: [userId], references: [id])
  userId     String
  accessType AccessType
  grantedAt  DateTime   @default(now())

  @@unique([pdfId, userId]) // one access record per user per PDF
}

enum AccessType {
  VIEW
  EDIT
}

model Annotation {
  id        String         @id @default(uuid())
  pdf       Pdf            @relation(fields: [pdfId], references: [id])
  pdfId     String
  user      User           @relation(fields: [userId], references: [id])
  userId    String
  type      AnnotationType
  page      Int
  data      Json           // stores position, color, text, dimensions etc
  createdAt DateTime       @default(now())
}

enum AnnotationType {
  HIGHLIGHT
  COMMENT
  DRAWING
}
```

---

## 5. API Design

### Auth (existing)
```
POST /auth/register
POST /auth/login
```

### PDFs
```
POST   /pdf/upload              → upload PDF to S3, create DB record (PRIVATE by default)
GET    /pdf/                    → list owned PDFs
GET    /pdf/shared              → list PDFs shared with me
GET    /pdf/:id                 → get PDF metadata (checks access)
DELETE /pdf/:id                 → delete PDF (owner only)
PATCH  /pdf/:id/state           → change state (PRIVATE/PUBLISHED/PUBLIC) — owner only
```

### Access Control
```
POST   /pdf/:id/access          → grant VIEW or EDIT to a user by email
DELETE /pdf/:id/access/:userId  → revoke access
GET    /pdf/:id/access          → list all people with access (owner only)
```

### Annotations
```
GET    /pdf/:id/annotations     → get all annotations for a PDF (if you have access)
POST   /pdf/:id/annotations     → create annotation (if you have EDIT access)
DELETE /annotation/:id          → delete your own annotation
```

### Real-time (Socket.io events)
```
Client emits:  "join-pdf"         → { pdfId }  (join a document room)
Client emits:  "new-annotation"   → { pdfId, annotation }
Server emits:  "annotation-added" → { annotation } (broadcast to all in room)
Server emits:  "user-joined"      → { userId, name }
Server emits:  "user-left"        → { userId }
```

---

## 6. AWS S3 Migration Plan

### Why S3 over Supabase Storage
| Factor | Supabase Storage | AWS S3 |
|---|---|---|
| Access control | RLS policies (limited) | IAM + bucket policies (fine-grained) |
| Presigned URLs | Basic support | Full support with expiry, HTTP method, content-type enforcement |
| Scale | Good for small apps | Industry standard, unlimited scale |
| Cost at scale | Gets expensive | Cheaper per GB at volume |
| CDN | Basic | CloudFront integration (global CDN) |

### S3 Upload Pattern (Presigned URL Flow)
Instead of routing the file through your Express server (which causes memory bottlenecks for large files):

1. Frontend requests a presigned URL from Express (`POST /pdf/presign`)
2. Express calls S3 to generate a short-lived signed URL (15 min expiry) for a specific S3 key, for PUT only
3. Frontend uploads the file **directly to S3** using that URL — Express server never touches the file bytes
4. Frontend notifies Express that upload is complete (`POST /pdf/confirm`)
5. Express saves metadata to Postgres

This means a 50MB PDF never passes through your server RAM at all.

---

## 7. Real-time Collaboration Architecture

```
User A (EDIT)          Express + Socket.io          User B (VIEW)
    |                         |                          |
    |-- "join-pdf" {pdfId} -->|                          |
    |                         |<-- "join-pdf" {pdfId} --|
    |                         |                          |
    | (draws highlight)       |                          |
    |-- "new-annotation" ---->|                          |
    |                         |-- save to Postgres       |
    |                         |-- "annotation-added" --->|
    |                         |                          |
    |                    (User B sees highlight appear live)
```

Socket.io **rooms** are used — each PDF gets its own room (`pdfId`). When you join a document, you join that room. When anyone emits an annotation, it's saved to DB and broadcast to everyone else in the same room instantly.

---

## 8. Roadmap

### Phase 1 — Access Control Layer (Week 1)
**Goal:** Owner can publish a PDF and control who sees it

- [ ] Migrate file storage from Supabase to AWS S3 (presigned URL pattern)
- [ ] Add `state` field to `Pdf` model (PRIVATE/PUBLISHED/PUBLIC)
- [ ] Add `PdfAccess` model to schema, run migration
- [ ] Build `PATCH /pdf/:id/state` route (owner only)
- [ ] Build `POST /pdf/:id/access` route (grant by email)
- [ ] Build `DELETE /pdf/:id/access/:userId` route (revoke)
- [ ] Update `GET /pdf/` to also return shared PDFs
- [ ] Update auth middleware to check access level on PDF routes
- [ ] Frontend: sharing modal (input email, choose VIEW/EDIT, submit)
- [ ] Frontend: "Shared with me" section on dashboard

**Deliverable:** A user can upload a PDF, publish it, and invite specific users by email with VIEW or EDIT access.

---

### Phase 2 — Annotation System (Week 2)
**Goal:** Users with EDIT access can annotate, all viewers see annotations

- [ ] Add `Annotation` model to schema, run migration
- [ ] Build `GET /pdf/:id/annotations` route
- [ ] Build `POST /pdf/:id/annotations` route (EDIT access only)
- [ ] Build `DELETE /annotation/:id` route (own annotations only)
- [ ] Frontend: render annotation overlay on top of PDF pages using Fabric.js/Konva.js
- [ ] Frontend: highlight tool (select text range → save as HIGHLIGHT annotation)
- [ ] Frontend: comment tool (click location → type comment → save as COMMENT annotation)
- [ ] Frontend: annotation sidebar (list all annotations with author + timestamp)

**Deliverable:** Multiple users can view a PDF, users with EDIT access can highlight and comment, all annotations are visible to all viewers.

---

### Phase 3 — Real-time Collaboration (Week 3)
**Goal:** Annotations appear live without refreshing

- [ ] Install Socket.io on backend, integrate with Express server
- [ ] Create PDF rooms (join/leave on document open/close)
- [ ] Broadcast `annotation-added` to room on new annotation
- [ ] Broadcast `annotation-deleted` to room on deletion
- [ ] Frontend: install socket.io-client
- [ ] Frontend: on `annotation-added` event, render new annotation live
- [ ] Frontend: show active users in the document (presence indicator)
- [ ] Frontend: "User X is viewing" / "User Y is editing" indicators

**Deliverable:** Open the same PDF in two browser tabs — annotate in one, see it appear in the other in real-time.

---

### Phase 4 — Polish & Production Hardening (Week 4)
**Goal:** Production-ready, deployable, defensible in an interview

- [ ] Rate limiting on upload and annotation routes
- [ ] File size validation (reject > 50MB before upload starts)
- [ ] Error boundary components on frontend
- [ ] Loading states and skeleton screens
- [ ] Mobile responsive layout
- [ ] Deploy backend to Render with environment variables
- [ ] Deploy frontend to Vercel
- [ ] Set up S3 bucket with proper IAM policy (least privilege)
- [ ] Add CloudFront CDN in front of S3 (optional but impressive)
- [ ] Write a README with architecture diagram

**Deliverable:** A live, deployed URL you can demo in an interview.

---

## 9. What Makes This Impressive for SpotDraft

SpotDraft is a LegalTech company — contracts, documents, and access control are their *core business*. This project directly maps to:

| Your Feature | SpotDraft Relevance |
|---|---|
| Per-document access control (VIEW/EDIT) | Contract sharing with law firms vs. internal teams |
| Annotation + change tracking | Contract redlining, legal comments |
| Document state machine (PRIVATE→PUBLIC) | Contract lifecycle (draft → review → published) |
| Presigned S3 URLs | Secure document distribution without exposing storage |
| JWT auth + ownership enforcement | Preventing unauthorized access to sensitive contracts |
| Real-time collaboration | Live contract review sessions |

---

*Document End — Version 1.0*
