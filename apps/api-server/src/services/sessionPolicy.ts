import { Session } from '@repro/domain'

type SessionSubjectType = Session['subjectType']

export type SessionPolicy = {
  softExpirySeconds: number
  hardExpirySeconds: number
}

const userSessionPolicy: SessionPolicy = {
  softExpirySeconds: 30 * 24 * 3600,
  hardExpirySeconds: 90 * 24 * 3600,
}

const staffSessionPolicy: SessionPolicy = {
  softExpirySeconds: 12 * 3600,
  hardExpirySeconds: 7 * 24 * 3600,
}

export function getSessionPolicy(
  subjectType: SessionSubjectType
): SessionPolicy {
  return subjectType === 'user' ? userSessionPolicy : staffSessionPolicy
}
