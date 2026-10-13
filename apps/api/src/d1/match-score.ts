import type { PrismaClient } from '@prisma/client';
import { calculateElo } from '../domain/ranking/elo';
import { resolveWinner } from '../domain/bracket/knockout';
import type { D1DatabasePort } from './native-auth.routes';

type Scorer = { side: 'HOME'|'AWAY'; playerName: string; goals: number };
type ScoreInput = {
  homeScore:number;awayScore:number;version:number;
  homePenaltyScore?:number;awayPenaltyScore?:number;
  scorers:Scorer[];clipUrl?:string;
};
type MatchRecord = {
  id:string;version:number;status:string;competitionId:string;
  homeTeamId:string|null;awayTeamId:string|null;
  nextMatchId:string|null;nextMatchSlot:string|null;
  competition:{hostId:string;type:string;requireValidation:boolean};
  homeTeam:{participation:{userId:string}}|null;
  awayTeam:{participation:{userId:string}}|null;
};

export async function submitMatchScoreD1(
  d1:D1DatabasePort, prisma:PrismaClient, match:MatchRecord,
  input:ScoreInput, userId:string, nextStatus:string,evidenceKey?:string,
):Promise<{status:200|400|409|503; body:Record<string,unknown>}>{
  if(!match.homeTeamId||!match.awayTeamId || !match.homeTeam||!match.awayTeam){
    return {status:409,body:{error:'MATCH_TEAMS_NOT_READY'}};
  }
  const today=new Date().toISOString();
  const newVersion=match.version+1;
  const params=[
    input.homeScore,input.awayScore,input.homePenaltyScore??null,
    input.awayPenaltyScore??null,evidenceKey??null,
    nextStatus,userId,newVersion,match.id,input.version,match.status,
  ] as const;
  const updates=[
    d1.prepare(`
      UPDATE "Match" SET "homeScore"=?1,"awayScore"=?2,
        "homePenaltyScore"=?3,"awayPenaltyScore"=?4,
        "playerAEvidenceUrl"=?5,"status"=?6,"submittedById"=?7,
        "version"=?8
      WHERE "id"=?9 AND "version"=?10 AND "status"=?11
    `).bind(...params),
  ];
  // Replace scorer entries only when the same score version is current.
  updates.push(d1.prepare(`
    DELETE FROM "MatchScorer"
    WHERE "matchId"=?1 AND EXISTS (
      SELECT 1 FROM "Match" WHERE "id"=?1 AND "version"=?2
        AND "status"=?3
    )
  `).bind(match.id,newVersion,nextStatus));
  for(const scorer of input.scorers){
    const teamId=scorer.side==='HOME'?match.homeTeamId:match.awayTeamId;
    const key=scorer.playerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72);
    updates.push(d1.prepare(`
      INSERT INTO "MatchScorer"
        ("id","matchId","teamId","playerName","playerKey","goals","createdAt")
      SELECT ?1,?2,?3,?4,?5,?6,?7
      WHERE EXISTS (
        SELECT 1 FROM "Match" WHERE "id"=?2 AND "version"=?8
          AND "status"=?9
      )
    `).bind(crypto.randomUUID(),match.id,teamId,scorer.playerName,key,
      scorer.goals,today,newVersion,nextStatus));
  }
  if(input.clipUrl){
    // Store the clip in the same atomic batch; never omit it silently.
    const platform=/youtube|youtu\.be/i.test(input.clipUrl)?'YOUTUBE':
      /tiktok/i.test(input.clipUrl)?'TIKTOK':'LINK';
    updates.push(d1.prepare(`
      INSERT OR IGNORE INTO "MatchMedia"
        ("id","matchId","createdById","url","platform","createdAt")
      SELECT ?1,?2,?3,?4,?5,?6
      WHERE EXISTS (
        SELECT 1 FROM "Match" WHERE "id"=?2 AND "version"=?7
        AND "status"=?8
      )
    `).bind(crypto.randomUUID(),match.id,userId,input.clipUrl,platform,today,
      newVersion,nextStatus));
  }
  if(nextStatus==='FINISHED'){
    const homeUserId=match.homeTeam.participation.userId;
    const awayUserId=match.awayTeam.participation.userId;
    const homeWon=input.homeScore>input.awayScore ||
      input.homeScore===input.awayScore &&
      (input.homePenaltyScore??-1)>(input.awayPenaltyScore??-1);
    const awayWon=input.homeScore<input.awayScore ||
      input.homeScore===input.awayScore &&
      (input.awayPenaltyScore??-1)>(input.homePenaltyScore??-1);
    const draw=!homeWon&&!awayWon;
    const [homeProfile,awayProfile]=await Promise.all([
      prisma.userProfile.findUnique({where:{userId:homeUserId},select:{mmr:true}}),
      prisma.userProfile.findUnique({where:{userId:awayUserId},select:{mmr:true}}),
    ]);
    const elo=calculateElo(homeProfile?.mmr??1500,awayProfile?.mmr??1500,
      homeWon?'HOME_WIN':awayWon?'AWAY_WIN':'DRAW');
    for(const [id,wins,losses,goalsFor,goalsAgainst,eloDelta] of [
      [homeUserId,homeWon?1:0,awayWon?1:0,input.homeScore,input.awayScore,elo.homeDelta],
      [awayUserId,awayWon?1:0,homeWon?1:0,input.awayScore,input.homeScore,elo.awayDelta],
    ] as Array<[string,number,number,number,number,number]>){
      updates.push(d1.prepare(`
        UPDATE "UserProfile" SET "totalWins"="totalWins"+?1,
          "totalLosses"="totalLosses"+?2,"totalDraws"="totalDraws"+?3,
          "totalGoalsScored"="totalGoalsScored"+?4,
          "totalGoalsConceded"="totalGoalsConceded"+?5,
          "mmr"="mmr"+?6,"updatedAt"=?7
        WHERE "userId"=?8 AND EXISTS (
          SELECT 1 FROM "Match" WHERE "id"=?9 AND "version"=?10
            AND "status"='FINISHED' AND "profileAppliedAt" IS NULL
        )
      `).bind(wins,losses,draw?1:0,goalsFor,goalsAgainst,eloDelta,
        today,id,match.id,newVersion));
    }
    updates.push(d1.prepare(`
      UPDATE "Match" SET "profileAppliedAt"=?1
      WHERE "id"=?2 AND "version"=?3
        AND "status"='FINISHED' AND "profileAppliedAt" IS NULL
    `).bind(today,match.id,newVersion));
    if(match.nextMatchId && match.nextMatchSlot){
      let winner:string;
      try {
        winner=resolveWinner({
          homeTeamId:match.homeTeamId,awayTeamId:match.awayTeamId,
          homeScore:input.homeScore,awayScore:input.awayScore,
          homePenaltyScore:input.homePenaltyScore,awayPenaltyScore:input.awayPenaltyScore,
        });
      } catch {
        return {status:400,body:{error:'KNOCKOUT_DRAW_REQUIRES_PENALTIES'}};
      }
      const column=match.nextMatchSlot==='HOME' ? '"homeTeamId"' : '"awayTeamId"';
      updates.push(d1.prepare(`
        UPDATE "Match" SET ${column}=?1
        WHERE "id"=?2 AND EXISTS (
          SELECT 1 FROM "Match" WHERE "id"=?3 AND "version"=?4
            AND "status"='FINISHED'
        )
      `).bind(winner,match.nextMatchId,match.id,newVersion));
    }
    // Mark competition completed only after all its scheduled matches finish.
    updates.push(d1.prepare(`
      UPDATE "Competition"
      SET "status"='FINISHED',"endsAt"=?1,"updatedAt"=?1
      WHERE "id"=?2 AND "status"='IN_PROGRESS'
        AND NOT EXISTS (SELECT 1 FROM "Match"
          WHERE "competitionId"=?2
            AND "id"!=?3 AND "status" NOT IN ('FINISHED','CANCELED'))
    `).bind(today,match.competitionId,match.id));
  }
  try{
    const result=await d1.batch(updates) as Array<{meta?:{changes?:number}}>;
    if(result[0]?.meta?.changes!==1)return {status:409,body:{error:'VERSION_CONFLICT'}};
    const fresh=await prisma.match.findUnique({where:{id:match.id}});
    return {status:200,body:(fresh??{id:match.id}) as Record<string,unknown>};
  } catch(e){
    console.error('[d1.score] score batch failed',{errorName:e instanceof Error?e.name:'Unknown'});
    return {status:503,body:{error:'MATCH_SCORE_UNAVAILABLE'}};
  }
}
