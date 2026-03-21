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