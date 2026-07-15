-- CreateEnum
CREATE TYPE "PdfState" AS ENUM ('PRIVATE', 'PUBLISHED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('HIGHLIGHT', 'COMMENT', 'DRAWING');

-- AlterTable
ALTER TABLE "Pdf" ADD COLUMN     "state" "PdfState" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "PdfAccess" (
    "id" TEXT NOT NULL,
    "pdfId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "pdfId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "page" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfAccess_pdfId_userId_key" ON "PdfAccess"("pdfId", "userId");

-- AddForeignKey
ALTER TABLE "PdfAccess" ADD CONSTRAINT "PdfAccess_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfAccess" ADD CONSTRAINT "PdfAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_pdfId_fkey" FOREIGN KEY ("pdfId") REFERENCES "Pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
