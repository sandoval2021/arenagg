import type { PrismaClient } from '@prisma/client';
import { calculateElo } from '../domain/ranking/elo';
import { resolveWinner } from '../domain/bracket/knockout';
import type { D1DatabasePort } from './native-auth.routes';

type RecordToApprove = {
  id: string;
  competitionId: string;
  version: number;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  nextMatchId: string | null;
  nextMatchSlot: string | null;
  groupId: string | null;
  profileAppliedAt: Date | null;
  homeTeam: { participation: { userId: string } } | null;
  awayTeam: { participation: { userId: string } } | null;
};

/** Confirm a submitted result and apply ranking/standings in a single SQLite D1 batch.
 * No Postgres advisory locks, and no double-awarding on duplicate approvals.
 */
export async function approveMatchD1(
  db: D1DatabasePort, prisma: PrismaClient, match: RecordToApprove,
  expectedVersion: number,
): Promise<{ status: 200 | 400 | 409 | 503; body: Record<string, unknown> }> {
  if (match.status !== 'AWAITING_APPROVAL' || match.version !== expectedVersion)
    return {status:409,body:{error:'VERSION_CONFLICT'}};
  if (match.homeScore == null || match.awayScore == null ||
      !match.homeTeam || !match.awayTeam || !match.homeTeamId || !match.awayTeamId) {
    return {status:409,body:{error:'MATCH_TEAMS_NOT_READY'}};
  }
  const homeScore=match.homeScore,awayScore=match.awayScore;
  let winnerTeamId:string|null=null;
  if(match.nextMatchId && match.nextMatchSlot){
    try {
      winnerTeamId=resolveWinner({
        homeTeamId:match.homeTeamId,awayTeamId:match.awayTeamId,
        homeScore,awayScore,
        homePenaltyScore:match.homePenaltyScore,
        awayPenaltyScore:match.awayPenaltyScore,
      });
    } catch {
      return {status:400,body:{error:'KNOCKOUT_DRAW_REQUIRES_PENALTIES'}};
    }
  }
  const homeUserId=match.homeTeam.participation.userId;
  const awayUserId=match.awayTeam.participation.userId;
  const homeWon=homeScore>awayScore || (homeScore===awayScore &&
    match.homePenaltyScore!=null && match.awayPenaltyScore!=null &&
    match.homePenaltyScore>match.awayPenaltyScore);
  const awayWon=homeScore<awayScore || (homeScore===awayScore &&
    match.homePenaltyScore!=null && match.awayPenaltyScore!=null &&
    match.awayPenaltyScore>match.homePenaltyScore);
  const isDraw=!homeWon&&!awayWon;
  const [homeProfile,awayProfile]=await Promise.all([
    prisma.userProfile.findUnique({where:{userId:homeUserId},select:{mmr:true}}),
    prisma.userProfile.findUnique({where:{userId:awayUserId},select:{mmr:true}}),
  ]);
  if(!homeProfile || !awayProfile) return {status:503,body:{error:'PROFILE_UNAVAILABLE'}};
  const elo=calculateElo(homeProfile.mmr,awayProfile.mmr,
    homeWon?'HOME_WIN':awayWon?'AWAY_WIN':'DRAW');
  const now=new Date().toISOString(), version=match.version+1;
  const statements=[
    db.prepare(`UPDATE "Match" SET "status"='FINISHED',"version"=?1
      WHERE "id"=?2 AND "status"='AWAITING_APPROVAL'
        AND "version"=?3 AND "profileAppliedAt" IS NULL`)
      .bind(version,match.id,match.version),
  ];
  const stats=[
    {id:homeUserId,wins:homeWon?1:0,losses:awayWon?1:0,
      goalsFor:homeScore,goalsAgainst:awayScore,delta:elo.homeDelta},
    {id:awayUserId,wins:awayWon?1:0,losses:homeWon?1:0,
      goalsFor:awayScore,goalsAgainst:homeScore,delta:elo.awayDelta},
  ];
  for(const row of stats){
    statements.push(db.prepare(`
      UPDATE "UserProfile"
      SET "totalWins"="totalWins"+?1,
          "totalLosses"="totalLosses"+?2,
          "totalDraws"="totalDraws"+?3,
          "totalGoalsScored"="totalGoalsScored"+?4,
          "totalGoalsConceded"="totalGoalsConceded"+?5,
          "mmr"="mmr"+?6,"updatedAt"=?7
      WHERE "userId"=?8
        AND EXISTS(SELECT 1 FROM "Match"
          WHERE "id"=?9 AND "version"=?10 AND "status"='FINISHED'
            AND "profileAppliedAt" IS NULL)
    `).bind(row.wins,row.losses,isDraw?1:0,row.goalsFor,
      row.goalsAgainst,row.delta,now,row.id,match.id,version));
  }
  if(match.groupId){
    for(const [teamId,won,lost,goalsFor,goalsAgainst] of [
      [match.homeTeamId,homeWon,awayWon,homeScore,awayScore],
      [match.awayTeamId,awayWon,homeWon,awayScore,homeScore],
    ] as Array<[string,boolean,boolean,number,number]>){
      statements.push(db.prepare(`
        UPDATE "GroupStanding" SET "played"="played"+1,
          "wins"="wins"+?1,"losses"="losses"+?2,
          "draws"="draws"+?3,"goalsFor"="goalsFor"+?4,
          "goalsAgainst"="goalsAgainst"+?5,
          "goalDifference"="goalDifference"+?6,
          "points"="points"+?7,"updatedAt"=?8
        WHERE "groupId"=?9 AND "teamId"=?10
        AND EXISTS (SELECT 1 FROM "Match" WHERE "id"=?11
          AND "version"=?12 AND "status"='FINISHED'
          AND "profileAppliedAt" IS NULL)
      `).bind(won?1:0,lost?1:0,isDraw?1:0,
        goalsFor,goalsAgainst,goalsFor-goalsAgainst,won?3:isDraw?1:0,
        now,match.groupId,teamId,match.id,version));
    }
  }
  if(winnerTeamId && match.nextMatchId && match.nextMatchSlot){
    const column=match.nextMatchSlot==='HOME'?'"homeTeamId"':'"awayTeamId"';
    statements.push(db.prepare(`
      UPDATE "Match" SET ${column}=?1 WHERE "id"=?2
        AND EXISTS (SELECT 1 FROM "Match" WHERE "id"=?3 AND
          "version"=?4 AND "status"='FINISHED')
    `).bind(winnerTeamId,match.nextMatchId,match.id,version));
  }
  statements.push(db.prepare(`UPDATE "Match" SET "profileAppliedAt"=?1
    WHERE "id"=?2 AND "version"=?3 AND "status"='FINISHED'
      AND "profileAppliedAt" IS NULL`).bind(now,match.id,version));
  statements.push(db.prepare(`
    UPDATE "Competition" SET "status"='FINISHED',"endsAt"=?1,"updatedAt"=?1
    WHERE "id"=?2 AND "status"='IN_PROGRESS'
      AND NOT EXISTS (SELECT 1 FROM "Match"
        WHERE "competitionId"=?2 AND "id"!=?3
          AND "status" NOT IN ('FINISHED','CANCELED'))
  `).bind(now,match.competitionId,match.id));

  try {
    const result=await db.batch(statements) as Array<{meta?:{changes?:number}}>;
    if(result[0]?.meta?.changes!==1)return {status:409,body:{error:'VERSION_CONFLICT'}};
    const fresh=await prisma.match.findUnique({where:{id:match.id}});
    return {status:200,body:(fresh??{id:match.id}) as Record<string,unknown>};
  } catch(error){
    console.error('[d1.approval] atomic batch failed',{
      errorName:error instanceof Error?error.name:'Unknown',
    });
    return {status:503,body:{error:'MATCH_APPROVAL_UNAVAILABLE'}};
  }
}
