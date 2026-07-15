const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');
const { getAccessLevel, canView } = require('../lib/accessControl');

const router = express.Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const SIGNED_URL_TTL = 10 * 60; // 10 minutes

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// UPLOAD a PDF
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const uniqueFilename = `${req.userId}/${Date.now()}-${req.file.originalname}`;

    const { error } = await supabase.storage
      .from('pdfs')
      .upload(uniqueFilename, req.file.buffer, {
        contentType: 'application/pdf',
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    const pdf = await prisma.pdf.create({
      data: {
        filename: uniqueFilename,
        originalName: req.file.originalname,
        size: req.file.size,
        ownerId: req.userId,
        state: 'PRIVATE',
      },
    });

    res.status(201).json({ message: 'PDF uploaded successfully', pdf });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 50MB limit' });
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// LIST my own PDFs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pdfs = await prisma.pdf.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ pdfs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// LIST PDFs shared with me — explicit grants + public PDFs (implicit VIEW)
router.get('/shared', authMiddleware, async (req, res) => {
  try {
    const sharedAccess = await prisma.pdfAccess.findMany({
      where: { userId: req.userId },
      include: {
        pdf: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    const grantedPdfIds = sharedAccess.map((access) => access.pdfId);

    const explicitlyShared = sharedAccess.map((access) => ({
      ...access.pdf,
      accessType: access.accessType,
    }));

    // PUBLIC pdfs the user can view by default, with no manual grant
    // and not already covered by an explicit grant above.
    const publicPdfs = await prisma.pdf.findMany({
      where: {
        state: 'PUBLIC',
        ownerId: { not: req.userId },
        id: { notIn: grantedPdfIds },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const implicitlyPublic = publicPdfs.map((pdf) => ({
      ...pdf,
      accessType: 'VIEW',
    }));

    res.json({ pdfs: [...explicitlyShared, ...implicitlyPublic] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET one PDF — checks access, returns a fresh signed URL
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const accessLevel = await getAccessLevel(pdf, req.userId);
    if (!canView(accessLevel)) {
      return res.status(403).json({ error: 'You do not have access to this PDF' });
    }

    const { data, error } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(pdf.filename, SIGNED_URL_TTL);

    if (error) {
      console.error('Supabase signed URL error:', error);
      return res.status(500).json({ error: 'Failed to generate file URL' });
    }

    res.json({ pdf: { ...pdf, fileUrl: data.signedUrl }, accessLevel });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// DELETE a PDF
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const pdf = await prisma.pdf.findUnique({ where: { id: req.params.id } });
    if (!pdf || pdf.ownerId !== req.userId) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    await supabase.storage.from('pdfs').remove([pdf.filename]);
    await prisma.pdf.delete({ where: { id: req.params.id } });

    res.json({ message: 'PDF deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;