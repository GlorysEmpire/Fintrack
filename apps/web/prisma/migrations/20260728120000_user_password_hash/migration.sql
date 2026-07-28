-- AlterTable: optional password for Email + Password auth (OTP users keep NULL)
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
