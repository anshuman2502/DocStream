const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GRANT access to a user by email
router.post('/:id/access', authMiddleware, async (req, res) => {
  try {
    const { email, accessType } = req.body;

    if (!['VIEW', 'EDIT'].includes(accessType)) {
      return res.status(400).json({ error: 'accessType must be VIEW or EDIT' });
    }

    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    if (pdf.state === 'PRIVATE') {
      return res.status(400).json({
        error: 'Cannot grant access to a private PDF. Change state to PUBLISHED first.',
      });
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: 'No user found with that email' });
    }

    if (targetUser.id === req.userId) {
      return res.status(400).json({ error: 'You already own this PDF' });
    }

    const access = await prisma.pdfAccess.upsert({
      where: {
        pdfId_userId: { pdfId: pdf.id, userId: targetUser.id },
      },
      update: { accessType },
      create: {
        pdfId: pdf.id,
        userId: targetUser.id,
        accessType,
      },
    });

    res.status(201).json({
      message: `Access granted to ${email}`,
      access,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REVOKE single user access
router.delete('/:id/access/:userId', authMiddleware, async (req, res) => {
  try {
    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const existing = await prisma.pdfAccess.findUnique({
      where: {
        pdfId_userId: { pdfId: pdf.id, userId: req.params.userId },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Access record not found' });
    }

    await prisma.pdfAccess.delete({
      where: {
        pdfId_userId: { pdfId: pdf.id, userId: req.params.userId },
      },
    });

    res.json({ message: 'Access revoked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// BULK REVOKE — revoke access for multiple users at once
router.delete('/:id/access', authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }

    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    await prisma.pdfAccess.deleteMany({
      where: {
        pdfId: pdf.id,
        userId: { in: userIds },
      },
    });

    res.json({ message: `Access revoked for ${userIds.length} user(s)` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// LIST who has access (owner only)
router.get('/:id/access', authMiddleware, async (req, res) => {
  try {
    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const accessList = await prisma.pdfAccess.findMany({
      where: { pdfId: pdf.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ accessList });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// CHANGE PDF state
router.patch('/:id/state', authMiddleware, async (req, res) => {
  try {
    const { state } = req.body;

    if (!['PRIVATE', 'PUBLISHED', 'PUBLIC'].includes(state)) {
      return res.status(400).json({ error: 'state must be PRIVATE, PUBLISHED, or PUBLIC' });
    }

    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    if (state === 'PRIVATE') {
      await prisma.pdfAccess.deleteMany({ where: { pdfId: pdf.id } });
    }

    const updated = await prisma.pdf.update({
      where: { id: req.params.id },
      data: { state },
    });

    res.json({
      message: state === 'PRIVATE'
        ? 'PDF set to private. All access grants have been revoked.'
        : `PDF state updated to ${state}`,
      pdf: updated,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;