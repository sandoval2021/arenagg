export type TeamIconCategory = 'Clássicos' | 'Mascotes / Animais' | 'Minimalistas';

const shieldSprite = '/icons/teams/premium-shields.svg';

export const BUILT_IN_TEAM_ICONS = [
  { name: 'Estrela Azul', category: 'Clássicos', url: `${shieldSprite}#classic-01` },
  { name: 'Ouro Noturno', category: 'Clássicos', url: `${shieldSprite}#classic-02` },
  { name: 'Rubro Elite', category: 'Clássicos', url: `${shieldSprite}#classic-03` },
  { name: 'Verde Imperial', category: 'Clássicos', url: `${shieldSprite}#classic-04` },
  { name: 'Royal Blue', category: 'Clássicos', url: `${shieldSprite}#classic-05` },
  { name: 'Laranja Vulcão', category: 'Clássicos', url: `${shieldSprite}#classic-06` },
  { name: 'Violeta Real', category: 'Clássicos', url: `${shieldSprite}#classic-07` },
  { name: 'Magenta Crown', category: 'Clássicos', url: `${shieldSprite}#classic-08` },
  { name: 'Ciano Atlântico', category: 'Clássicos', url: `${shieldSprite}#classic-09` },
  { name: 'Dourado Vintage', category: 'Clássicos', url: `${shieldSprite}#classic-10` },
  { name: 'Prata Black', category: 'Clássicos', url: `${shieldSprite}#classic-11` },
  { name: 'Sky Legacy', category: 'Clássicos', url: `${shieldSprite}#classic-12` },

  { name: 'Lobo Rubro', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-01` },
  { name: 'Pantera Verde', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-02` },
  { name: 'Fera Violeta', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-03` },
  { name: 'Tigre Bronze', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-04` },
  { name: 'Tubarão Ciano', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-05` },
  { name: 'Dragão Limão', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-06` },
  { name: 'Falcão Rosa', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-07` },
  { name: 'Urso Real', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-08` },
  { name: 'Leão Dourado', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-09` },
  { name: 'Lince Neon', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-10` },
  { name: 'Cobra Turquesa', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-11` },
  { name: 'Lobo Prata', category: 'Mascotes / Animais', url: `${shieldSprite}#mascot-12` },

  { name: 'Pulse Orange', category: 'Minimalistas', url: `${shieldSprite}#minimal-01` },
  { name: 'Pulse Sky', category: 'Minimalistas', url: `${shieldSprite}#minimal-02` },
  { name: 'Pulse Purple', category: 'Minimalistas', url: `${shieldSprite}#minimal-03` },
  { name: 'Pulse Lime', category: 'Minimalistas', url: `${shieldSprite}#minimal-04` },
  { name: 'Pulse Rose', category: 'Minimalistas', url: `${shieldSprite}#minimal-05` },
  { name: 'Pulse Silver', category: 'Minimalistas', url: `${shieldSprite}#minimal-06` },
  { name: 'Pulse Gold', category: 'Minimalistas', url: `${shieldSprite}#minimal-07` },
  { name: 'Pulse Red', category: 'Minimalistas', url: `${shieldSprite}#minimal-08` },
  { name: 'Pulse Amber', category: 'Minimalistas', url: `${shieldSprite}#minimal-09` },
  { name: 'Pulse Teal', category: 'Minimalistas', url: `${shieldSprite}#minimal-10` },
  { name: 'Pulse Pink', category: 'Minimalistas', url: `${shieldSprite}#minimal-11` },
  { name: 'Pulse Mono', category: 'Minimalistas', url: `${shieldSprite}#minimal-12` },
] as const satisfies ReadonlyArray<{ name: string; category: TeamIconCategory; url: string }>;

export const TEAM_ICON_CATEGORIES: TeamIconCategory[] = ['Clássicos', 'Mascotes / Animais', 'Minimalistas'];

export const BUILT_IN_AVATARS = [
  { name: 'Controle', url: '/icons/avatars/controller.svg' },
  { name: 'Robô', url: '/icons/avatars/robot.svg' },
  { name: 'Ninja', url: '/icons/avatars/ninja.svg' },
] as const;
