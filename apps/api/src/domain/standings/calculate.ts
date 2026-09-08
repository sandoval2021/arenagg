export type FinishedMatch = { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number };
export type Standing = { teamId: string; points: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number };
export function calculateStandings(teamIds: readonly string[], matches: readonly FinishedMatch[]): Standing[] {
 const table = new Map<string, Standing>(teamIds.map(id => [id,{teamId:id,points:0,played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,goalDifference:0}]));
 for (const m of matches) { const h=table.get(m.homeTeamId), a=table.get(m.awayTeamId); if(!h||!a) continue; h.played++;a.played++;h.goalsFor+=m.homeScore;h.goalsAgainst+=m.awayScore;a.goalsFor+=m.awayScore;a.goalsAgainst+=m.homeScore; if(m.homeScore>m.awayScore){h.wins++;h.points+=3;a.losses++;}else if(m.homeScore<m.awayScore){a.wins++;a.points+=3;h.losses++;}else{h.draws++;a.draws++;h.points++;a.points++;}}
 for(const s of table.values()) s.goalDifference=s.goalsFor-s.goalsAgainst;
 return [...table.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDifference-a.goalDifference||b.goalsFor-a.goalsFor||a.teamId.localeCompare(b.teamId));
}
