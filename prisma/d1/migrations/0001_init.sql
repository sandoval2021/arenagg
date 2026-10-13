-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "phone" TEXT,
    "phoneVerified" DATETIME,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "supabaseAuthId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "mmr" INTEGER NOT NULL DEFAULT 1500,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalDraws" INTEGER NOT NULL DEFAULT 0,
    "totalLosses" INTEGER NOT NULL DEFAULT 0,
    "totalGoalsScored" INTEGER NOT NULL DEFAULT 0,
    "totalGoalsConceded" INTEGER NOT NULL DEFAULT 0,
    "championshipsWon" INTEGER NOT NULL DEFAULT 0,
    "reputationAverage" REAL NOT NULL DEFAULT 0,
    "reputationCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginReward" DATETIME,
    "consoles" JSONB NOT NULL DEFAULT [],
    "favoriteFormation" TEXT,
    "playstyle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewerId" TEXT NOT NULL,
    "reviewedId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "tags" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserReview_reviewedId_fkey" FOREIGN KEY ("reviewedId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserReview_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchmakingQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MatchmakingQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchmakingChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "challengerPlatform" TEXT NOT NULL,
    "challengedPlatform" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CASUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MatchmakingChallenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchmakingChallenge_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CasualMatchRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "challengerPlatform" TEXT NOT NULL,
    "challengedPlatform" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CASUAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "challengerHandle" TEXT,
    "challengedHandle" TEXT,
    "challengerScore" INTEGER,
    "challengedScore" INTEGER,
    "scoreSubmittedById" TEXT,
    "scoreConfirmedById" TEXT,
    "challengerMmrDelta" INTEGER,
    "challengedMmrDelta" INTEGER,
    "mmrAppliedAt" DATETIME,
    "finishedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CasualMatchRoom_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "MatchmakingChallenge" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CasualMatchRoom_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CasualMatchRoom_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChaveaCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "imageUrl" TEXT,
    "boostType" TEXT NOT NULL DEFAULT 'NONE',
    "boostValue" REAL NOT NULL DEFAULT 0,
    "albumPage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserInventoryCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInventoryCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserInventoryCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ChaveaCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStickerPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "packType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserStickerPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "game" TEXT,
    "platform" TEXT,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'KNOCKOUT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "legFormat" TEXT NOT NULL DEFAULT 'SINGLE',
    "matchPace" TEXT NOT NULL DEFAULT 'QUICK',
    "teamSelection" TEXT NOT NULL DEFAULT 'FREE',
    "maxParticipants" INTEGER NOT NULL DEFAULT 20,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "prizeDistribution" TEXT NOT NULL DEFAULT '60,30,10',
    "firstPrize" TEXT,
    "secondPrize" TEXT,
    "thirdPrize" TEXT,
    "maxTeams" INTEGER,
    "groupCount" INTEGER,
    "qualifiersPerGroup" INTEGER,
    "thirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false,
    "requireValidation" BOOLEAN NOT NULL DEFAULT false,
    "pointsWin" INTEGER NOT NULL DEFAULT 3,
    "pointsDraw" INTEGER NOT NULL DEFAULT 1,
    "pointsLoss" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "championshipProfileAppliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Competition_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "teamName" TEXT NOT NULL DEFAULT 'Meu Time',
    "teamLogoUrl" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participation_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "country" TEXT,
    "league" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "logoUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    CONSTRAINT "Team_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Team_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TeamTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Stage_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "Group_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER,
    CONSTRAINT "GroupTeam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "goalDifference" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupStanding_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" DATETIME,
    CONSTRAINT "Round_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "roundId" TEXT,
    "groupId" TEXT,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeTeamName" TEXT,
    "awayTeamName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bracketPosition" INTEGER,
    "leg" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" DATETIME,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homePenaltyScore" INTEGER,
    "awayPenaltyScore" INTEGER,
    "homeReady" BOOLEAN NOT NULL DEFAULT false,
    "awayReady" BOOLEAN NOT NULL DEFAULT false,
    "homeReadyAt" DATETIME,
    "awayReadyAt" DATETIME,
    "walkoverWinnerTeamId" TEXT,
    "walkoverAppliedAt" DATETIME,
    "walkoverAppliedById" TEXT,
    "playerAEvidenceUrl" TEXT,
    "playerBEvidenceUrl" TEXT,
    "submittedById" TEXT,
    "disputeHomeScore" INTEGER,
    "disputeAwayScore" INTEGER,
    "disputeReason" TEXT,
    "disputedById" TEXT,
    "disputedAt" DATETIME,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "nextMatchId" TEXT,
    "nextMatchSlot" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "profileAppliedAt" DATETIME,
    CONSTRAINT "Match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_disputedById_fkey" FOREIGN KEY ("disputedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_nextMatchId_fkey" FOREIGN KEY ("nextMatchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitionChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionChatMessage_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompetitionChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'LINK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchMedia_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchMedia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchScorer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerKey" TEXT NOT NULL,
    "goals" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchScorer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchScorer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchStats" (
    "matchId" TEXT NOT NULL PRIMARY KEY,
    "statsStatus" TEXT NOT NULL DEFAULT 'NONE',
    "homePossession" INTEGER NOT NULL,
    "awayPossession" INTEGER NOT NULL,
    "homeShots" INTEGER NOT NULL,
    "awayShots" INTEGER NOT NULL,
    "homeShotsOnGoal" INTEGER NOT NULL,
    "awayShotsOnGoal" INTEGER NOT NULL,
    "homePasses" INTEGER NOT NULL,
    "awayPasses" INTEGER NOT NULL,
    "homeTackles" INTEGER NOT NULL,
    "awayTackles" INTEGER NOT NULL,
    "homeFouls" INTEGER NOT NULL,
    "awayFouls" INTEGER NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MatchStats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchStats_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MatchStats_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DefaultShield" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DefaultShield_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitionInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CompetitionInvite_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserProfile_mmr_totalWins_idx" ON "UserProfile"("mmr", "totalWins");

-- CreateIndex
CREATE INDEX "UserProfile_reputationAverage_reputationCount_idx" ON "UserProfile"("reputationAverage", "reputationCount");

-- CreateIndex
CREATE INDEX "UserBadge_userId_awardedAt_idx" ON "UserBadge"("userId", "awardedAt");

-- CreateIndex
CREATE INDEX "UserBadge_badgeCode_idx" ON "UserBadge"("badgeCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeCode_key" ON "UserBadge"("userId", "badgeCode");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_updatedAt_idx" ON "PushSubscription"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "UserReview_reviewedId_createdAt_idx" ON "UserReview"("reviewedId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserReview_reviewedId_stars_idx" ON "UserReview"("reviewedId", "stars");

-- CreateIndex
CREATE UNIQUE INDEX "UserReview_matchId_reviewerId_key" ON "UserReview"("matchId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchmakingQueue_userId_key" ON "MatchmakingQueue"("userId");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_status_expiresAt_idx" ON "MatchmakingQueue"("status", "expiresAt" DESC);

-- CreateIndex
CREATE INDEX "MatchmakingQueue_platform_status_expiresAt_idx" ON "MatchmakingQueue"("platform", "status", "expiresAt" DESC);

-- CreateIndex
CREATE INDEX "MatchmakingChallenge_challengedId_status_expiresAt_idx" ON "MatchmakingChallenge"("challengedId", "status", "expiresAt" DESC);

-- CreateIndex
CREATE INDEX "MatchmakingChallenge_challengerId_status_createdAt_idx" ON "MatchmakingChallenge"("challengerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CasualMatchRoom_challengeId_key" ON "CasualMatchRoom"("challengeId");

-- CreateIndex
CREATE INDEX "CasualMatchRoom_challengerId_status_updatedAt_idx" ON "CasualMatchRoom"("challengerId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CasualMatchRoom_challengedId_status_updatedAt_idx" ON "CasualMatchRoom"("challengedId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChaveaCard_cardNumber_key" ON "ChaveaCard"("cardNumber");

-- CreateIndex
CREATE INDEX "ChaveaCard_albumPage_cardNumber_idx" ON "ChaveaCard"("albumPage", "cardNumber");

-- CreateIndex
CREATE INDEX "ChaveaCard_rarity_isActive_idx" ON "ChaveaCard"("rarity", "isActive");

-- CreateIndex
CREATE INDEX "UserInventoryCard_userId_cardId_idx" ON "UserInventoryCard"("userId", "cardId");

-- CreateIndex
CREATE INDEX "UserInventoryCard_userId_isEquipped_idx" ON "UserInventoryCard"("userId", "isEquipped");

-- CreateIndex
CREATE INDEX "UserInventoryCard_cardId_idx" ON "UserInventoryCard"("cardId");

-- CreateIndex
CREATE INDEX "UserStickerPack_userId_quantity_idx" ON "UserStickerPack"("userId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "UserStickerPack_userId_packType_key" ON "UserStickerPack"("userId", "packType");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");

-- CreateIndex
CREATE INDEX "Competition_hostId_status_idx" ON "Competition"("hostId", "status");

-- CreateIndex
CREATE INDEX "Competition_game_platform_idx" ON "Competition"("game", "platform");

-- CreateIndex
CREATE INDEX "Competition_format_status_idx" ON "Competition"("format", "status");

-- CreateIndex
CREATE INDEX "Competition_championshipProfileAppliedAt_idx" ON "Competition"("championshipProfileAppliedAt");

-- CreateIndex
CREATE INDEX "Participation_userId_status_joinedAt_idx" ON "Participation"("userId", "status", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_competitionId_userId_key" ON "Participation"("competitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamTemplate_slug_key" ON "TeamTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_participationId_key" ON "Team"("participationId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_competitionId_name_key" ON "Team"("competitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_competitionId_order_key" ON "Stage"("competitionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Group_stageId_order_key" ON "Group"("stageId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GroupTeam_groupId_teamId_key" ON "GroupTeam"("groupId", "teamId");

-- CreateIndex
CREATE INDEX "GroupStanding_groupId_points_goalDifference_goalsFor_idx" ON "GroupStanding"("groupId", "points", "goalDifference", "goalsFor");

-- CreateIndex
CREATE INDEX "GroupStanding_teamId_idx" ON "GroupStanding"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupStanding_groupId_teamId_key" ON "GroupStanding"("groupId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_stageId_number_key" ON "Round"("stageId", "number");

-- CreateIndex
CREATE INDEX "Match_competitionId_status_idx" ON "Match"("competitionId", "status");

-- CreateIndex
CREATE INDEX "Match_stageId_roundId_idx" ON "Match"("stageId", "roundId");

-- CreateIndex
CREATE INDEX "Match_groupId_idx" ON "Match"("groupId");

-- CreateIndex
CREATE INDEX "Match_profileAppliedAt_idx" ON "Match"("profileAppliedAt");

-- CreateIndex
CREATE INDEX "Match_walkoverAppliedAt_idx" ON "Match"("walkoverAppliedAt");

-- CreateIndex
CREATE INDEX "Match_status_disputedAt_idx" ON "Match"("status", "disputedAt");

-- CreateIndex
CREATE INDEX "CompetitionChatMessage_competitionId_createdAt_idx" ON "CompetitionChatMessage"("competitionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CompetitionChatMessage_competitionId_userId_createdAt_idx" ON "CompetitionChatMessage"("competitionId", "userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MatchMedia_matchId_createdAt_idx" ON "MatchMedia"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchMedia_createdById_createdAt_idx" ON "MatchMedia"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchMedia_matchId_url_key" ON "MatchMedia"("matchId", "url");

-- CreateIndex
CREATE INDEX "MatchScorer_matchId_teamId_idx" ON "MatchScorer"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "MatchScorer_teamId_playerKey_idx" ON "MatchScorer"("teamId", "playerKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScorer_matchId_teamId_playerKey_key" ON "MatchScorer"("matchId", "teamId", "playerKey");

-- CreateIndex
CREATE INDEX "MatchStats_statsStatus_idx" ON "MatchStats"("statsStatus");

-- CreateIndex
CREATE INDEX "MatchStats_submittedById_idx" ON "MatchStats"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultShield_storagePath_key" ON "DefaultShield"("storagePath");

-- CreateIndex
CREATE INDEX "DefaultShield_isActive_sortOrder_idx" ON "DefaultShield"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionInvite_tokenHash_key" ON "CompetitionInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CompetitionInvite_competitionId_isActive_idx" ON "CompetitionInvite"("competitionId", "isActive");

