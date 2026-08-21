import { Global, Module } from '@nestjs/common';
import postgres from 'postgres';
import { PostgresService } from './postgres.service';

@Global()
@Module({
  providers: [
    {
      provide: 'PostgresClient',
      useFactory: () => {
        const connectionString =
          process.env.DATABASE_URL || process.env.SUPABASE_URL;

        if (!connectionString) {
          throw new Error('DATABASE_URL (or SUPABASE_URL) is not set');
        }

        return postgres(connectionString, {
          ssl: 'require',
          prepare: false,
          connect_timeout: 15,
        });
      },
    },
    PostgresService,
  ],
  exports: ['PostgresClient', PostgresService],
})
export class PostgresModule {}
