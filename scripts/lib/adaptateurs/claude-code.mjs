// Adaptateur Claude Code du garde-fou (ADR-004, ADR-005) : traduit l'appel du hook
// PreToolUse en chemin de fichier, puis la réponse du cœur en demande de confirmation.

import { protections } from '../garde-fou.mjs';

// Outil de modification → champ de tool_input qui porte le chemin du fichier.
const OUTILS = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };

// Rend la sortie JSON du hook, ou null si l'outil peut suivre son cours.
export function decider(entree, racine) {
  const champ = OUTILS[entree?.tool_name];
  const p = champ ? protections(racine, entree.tool_input?.[champ]) : null;
  if (!p) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: p.message,
    },
  };
}
