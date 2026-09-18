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
  crops: {
    name: string;
    nameEn: string;
    /**
     * Ce qu'on récolte de l'espèce, pour le calendrier lunaire. Trois valeurs se
     * discutent et sont posées ici sciemment : le **céleri** est une feuille (le
     * céleri-rave serait une racine), le **poireau** une feuille (certains calendriers en
     * font une racine), le **fenouil** une feuille (c'est une base de feuilles, non un
     * bulbe racinaire). Chaque ferme peut les corriger.
     */
    harvestedPart?: 'root' | 'leaf' | 'flower' | 'fruit';
  }[];
}

export const DEFAULT_FAMILIES: FamilySeed[] = [
  {
    name: 'Solanacées',
    nameEn: 'Nightshades',
    color: '#b91c1c',
    interval: 4,
    crops: [
      { name: 'Tomate', nameEn: 'Tomato', harvestedPart: 'fruit' },
      { name: 'Aubergine', nameEn: 'Eggplant', harvestedPart: 'fruit' },
      { name: 'Poivron', nameEn: 'Pepper', harvestedPart: 'fruit' },
      { name: 'Pomme de terre', nameEn: 'Potato', harvestedPart: 'root' },
    ],
  },
  {
    name: 'Cucurbitacées',
    nameEn: 'Cucurbits',
    color: '#ea580c',
    interval: 4,
    crops: [
      { name: 'Courgette', nameEn: 'Zucchini', harvestedPart: 'fruit' },
      { name: 'Concombre', nameEn: 'Cucumber', harvestedPart: 'fruit' },
      { name: 'Courge', nameEn: 'Winter squash', harvestedPart: 'fruit' },
      { name: 'Melon', nameEn: 'Melon', harvestedPart: 'fruit' },
    ],
  },
  {
    name: 'Brassicacées',
    nameEn: 'Brassicas',
    color: '#0d9488',
    interval: 4,
    crops: [
      { name: 'Chou', nameEn: 'Cabbage', harvestedPart: 'leaf' },
      { name: 'Navet', nameEn: 'Turnip', harvestedPart: 'root' },
      { name: 'Radis', nameEn: 'Radish', harvestedPart: 'root' },
      { name: 'Roquette', nameEn: 'Rocket', harvestedPart: 'leaf' },
    ],
  },
  {
    name: 'Apiacées',
    nameEn: 'Apiaceae',
    color: '#f59e0b',
    interval: 3,
    crops: [
      { name: 'Carotte', nameEn: 'Carrot', harvestedPart: 'root' },
      { name: 'Persil', nameEn: 'Parsley', harvestedPart: 'leaf' },
      { name: 'Céleri', nameEn: 'Celery', harvestedPart: 'leaf' },
      { name: 'Fenouil', nameEn: 'Fennel', harvestedPart: 'leaf' },
    ],
  },
  {
    name: 'Astéracées',
    nameEn: 'Asteraceae',
    color: '#65a30d',
    interval: 2,
    crops: [
      { name: 'Laitue', nameEn: 'Lettuce', harvestedPart: 'leaf' },
      { name: 'Chicorée', nameEn: 'Chicory', harvestedPart: 'leaf' },
      { name: 'Mâche', nameEn: 'Corn salad', harvestedPart: 'leaf' },
    ],
  },
  {
    name: 'Alliacées',
    nameEn: 'Alliums',
    color: '#7c3aed',
    interval: 4,
    crops: [
      { name: 'Oignon', nameEn: 'Onion', harvestedPart: 'root' },
      { name: 'Poireau', nameEn: 'Leek', harvestedPart: 'leaf' },
      { name: 'Ail', nameEn: 'Garlic', harvestedPart: 'root' },
      { name: 'Échalote', nameEn: 'Shallot', harvestedPart: 'root' },
    ],
  },
  {
    name: 'Fabacées',
    nameEn: 'Legumes',
    color: '#16a34a',
    interval: 3,
    crops: [
      { name: 'Haricot', nameEn: 'Bean', harvestedPart: 'fruit' },
      { name: 'Pois', nameEn: 'Pea', harvestedPart: 'fruit' },
      { name: 'Fève', nameEn: 'Broad bean', harvestedPart: 'fruit' },
    ],
  },
  {
    name: 'Chénopodiacées',
    nameEn: 'Chenopods',
    color: '#0369a1',
    interval: 3,
    crops: [
      { name: 'Épinard', nameEn: 'Spinach', harvestedPart: 'leaf' },
      { name: 'Betterave', nameEn: 'Beetroot', harvestedPart: 'root' },
      { name: 'Blette', nameEn: 'Chard', harvestedPart: 'leaf' },
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
