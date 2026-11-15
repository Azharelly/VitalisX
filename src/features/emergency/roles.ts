import type { EmergencyRoleAssignment } from './model';

/** Minimal crew shape the role logic needs. */
export interface RoleCandidate {
  id: string;
  isMedic?: boolean;
}

/** One place that decides who counts as the crew medic (the app builds `isMedic` from the crew role). */
export const MEDIC_ROLE_PATTERN = /medic|doctor|physician|surgeon|paramedic|\bemt\b|\bcmo\b|nurse/i;
export const isMedicRole = (role: string): boolean => MEDIC_ROLE_PATTERN.test(role);

type RoleKey = keyof EmergencyRoleAssignment;
const ROLE_KEYS: readonly RoleKey[] = ['leaderId', 'readerId', 'radioLogId'];

/**
 * Picks leader, reader and radio/log. Rules:
 * - the patient never holds a role (unless they are the only crew member, then roles are empty);
 * - each role goes to a different person while there are enough helpers;
 * - a role in `preferred` is kept when it is still valid, otherwise it is re-picked;
 * - the leader defaults to a medic, if one is flagged.
 */
export function pickRoles(
  crew: readonly RoleCandidate[],
  patientId: string,
  preferred: Partial<EmergencyRoleAssignment> = {},
): EmergencyRoleAssignment {
  const helpers = crew.filter((c) => c.id !== patientId);
  const isHelper = (id: string | undefined): id is string => !!id && helpers.some((h) => h.id === id);

  const out: EmergencyRoleAssignment = { leaderId: '', readerId: '', radioLogId: '' };
  const taken = new Set<string>();

  const assign = (key: RoleKey, prefer: (h: RoleCandidate) => boolean) => {
    const keep = preferred[key];
    const pick =
      (isHelper(keep) && !taken.has(keep) ? keep : undefined) ??
      helpers.find((h) => !taken.has(h.id) && prefer(h))?.id ??
      helpers.find((h) => !taken.has(h.id))?.id ??
      // fewer helpers than roles: someone doubles up rather than leaving a role empty
      helpers[0]?.id ??
      '';
    out[key] = pick;
    if (pick) taken.add(pick);
  };

  assign('leaderId', (h) => !!h.isMedic);
  assign('readerId', () => true);
  assign('radioLogId', () => true);
  return out;
}

/**
 * Gives `role` to `crewId`. Returns null when that is not allowed (the patient cannot hold a role).
 * If the person already holds another role, the two roles swap, so nobody ends up with two jobs by accident.
 */
export function reassignRole(
  roles: EmergencyRoleAssignment,
  patientId: string,
  role: RoleKey,
  crewId: string,
): EmergencyRoleAssignment | null {
  if (!crewId || crewId === patientId) return null;
  const next = { ...roles };
  const previous = roles[role];
  const other = ROLE_KEYS.find((k) => k !== role && roles[k] === crewId);
  next[role] = crewId;
  if (other) next[other] = previous;
  return next;
}
