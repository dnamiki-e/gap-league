-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN     "allowSignup" BOOLEAN,
ADD COLUMN     "allowedEmailDomain" TEXT,
ADD COLUMN     "authMode" TEXT,
ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecretEnc" TEXT;
