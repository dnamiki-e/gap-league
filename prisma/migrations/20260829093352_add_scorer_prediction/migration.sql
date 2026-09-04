-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "apiPlayerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "teamId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionScorer" (
    "predictionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "predictedGoals" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,

    CONSTRAINT "PredictionScorer_pkey" PRIMARY KEY ("predictionId","playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_apiPlayerId_key" ON "Player"("apiPlayerId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionScorer_predictionId_slot_key" ON "PredictionScorer"("predictionId", "slot");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScorer" ADD CONSTRAINT "PredictionScorer_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScorer" ADD CONSTRAINT "PredictionScorer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
