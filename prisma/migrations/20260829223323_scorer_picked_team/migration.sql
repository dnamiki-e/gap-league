-- AlterTable
ALTER TABLE "PredictionScorer" ADD COLUMN     "pickedTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "PredictionScorer" ADD CONSTRAINT "PredictionScorer_pickedTeamId_fkey" FOREIGN KEY ("pickedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

