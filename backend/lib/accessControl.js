const prisma = require('./prisma');

/**
 * Resolves what a user can do with a PDF.
 * Returns 'OWNER' | 'EDIT' | 'VIEW' | null.
 *
 * - Owner: always OWNER, regardless of state.
 * - PRIVATE: nobody else gets anything.
 * - PUBLISHED: only explicit grants count. No implicit access.
 * - PUBLIC: everyone gets at least VIEW. An explicit EDIT grant upgrades to EDIT.
 */
async function getAccessLevel(pdf, userId) {
  if (!pdf) return null;
  if (pdf.ownerId === userId) return 'OWNER';

  if (pdf.state === 'PRIVATE') {
    return null;
  }

  const grant = await prisma.pdfAccess.findUnique({
    where: { pdfId_userId: { pdfId: pdf.id, userId } },
  });

  if (pdf.state === 'PUBLIC') {
    if (grant?.accessType === 'EDIT') return 'EDIT';
    return 'VIEW';
  }

  // PUBLISHED
  return grant ? grant.accessType : null;
}

function canView(level) {
  return level === 'OWNER' || level === 'EDIT' || level === 'VIEW';
}

function canEdit(level) {
  return level === 'OWNER' || level === 'EDIT';
}

module.exports = { getAccessLevel, canView, canEdit };