/*
  Warnings:

  - You are about to drop the column `fileUrl` on the `Pdf` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AnnotationType" ADD VALUE 'EDIT';

-- AlterTable
ALTER TABLE "Pdf" DROP COLUMN "fileUrl";
