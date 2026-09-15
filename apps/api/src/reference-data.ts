// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (référentiel d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Référentiel de départ d'une nouvelle ferme (équivalent de `priv/repo/seeds` chez Brinjel).
// Les délais de retour sont exprimés en années ; ce sont les valeurs usuelles en maraîchage
// diversifié, chaque ferme peut les ajuster.

export interface FamilySeed {
  name: string;
  nameEn: string;
  color: string;
  interval: number;
  crops: { name: string; nameEn: string }[];
}

export const DEFAULT_FAMILIES: FamilySeed[] = [
  {
    name: 'Solanacées',
    nameEn: 'Nightshades',
    color: '#b91c1c',
    interval: 4,
    crops: [
      { name: 'Tomate', nameEn: 'Tomato' },
      { name: 'Aubergine', nameEn: 'Eggplant' },
      { name: 'Poivron', nameEn: 'Pepper' },
      { name: 'Pomme de terre', nameEn: 'Potato' },
    ],
  },
  {
    name: 'Cucurbitacées',
    nameEn: 'Cucurbits',
    color: '#ea580c',
    interval: 4,
    crops: [
      { name: 'Courgette', nameEn: 'Zucchini' },
      { name: 'Concombre', nameEn: 'Cucumber' },
      { name: 'Courge', nameEn: 'Winter squash' },
      { name: 'Melon', nameEn: 'Melon' },
    ],
  },
  {
    name: 'Brassicacées',
    nameEn: 'Brassicas',
    color: '#0d9488',
    interval: 4,
    crops: [
      { name: 'Chou', nameEn: 'Cabbage' },
      { name: 'Navet', nameEn: 'Turnip' },
      { name: 'Radis', nameEn: 'Radish' },
      { name: 'Roquette', nameEn: 'Rocket' },
    ],
  },
  {
    name: 'Apiacées',
    nameEn: 'Apiaceae',
    color: '#f59e0b',
    interval: 3,
    crops: [
      { name: 'Carotte', nameEn: 'Carrot' },
      { name: 'Persil', nameEn: 'Parsley' },
      { name: 'Céleri', nameEn: 'Celery' },
      { name: 'Fenouil', nameEn: 'Fennel' },
    ],
  },
  {
    name: 'Astéracées',
    nameEn: 'Asteraceae',
    color: '#65a30d',
    interval: 2,
    crops: [
      { name: 'Laitue', nameEn: 'Lettuce' },
      { name: 'Chicorée', nameEn: 'Chicory' },
      { name: 'Mâche', nameEn: 'Corn salad' },
    ],
  },
  {
    name: 'Alliacées',
    nameEn: 'Alliums',
    color: '#7c3aed',
    interval: 4,
    crops: [
      { name: 'Oignon', nameEn: 'Onion' },
      { name: 'Poireau', nameEn: 'Leek' },
      { name: 'Ail', nameEn: 'Garlic' },
      { name: 'Échalote', nameEn: 'Shallot' },
    ],
  },
  {
    name: 'Fabacées',
    nameEn: 'Legumes',
    color: '#16a34a',
    interval: 3,
    crops: [
      { name: 'Haricot', nameEn: 'Bean' },
      { name: 'Pois', nameEn: 'Pea' },
      { name: 'Fève', nameEn: 'Broad bean' },
    ],
  },
  {
    name: 'Chénopodiacées',
    nameEn: 'Chenopods',
    color: '#0369a1',
    interval: 3,
    crops: [
      { name: 'Épinard', nameEn: 'Spinach' },
      { name: 'Betterave', nameEn: 'Beetroot' },
      { name: 'Blette', nameEn: 'Chard' },
    ],
  },
];

export interface TaskTypeSeed {
  name: string;
  nameEn: string;
  color: string;
  methods: { name: string; nameEn: string; implements?: { name: string; nameEn: string }[] }[];
}

export const DEFAULT_TASK_TYPES: TaskTypeSeed[] = [
  {
    name: 'Semis',
    nameEn: 'Sowing',
    color: '#4d7c0f',
    methods: [
      {
        name: 'En pépinière',
        nameEn: 'In nursery',
        implements: [{ name: 'Semoir manuel', nameEn: 'Hand seeder' }],
      },
      {
        name: 'En place',
        nameEn: 'Direct',
        implements: [{ name: 'Semoir à main', nameEn: 'Push seeder' }],
      },
    ],
  },
  {
    name: 'Plantation',
    nameEn: 'Planting',
    color: '#15803d',
    methods: [
      { name: 'Manuelle', nameEn: 'By hand' },
      { name: 'Planteuse', nameEn: 'Transplanter' },
    ],
  },
  {
    name: 'Désherbage',
    nameEn: 'Weeding',
    color: '#b45309',
    methods: [
      {
        name: 'Manuel',
        nameEn: 'Manual',
        implements: [
          { name: 'Houe maraîchère', nameEn: 'Wheel hoe' },
          { name: 'Binette', nameEn: 'Hoe' },
        ],
      },
      { name: 'Thermique', nameEn: 'Flame' },
    ],
  },
  {
    name: 'Irrigation',
    nameEn: 'Irrigation',
    color: '#0284c7',
    methods: [
      { name: 'Goutte-à-goutte', nameEn: 'Drip' },
      { name: 'Aspersion', nameEn: 'Sprinkler' },
    ],
  },
  {
    name: 'Palissage',
    nameEn: 'Trellising',
    color: '#7c3aed',
    methods: [{ name: 'Ficelle', nameEn: 'String' }],
  },
  {
    name: 'Préparation du sol',
    nameEn: 'Bed preparation',
    color: '#78350f',
    methods: [
      { name: 'Grelinette', nameEn: 'Broadfork' },
      { name: 'Motoculteur', nameEn: 'Rotary tiller' },
    ],
  },
  {
    name: 'Récolte',
    nameEn: 'Harvest',
    color: '#ca8a04',
    methods: [{ name: 'Manuelle', nameEn: 'By hand' }],
  },
  {
    name: 'Entretien',
    nameEn: 'Maintenance',
    color: '#525252',
    methods: [{ name: 'Général', nameEn: 'General' }],
  },
];

export const DEFAULT_UNITS = [
  { name: 'kg', nameEn: 'kg' },
  { name: 'botte', nameEn: 'bunch' },
  { name: 'pièce', nameEn: 'piece' },
  { name: 'caisse', nameEn: 'crate' },
];

export const DEFAULT_CONTAINERS = [
  { name: 'Plaque 60', size: 60 },
  { name: 'Plaque 77', size: 77 },
  { name: 'Plaque 104', size: 104 },
  { name: 'Motte 4 cm', size: 150 },
];

export const DEFAULT_PROVIDER = { name: 'Fournisseur par défaut', nameEn: 'Default provider' };
