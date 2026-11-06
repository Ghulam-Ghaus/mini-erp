import { Global, Module } from '@nestjs/common';
import { parseAppEnv } from './env.js';

/** Injection token for the validated environment (`AppEnv`). */
export const APP_ENV = Symbol('APP_ENV');

@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: () => parseAppEnv(process.env) }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
