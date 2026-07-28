-- CreateTable
CREATE TABLE "Earthquake" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "depthKm" DOUBLE PRECISION,
    "magnitude" DOUBLE PRECISION,
    "magType" TEXT,
    "maxIntensity" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Earthquake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshLog" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "eventsUpserted" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "RefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Earthquake_time_idx" ON "Earthquake"("time");

-- CreateIndex
CREATE INDEX "RefreshLog_status_finishedAt_idx" ON "RefreshLog"("status", "finishedAt");
