import { readFileSync } from 'node:fs'
import path from 'node:path'

export type SingleTrackPhaseContractName =
  | 'prepare'
  | 'classify'
  | 'research-refine'
  | 'plan'
  | 'risk-assess'
  | 'develop'
  | 'test-verify'
  | 'review-standard'
  | 'review-correctness-security'
  | 'review-architecture-conventions'
  | 'review-performance'
  | 'review-ui-quality'
  | 'review-fix'
  | 'reconcile'
  | 'release-publish'

const singleTrackPhaseContractFileNames: Record<
  SingleTrackPhaseContractName,
  string
> = {
  prepare: 'prepare.md',
  classify: 'classify.md',
  'research-refine': 'research-refine.md',
  plan: 'plan.md',
  'risk-assess': 'risk-assess.md',
  develop: 'develop.md',
  'test-verify': 'test-verify.md',
  'review-standard': 'review-standard.md',
  'review-correctness-security': 'review-correctness-security.md',
  'review-architecture-conventions': 'review-architecture-conventions.md',
  'review-performance': 'review-performance.md',
  'review-ui-quality': 'review-ui-quality.md',
  'review-fix': 'review-fix.md',
  reconcile: 'reconcile.md',
  'release-publish': 'release-publish.md',
}

const singleTrackPhaseContractRelativeDir = path.join(
  'packages',
  'autobot-cli',
  'contracts'
)

const singleTrackPhaseContractDir = path.resolve(__dirname, '..', 'contracts')

const safetyPreamble = readFileSync(
  path.join(singleTrackPhaseContractDir, 'safety-preamble.md'),
  'utf8'
)

export function listSingleTrackPhaseContractNames(): SingleTrackPhaseContractName[] {
  return Object.keys(
    singleTrackPhaseContractFileNames
  ) as SingleTrackPhaseContractName[]
}

export function getSingleTrackPhaseContractRelativePath(
  name: SingleTrackPhaseContractName
): string {
  return path.join(
    singleTrackPhaseContractRelativeDir,
    singleTrackPhaseContractFileNames[name]
  )
}

export function getSingleTrackPhaseContractPath(
  repoPath: string,
  name: SingleTrackPhaseContractName
): string {
  return path.join(repoPath, getSingleTrackPhaseContractRelativePath(name))
}

export function loadSingleTrackPhaseContract(
  name: SingleTrackPhaseContractName
): string {
  const phaseContract = readFileSync(
    path.join(
      singleTrackPhaseContractDir,
      singleTrackPhaseContractFileNames[name]
    ),
    'utf8'
  )

  return `${safetyPreamble.trimEnd()}\n\n${phaseContract}`
}

export function renderSingleTrackPhaseContract(
  name: SingleTrackPhaseContractName,
  input: {
    issueId: string
    attempt: number
  }
): string {
  return loadSingleTrackPhaseContract(name)
    .replaceAll('<issue-id>', input.issueId)
    .replaceAll('<attempt>', String(input.attempt))
}
