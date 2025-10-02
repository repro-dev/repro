 import { FastifyPluginAsync } from 'fastify'
 import { ZodTypeProvider } from 'fastify-type-provider-zod'
 import { go, map } from 'fluture'
 import z from 'zod'
 import { defaultSystemConfig } from '~/config/system'
 import { AccountService } from '~/services/account'
 import { FeatureGateService } from '~/services/featureGate'
 import { createResponseUtils } from '~/utils/response'

const listEnabledFeatureGatesResponseSchema = z.array(z.string())

const createFeatureGateSchema = {
  body: z.object({
    name: z.string(),
    description: z.string(),
  }),
} as const

const createFeatureGateResponseSchema = z.object({
   id: z.string(),
   name: z.string(),
   description: z.string(),
   enabled: z.number(),
   createdAt: z.string(),
 })

 const updateFeatureGateSchema = {
   body: z.object({
     name: z.string().optional(),
     description: z.string().optional(),
     enabled: z.number().optional(),
   }),
   params: z.object({
     id: z.string(),
   }),
 } as const

export function createFeatureGateRouter(
   featureGateService: FeatureGateService,
   accountService: AccountService,
   config = defaultSystemConfig
 ): FastifyPluginAsync {
   const { respondWith } = createResponseUtils(config)

   return async function (fastify) {
     const app = fastify.withTypeProvider<ZodTypeProvider>()

     app.get<{
       Reply: z.infer<typeof listEnabledFeatureGatesResponseSchema>
     }>(
       '/enabled',
       {
         schema: {
           response: {
             200: listEnabledFeatureGatesResponseSchema,
           },
         },
       },
       (_, res) => {
         respondWith(
           res,
           featureGateService
             .listEnabledFeatureGates()
             .pipe(map(gates => gates.map(gate => gate.name)))
         )
       }
     )

     app.post<{
       Body: z.infer<typeof createFeatureGateSchema.body>
       Reply: z.infer<typeof createFeatureGateResponseSchema>
     }>(
       '/',
       {
         schema: {
           body: createFeatureGateSchema.body,
           response: {
             201: createFeatureGateResponseSchema,
           },
         },
       },
        (req, res) => {
          respondWith(
            res,
            go(function* () {
              const user = yield req.getCurrentUser()
              yield accountService.ensureStaffUser(user)
              return yield featureGateService.createFeatureGate(
                req.body.name,
                req.body.description
              )
            }),
            201
          )
        }
      )

      app.patch<{
        Body: z.infer<typeof updateFeatureGateSchema.body>
        Params: z.infer<typeof updateFeatureGateSchema.params>
        Reply: z.infer<typeof createFeatureGateResponseSchema>
      }>(
        '/:id',
        {
          schema: {
            body: updateFeatureGateSchema.body,
            params: updateFeatureGateSchema.params,
            response: {
              200: createFeatureGateResponseSchema,
            },
          },
        },
        (req, res) => {
          respondWith(
            res,
            go(function* () {
              const user = yield req.getCurrentUser()
              yield accountService.ensureStaffUser(user)
              return yield featureGateService.updateFeatureGate(
                req.params.id,
                req.body
              )
            })
          )
        }
      )
   }
 }
