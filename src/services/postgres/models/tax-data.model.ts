export interface TaxData {
  id: number;
  created_at: string;
  tax_id: string;
  tax_name: string | null;
  address: string | null;
  tax_authority: string | null;
  status: string | null;
}

export interface CreateTaxDataInput {
  tax_id: string;
  tax_name?: string | null;
  address?: string | null;
  tax_authority?: string | null;
  status?: string | null;
}
