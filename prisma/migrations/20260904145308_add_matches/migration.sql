-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "apiMatchId" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "matchday" INTEGER,
    "status" TEXT NOT NULL,
    "utcDate" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "scoreHomeFt" INTEGER,
    "scoreAwayFt" INTEGER,
    "winner" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_apiMatchId_key" ON "Match"("apiMatchId");

-- CreateIndex
CREATE INDEX "Match_seasonId_stage_idx" ON "Match"("seasonId", "stage");

-- CreateIndex
CREATE INDEX "Match_seasonId_utcDate_idx" ON "Match"("seasonId", "utcDate");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
