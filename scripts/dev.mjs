// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Démarre l'API et l'interface côte à côte. Un simple `a & b` ne marche pas sous
// PowerShell ni sous cmd.exe ; ce script fait la même chose partout, sans dépendance.
// Ctrl+C arrête les deux ; si l'un s'arrête, l'autre suit.

import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const workspace of ['@sillon/api', '@sillon/web']) {
  // `shell: true` est nécessaire sous Windows pour exécuter npm.cmd ; les arguments sont
  // des constantes de ce fichier, jamais une saisie utilisateur.
  const child = spawn(npm, ['run', 'dev', '-w', workspace, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => stop(code ?? 1));
  child.on('error', (error) => {
    console.error(`Impossible de démarrer ${workspace} :`, error.message);
    stop(1);
  });
  children.push(child);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
