export interface loginReq {
  username: string;
  password: string;
}

export interface TaxFile {
  STT: number;
  'Ký hiệu mẫu số': string;
  'Ký hiệu hóa đơn': string;
  'Số hóa đơn': string;
  'Ngày lập': string;
  'MST người bán/MST người xuất hàng': string;
  'Tên người bán/Tên người xuất hàng': string;
  'MST người mua/MST người nhận hàng': string;
  'Tên người mua/Tên người nhận hàng': string;
  'Địa chỉ người mua': string;
  'Tổng tiền chưa thuế': number;
  'Tổng tiền thuế': number;
  'Tổng tiền chiết khấu thương mại': number;
  'Tổng tiền phí': number;
  'Tổng tiền thanh toán': number;
  'Đơn vị tiền tệ': string;
  'Tỷ giá': number;
  'Trạng thái hóa đơn': string;
  'Kết quả kiểm tra hóa đơn': string;
}

export interface InvoiceData {
  stt: number; // STT
  khmshdon: number; // Ký hiệu mẫu số
  khhdon: string; // Ký hiệu hóa đơn
  shdon: number; // Số hóa đơn
  tdlap: string; // Ngày lập
  nbmst: string; // MST người bán/MST người xuất hàng
  nbten: string; // Tên người bán/Tên người xuất hàng
  nmmst: string; // MST người mua/MST người nhận hàng
  tgtcthue: number; // Tổng tiền chưa thuế
  tgtthue: number; // Tổng tiền thuế
  ttcktmai: number; // Tổng tiền chiết khấu thương mại
  tgtphi: number; // Tổng tiền phí
  tgtttbso: number; // Tổng tiền thanh toán
  tthai: string; // Trạng thái hóa đơn (1: Hóa đơn mới, 2: Hóa đơn thay thế, 3: Hóa đơn điều chỉnh, 4: Hóa đơn đã bị thay thế, 5: Hóa đơn đã bị điều chỉnh)
  nmdchi: string; // Địa chỉ người mua
  nmten: string; // Tên người mua
  khmshdgoc: string | null; // Ký hiệu mẫu số hóa đơn gốc (nếu có)
  khhdgoc: string | null; // Ký hiệu hóa đơn gốc (nếu có)
  shdgoc: string | null; // Số hóa đơn gốc (nếu có)
}

export interface InvoiceSoldData extends Omit<InvoiceData, 'nbmst' | 'nbten' | 'tgtphi'> {}

export interface InvoicePurchaseData extends Omit<InvoiceData, 'nmmst' | 'nmten'> {}
export interface UserInvoiceData {
  sott: number;
  codehd: string;
  formhd: string;
  serihd: string;
  sohd: string;
  nghd: string;
  nghdchr: string;
  company: string;
  masothue: string;
  mathang: string;
  sotien_net: number;
  sotien_tax: number;
  thuesuat: number;
  ghichu: string;
}

export interface LogginInvoiceReq {
  username: string;
  password?: string;
  ckey?: string;
  cvalue?: string;
}

export interface Invoice {
  stt: string;
  nbmst: string;
  khmshdon: number;
  khhdon: string;
  shdon: number;
  cqt: string;
  cttkhac: any[];

  dvtte: string;
  hdon: string;
  hsgcma: string;
  hsgoc: string;

  hthdon: number;
  htttoan: number;

  id: string;
  idtbao: string | null;

  khdon: string | null;
  khhdgoc: string | null;
  khmshdgoc: string | null;
  lhdgoc: string | null;

  mhdon: string;
  mtdiep: string | null;
  mtdtchieu: string;

  nbdchi: string;
  chma: string | null;
  chten: string | null;

  nbstkhoan: string;
  nbten: string;
  nbtnhang: string;

  nbttkhac: [];

  ncma: string;
  ncnhat: string;
  ngcnhat: string;
  nky: string;

  nmdchi: string;
  nmmst: string;
  nmstkhoan: string | null;
  nmten: string;
  nmtnmua: string;

  nmttkhac: [];

  ntao: string;
  ntnhan: string;

  pban: string;
  ptgui: number;

  shdgoc: string | null;

  tchat: number;
  tdlap: string;
  tgia: number;

  tgtcthue: number;
  tgtthue: number;

  tgtttbchu: string;
  tgtttbso: number;

  thdon: string;
  thlap: number;

  thttlphi: any[];
  thttltsuat: [];

  tlhdon: string;

  ttcktmai: number;
  tthai: number;

  ttkhac: [];

  tttbao: number;

  ttttkhac: [];

  ttxly: number;

  tvandnkntt: string;

  ladhddt: number;
  mkhang: string;

  nbsdthoai: string;
  nbdctdtu: string;

  nbcks: string;
  cqtcks: string;
  tgtphi?: number;

  gchu: string;
}
