import { FutureInstance } from 'fluture'
import { AccountService } from '~/services/account'
import { BillingService } from '~/services/billing'
import { FeatureGateService } from '~/services/featureGate'
import { OAuthService } from '~/services/oauth'
import { ProjectService } from '~/services/project'
import { RecordingService } from '~/services/recording'

export interface Services {
  accountService: AccountService
  billingService: BillingService
  featureGateService: FeatureGateService
  oauth: OAuthService
  projectService: ProjectService
  recordingService: RecordingService
}

export interface Fixture<T> {
  dependencies: Array<Fixture<unknown>>
  load(services: Services, ...deps: Array<unknown>): FutureInstance<Error, T>
}

export type FixtureArrayToValues<T> = {
  [K in keyof T]: T[K] extends Fixture<infer U> ? U : never
}

export type ValuesToFixtureArray<T> = {
  [K in keyof T]: Fixture<T[K]>
}
