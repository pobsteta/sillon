// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Le disque lunaire, **dessiné** et non illustré.
//
// Huit images de phases pèseraient plus que ce fichier, ne montreraient que huit états sur
// un cycle continu, et mentiraient un jour sur quatre — la lune est gibbeuse à 62 % ou à
// 94 %, pas « gibbeuse ». Ce tracé suit la part éclairée réelle, au millième près, et suit
// donc aussi la valeur que le serveur a calculée : une seule source, pas deux qui dérivent.
//
// **La géométrie, parce qu'elle n'est pas évidente.** Le terminateur — la frontière entre
// l'ombre et la lumière — est un cercle vu de biais, donc une **ellipse** dont le demi-axe
// vaut `r × |1 − 2f|`. À f = 0,5 il est plat : le quartier est une demi-lune. En deçà il
// bombe du côté éclairé et creuse le croissant ; au-delà il bombe de l'autre côté et
// remplit la gibbeuse. C'est tout le dessin, et c'est pour cela qu'un seul chemin suffit.

/**
 * @param illumination Part éclairée, en millièmes (0 à 1000), telle que l'API la rend.
 * @param waxing La lune croît : l'éclairement est à droite dans l'hémisphère nord.
 */
export function MoonDisc({
  illumination,
  waxing,
  size = 64,
}: {
  illumination: number;
  waxing: boolean;
  size?: number;
}) {
  const r = 50;
  const part = Math.min(1, Math.max(0, illumination / 1000));
  // Demi-axe du terminateur. `Math.abs` : le signe est porté par le sens de l'arc, pas par
  // le rayon — un rayon négatif est refusé par SVG et le disque disparaîtrait.
  const rx = Math.round(r * Math.abs(1 - 2 * part) * 100) / 100;
  // Gibbeuse : le terminateur bombe **au-delà** du centre, donc du côté sombre.
  const interieur = part > 0.5 ? 1 : 0;

  return (
    <svg
      viewBox="-52 -52 104 104"
      width={size}
      height={size}
      aria-hidden
      // Le sens du cycle se joue par une symétrie : le tracé n'est écrit qu'une fois.
      style={waxing ? undefined : { transform: 'scaleX(-1)' }}
    >
      {/* Le disque entier, en ombre. Un cercle plein : la partie non éclairée reste
          visible dans le ciel, et un croissant flottant dans le vide se lirait mal. */}
      <circle cx={0} cy={0} r={r} className="fill-earth-700/35 dark:fill-earth-200/20" />
      {part > 0.001 ? (
        <path
          d={`M 0,${-r} A ${r},${r} 0 0,1 0,${r} A ${rx},${r} 0 0,${interieur} 0,${-r} Z`}
          className="fill-amber-200 dark:fill-amber-100"
        />
      ) : null}
      <circle
        cx={0}
        cy={0}
        r={r}
        fill="none"
        strokeWidth={2}
        className="stroke-earth-700/30 dark:stroke-earth-200/25"
      />
    </svg>
  );
}
