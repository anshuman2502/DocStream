const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');
const { getAccessLevel, canView, canEdit } = require('../lib/accessControl');

module.exports = function (io) {
  const router = express.Router();

  async function resolveAccess(pdfId, userId) {
    const pdf = await prisma.pdf.findUnique({ where: { id: pdfId } });
    if (!pdf) return { pdf: null, level: null };
    const level = await getAccessLevel(pdf, userId);
    return { pdf, level };
  }

  // GET all annotations for a pdf
  router.get('/:pdfId/annotations', authMiddleware, async (req, res) => {
    try {
      const { pdf, level } = await resolveAccess(req.params.pdfId, req.userId);
      if (!pdf) return res.status(404).json({ error: 'PDF not found' });
      if (!canView(level)) return res.status(403).json({ error: 'You do not have access to this PDF' });

      const annotations = await prisma.annotation.findMany({
        where: { pdfId: req.params.pdfId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      });

      res.json({ annotations });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
    }
  });

  // POST create a HIGHLIGHT or COMMENT annotation (DRAWING removed, EDIT goes through /text-change)
  router.post('/:pdfId/annotations', authMiddleware, async (req, res) => {
    try {
      const { type, page, data } = req.body;
      const allowedTypes = ['HIGHLIGHT', 'COMMENT'];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid annotation type' });
      }

      const { pdf, level } = await resolveAccess(req.params.pdfId, req.userId);
      if (!pdf) return res.status(404).json({ error: 'PDF not found' });
      if (!canEdit(level)) return res.status(403).json({ error: 'You do not have permission to annotate this PDF' });

      const annotation = await prisma.annotation.create({
        data: { pdfId: req.params.pdfId, userId: req.userId, type, page, data },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      io.to(req.params.pdfId).emit('annotation-added', annotation);
      res.status(201).json({ annotation });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
    }
  });

  // POST a text-change — creates or updates an EDIT annotation (3-day merge window)
  router.post('/:pdfId/text-change', authMiddleware, async (req, res) => {
    try {
      const { page, originalText, currentText, position } = req.body;
      // position: { x, y, width, height } — normalized 0-1 fractions of the page

      const { pdf, level } = await resolveAccess(req.params.pdfId, req.userId);
      if (!pdf) return res.status(404).json({ error: 'PDF not found' });
      if (!canEdit(level)) return res.status(403).json({ error: 'You do not have permission to edit this PDF' });

      const POSITION_EPSILON = 0.02; // ~2% of page dimension
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const candidates = await prisma.annotation.findMany({
        where: { pdfId: req.params.pdfId, page, type: 'EDIT', createdAt: { gte: threeDaysAgo } },
      });

      const existing = candidates.find((a) => {
        if (a.data?.originalText !== originalText) return false;
        const dx = Math.abs((a.data?.position?.x ?? 0) - (position?.x ?? 0));
        const dy = Math.abs((a.data?.position?.y ?? 0) - (position?.y ?? 0));
        return dx < POSITION_EPSILON && dy < POSITION_EPSILON;
      });

      let annotation;
      if (existing) {
        annotation = await prisma.annotation.update({
          where: { id: existing.id },
          data: {
            userId: req.userId,
            data: { ...existing.data, currentText, position, lastChangedBy: req.userId },
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        io.to(req.params.pdfId).emit('annotation-updated', annotation);
      } else {
        annotation = await prisma.annotation.create({
          data: {
            pdfId: req.params.pdfId,
            userId: req.userId,
            type: 'EDIT',
            page,
            data: {
              originalText,
              currentText,
              position,
              windowStart: new Date().toISOString(),
              lastChangedBy: req.userId,
            },
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        io.to(req.params.pdfId).emit('annotation-added', annotation);
      }

      res.status(201).json({ annotation });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
    }
  });

  // DELETE an annotation — HIGHLIGHT/COMMENT only. EDIT is permanent, ever.
// DELETE an annotation — HIGHLIGHT/COMMENT only. EDIT is permanent, ever.
  router.delete('/annotations/:annotationId', authMiddleware, async (req, res) => {
    const { annotationId } = req.params;
    try {
      const annotation = await prisma.annotation.findUnique({ where: { id: annotationId } });
      if (!annotation) return res.status(404).json({ error: 'Annotation not found' });

      if (annotation.type === 'EDIT') {
        return res.status(403).json({ error: 'PDF edit annotations are permanent and cannot be deleted' });
      }
      if (annotation.userId !== req.userId) {
        return res.status(403).json({ error: 'You can only delete your own annotations' });
      }

      try {
        await prisma.annotation.delete({ where: { id: annotationId } });
      } catch (err) {
        if (err.code === 'P2025') {
          // Already deleted (e.g. a duplicate click or a stale UI) — treat as success
          return res.json({ success: true, alreadyDeleted: true });
        }
        throw err;
      }

      io.to(annotation.pdfId).emit('annotation-deleted', { id: annotationId, pdfId: annotation.pdfId });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
    }
  });
  return router;
};


  
