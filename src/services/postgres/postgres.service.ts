import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import postgres from 'postgres';
import { CreateTaxDataInput, TaxData } from './models/tax-data.model';

@Injectable()
export class PostgresService implements OnModuleDestroy {
  constructor(
    @Inject('PostgresClient')
    private readonly sql: ReturnType<typeof postgres>,
  ) {
    Logger.log('PostgreSQL client initialized');
  }

  async upsertTaxData(rows: CreateTaxDataInput[]): Promise<void> {
    if (rows.length === 0) return;

    await this.sql`
      insert into public.tax_data ${this.sql(rows, 'tax_id', 'tax_name', 'address', 'tax_authority', 'status')}
      on conflict (tax_id) do update
      set
        tax_name = excluded.tax_name,
        address = excluded.address,
        tax_authority = excluded.tax_authority,
        status = excluded.status
    `;

    Logger.log(
      `Query upsert public.tax_data size=${rows.length} => Done`,
      PostgresService.name,
    );
  }

  async getTaxDataByTaxCode(taxCode: string): Promise<TaxData[]> {
    const normalizedTaxCode = taxCode.trim();

    Logger.log(
      `Query select public.tax_data by tax_id=${normalizedTaxCode} => Start`,
      PostgresService.name,
    );

    const rows = await this.sql<TaxData[]>`
      select id, created_at, tax_id, tax_name, address, tax_authority, status
      from public.tax_data
      where trim(tax_id) = ${normalizedTaxCode}
      order by tax_id
    `;

    Logger.log(
      `Query select public.tax_data by tax_id=${normalizedTaxCode} => Done (${rows.length} row(s))`,
      PostgresService.name,
    );

    return rows;
  }

  async onModuleDestroy() {
    await this.sql.end({ timeout: 5 });
    Logger.log('PostgreSQL client disconnected');
  }
}
