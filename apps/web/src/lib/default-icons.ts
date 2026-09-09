export type TeamIconCategory = 'Clássicos' | 'Mascotes / Animais' | 'Minimalistas';

const shieldSprite = '/icons/teams/premium-shields.svg';

export const BUILT_IN_TEAM_ICONS = [
  { name: 'Estrela Elite', category: 'Clássicos', url: `${shieldSprite}#classic-01` },
  { name: 'Coroa Imperial', category: 'Clássicos', url: `${shieldSprite}#classic-02` },
  { name: 'Lâminas Rubras', category: 'Clássicos', url: `${shieldSprite}#classic-03` },
  { name: 'Chama Verde', category: 'Clássicos', url: `${shieldSprite}#classic-04` },
  { name: 'Raio Royal', category: 'Clássicos', url: `${shieldSprite}#classic-05` },
  { name: 'Alvo Vulcão', category: 'Clássicos', url: `${shieldSprite}#classic-06` },
  { name: 'Diamante Violeta', category: 'Clássicos', url: `${shieldSprite}#classic-07` },
  { name: 'Troféu Neon', category: 'Clássicos', url: `${shieldSprite}#classic-08` },
  { name: 'Âncora Atlântica', category: 'Clássicos', url: `${shieldSprite}#classic-09` },
  { name: 'Hexa Dourado', category: 'Clássicos', url: `${shieldSprite}#classic-10` },
  { name: 'Crosshair Black', category: 'Clássicos', url: `${shieldSprite}#classic-11` },
  { name: 'Asas Celestes', category: 'Clássicos', url: `${shieldSprite}#classic-12` },

  { name: 'Lobo Rubro', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-01` },
  { name: 'Pantera Verde', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-02` },
  { name: 'Fantasma Violeta', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-03` },
  { name: 'Caveira Bronze', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-04` },
  { name: 'Falcão Ciano', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-05` },
  { name: 'Tubarão Limão', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-06` },
  { name: 'Cobra Rosa', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-07` },
  { name: 'Touro Real', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-08` },
  { name: 'Leão Dourado', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-09` },
  { name: 'Pata Neon', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-10` },
  { name: 'Dragão Turquesa', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-11` },
  { name: 'Coruja Prata', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-12` },

  { name: 'X Orange', category: 'Minimalistas', url: `${shieldSprite}#minimal-01` },
  { name: 'Orbit Sky', category: 'Minimalistas', url: `${shieldSprite}#minimal-02` },
  { name: 'Triple Purple', category: 'Minimalistas', url: `${shieldSprite}#minimal-03` },
  { name: 'Chevron Lime', category: 'Minimalistas', url: `${shieldSprite}#minimal-04` },
  { name: 'Delta Rose', category: 'Minimalistas', url: `${shieldSprite}#minimal-05` },
  { name: 'Órbita Silver', category: 'Minimalistas', url: `${shieldSprite}#minimal-06` },
  { name: 'Plus Gold', category: 'Minimalistas', url: `${shieldSprite}#minimal-07` },
  { name: 'Flash Red', category: 'Minimalistas', url: `${shieldSprite}#minimal-08` },
  { name: 'Quad Amber', category: 'Minimalistas', url: `${shieldSprite}#minimal-09` },
  { name: 'Wave Teal', category: 'Minimalistas', url: `${shieldSprite}#minimal-10` },
  { name: 'Crown Pink', category: 'Minimalistas', url: `${shieldSprite}#minimal-11` },
  { name: 'Infinity Mono', category: 'Minimalistas', url: `${shieldSprite}#minimal-12` },
] as const satisfies ReadonlyArray<{ name: string; category: TeamIconCategory; url: string }>;

export const TEAM_ICON_CATEGORIES: TeamIconCategory[] = ['Clássicos', 'Mascotes / Animais', 'Minimalistas'];

export const BUILT_IN_AVATARS = [
  { name: 'Controle', url: '/icons/avatars/controller.svg' },
  { name: 'Robô', url: '/icons/avatars/robot.svg' },
  { name: 'Ninja', url: '/icons/avatars/ninja.svg' },
] as const;
