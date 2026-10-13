import type { PrismaClient } from '@prisma/client';
import { generateKnockout } from '../domain/bracket/knockout';
import { generateRoundRobin } from '../domain/matchmaking/roundRobin';
import type { D1DatabasePort } from './native-auth.routes';

/** D1-compatible all-or-nothing cup generation; no PostgreSQL transactions. */
type Row = { id: string; userId: string; team: { id: string } | null };
type StartResult = {
  status: 200 | 400 | 403 | 404 | 409 | 503;
  body: Record<string, unknown>;
};
type ScheduleMatch = { homeTeamId: string; awayTeamId: string };
type ScheduleRound = { number: number; matches: ScheduleMatch[] };

function error(status: StartResult['status'], reason: string): StartResult {
  return { status, body: { error: reason } };
}
function effectiveGroupCount(configured: number | null, total: number) {
  if (total < 4) return null;
  const wanted = configured && [2, 4, 8].includes(configured) ? configured : 4;
  return [8, 4, 2].find(n => n <= wanted && n * 2 <= total) ?? null;
}

export async function startCompetitionD1(
  d1: D1DatabasePort, prisma: PrismaClient, competitionId: string, hostId: string,
): Promise<StartResult> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true, hostId: true, type: true, format: true, status: true,
      legFormat: true, groupCount: true,
      _count: { select: { matches: true } },
      participations: {
        where: { status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' },
        select: { id: true, userId: true, team: { select: { id: true } } },
      },
    },
  });
  if (!competition) return error(404, 'COMPETITION_NOT_FOUND');
  if (competition.hostId !== hostId) return error(403, 'HOST_ONLY');
  if (!['REGISTRATION','READY'].includes(competition.status)) {
    return error(409, 'COMPETITION_ALREADY_STARTED');
  }
  if (competition._count.matches > 0) return error(409, 'MATCHES_ALREADY_EXIST');
  if (competition.participations.length < 2) return error(400, 'NOT_ENOUGH_PARTICIPANTS');
  const teams = (competition.participations as Row[]).map(row => row.team?.id);
  if (teams.some(id => !id)) return error(409, 'PARTICIPATION_TEAM_REPAIR_INCOMPLETE');
  const teamIds = teams as string[];
  const homeAway = competition.legFormat === 'HOME_AWAY';
  const groups = competition.format === 'GROUP_STAGE' || competition.type === 'GROUPS_KNOCKOUT';
  const groupCount = groups ? effectiveGroupCount(competition.groupCount, teamIds.length) : null;
  if (groups && !groupCount) return error(400, 'NOT_ENOUGH_PARTICIPANTS_FOR_GROUPS');

  const now = new Date().toISOString();
  const stageId = crypto.randomUUID();
  const statements = [
    d1.prepare(`
      UPDATE "Competition"
      SET "status"='IN_PROGRESS', "startsAt"=?1, "updatedAt"=?1
      WHERE "id"=?2 AND "hostId"=?3 AND "status" IN ('REGISTRATION','READY')
        AND NOT EXISTS (SELECT 1 FROM "Match" m WHERE m."competitionId"=?2)
    `).bind(now, competitionId, hostId),
  ];
  if (groups && groupCount) {
    statements.push(d1.prepare(`
      UPDATE "Competition" SET "groupCount"=?1, "qualifiersPerGroup"=2
      WHERE "id"=?2
    `).bind(groupCount, competitionId));
  }
  let matchCount = 0;
  const addMatch = (roundId: string, home: string|null, away: string|null,
    options?: { position?: number; leg?: number; groupId?: string; nextSlot?: string|null; id?: string }) => {
    const id=options?.id ?? crypto.randomUUID();
    statements.push(d1.prepare(`
      INSERT INTO "Match"
       ("id","competitionId","stageId","roundId","groupId","homeTeamId","awayTeamId",
        "bracketPosition","leg","nextMatchSlot")
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
    `).bind(id, competitionId, stageId, roundId, options?.groupId??null,
      home, away, options?.position??null, options?.leg??1, options?.nextSlot??null));
    matchCount++;
    return id;
  };
  const addRound = (number: number, name: string) => {
    const id=crypto.randomUUID();
    statements.push(d1.prepare(`
      INSERT INTO "Round" ("id","stageId","number","name","status")
      VALUES (?1,?2,?3,?4,?5)
    `).bind(id,stageId,number,name,number===1?'ACTIVE':'PENDING'));
    return id;
  };
  const addStage = (type: 'GROUP'|'LEAGUE'|'KNOCKOUT',name:string) => {
    statements.push(d1.prepare(`
      INSERT INTO "Stage" ("id","competitionId","type","name","order","status")
      VALUES (?1,?2,?3,?4,1,'ACTIVE')
    `).bind(stageId,competitionId,type,name));
  };

  if (groups && groupCount) {
    addStage('GROUP','Fase de Grupos');
    const buckets=Array.from({length:groupCount},()=>[] as string[]);
    teamIds.forEach((id,i)=>buckets[i%groupCount].push(id));
    const schedules=buckets.map(bucket=>generateRoundRobin(bucket,homeAway));
    const maxRounds=Math.max(...schedules.map(s=>s.length));
    const rounds=new Map<number,string>();
    for(let i=1;i<=maxRounds;i++)rounds.set(i,addRound(i,'Grupos · Rodada '+i));
    for(let i=0;i<buckets.length;i++){
      const groupId=crypto.randomUUID();
      statements.push(d1.prepare(`
        INSERT INTO "Group" ("id","stageId","name","order") VALUES (?1,?2,?3,?4)
      `).bind(groupId,stageId,'Grupo '+String.fromCharCode(65+i),i+1));
      for(let j=0;j<buckets[i].length;j++){
        const teamId=buckets[i][j];
        statements.push(d1.prepare(`
          INSERT INTO "GroupTeam" ("id","groupId","teamId","seed") VALUES (?1,?2,?3,?4)
        `).bind(crypto.randomUUID(),groupId,teamId,j+1));
        statements.push(d1.prepare(`
          INSERT INTO "GroupStanding" ("id","groupId","teamId","updatedAt")
          VALUES (?1,?2,?3,?4)
        `).bind(crypto.randomUUID(),groupId,teamId,now));
      }
      for(const round of schedules[i]){
        const roundId=rounds.get(round.number);
        if (!roundId) continue;
        for(const m of round.matches) addMatch(roundId,m.homeTeamId,m.awayTeamId,{groupId});
      }
    }
  } else if (competition.type === 'LEAGUE') {
    addStage('LEAGUE','Liga');
    const schedule=generateRoundRobin(teamIds,homeAway);
    for(const round of schedule){
      const roundId=addRound(round.number,'Liga · Rodada '+round.number);
      for(const m of round.matches)addMatch(roundId,m.homeTeamId,m.awayTeamId);
    }
  } else {
    addStage('KNOCKOUT','Mata-mata');
    const slots=generateKnockout(teamIds);
    const bracketSize=2**Math.ceil(Math.log2(teamIds.length));
    let cursor=0, slotsPerRound=bracketSize/2, number=1;
    const byPosition=new Map<number,string>();
    const linkUpdates: Array<[string,string]>=[];
    while(slotsPerRound>=1){
      const roundId=addRound(number,slotsPerRound===1?'Final':
        (number===1&&bracketSize===4?'Semifinal':'Mata-mata · Rodada '+number));
      for(const slot of slots.slice(cursor,cursor+slotsPerRound)){
        const firstId=crypto.randomUUID();
        byPosition.set(slot.position,firstId);
        addMatch(roundId,slot.homeTeamId,slot.awayTeamId,{
          position:slot.position, leg:1,nextSlot:slot.nextSlot,id:firstId,
        });
        if(homeAway&&slot.homeTeamId&&slot.awayTeamId){
          addMatch(roundId,slot.awayTeamId,slot.homeTeamId,{
            position:slot.position,leg:2,nextSlot:slot.nextSlot,
          });
        }
      }
      cursor+=slotsPerRound;
      slotsPerRound/=2;
      number++;
    }
    if(!homeAway){
      for(const slot of slots){
        if(!slot.nextPosition)continue;
        const source=byPosition.get(slot.position);
        const next=byPosition.get(slot.nextPosition);
        if(source&&next)linkUpdates.push([source,next]);
      }
    }
    for(const [source,next] of linkUpdates){
      statements.push(d1.prepare('UPDATE "Match" SET "nextMatchId"=?1 WHERE "id"=?2')
        .bind(next,source));
    }
  }
  if(matchCount<1) return error(409,'NO_MATCHES_GENERATED');
  // SQLite+D1 batch is atomic, unlike the former Prisma PG callback.
  // First UPDATE is conditionally gated by host/status/existing matches.
  // In a duplicate concurrent start the unique Stage(competitionId,order)
  // constraint aborts the entire batch and rolls back the status change.
  try {
    await d1.batch(statements);
    return {
      status:200, body:{status:'IN_PROGRESS',matchCount,repairedTeams:0,
        effectiveGroupCount:groupCount,requestId:crypto.randomUUID()},
    };
  }catch(ex){
    const fresh=await prisma.competition.findUnique({where:{id:competitionId},
      select:{status:true}}).catch(()=>null);
    if(fresh && fresh.status!=='REGISTRATION'&&fresh.status!=='READY')
      return error(409,'COMPETITION_ALREADY_STARTED');
    console.error('[d1.start] atomic batch rejected',
      {errorName:ex instanceof Error?ex.name:'Unknown'});
    return error(503,'START_UNAVAILABLE');
  }
}
