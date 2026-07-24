export const INVOICE_TASK_QUEUE_TYPES: Record<string, string> = {
  '/invoice/getPurchaseInvoice': 'Lấy hoá đơn mua',
  '/invoice/getSoldInvoice': 'Lấy hoá đơn bán',
  '/invoice/getDetailInvoice': 'Lấy chi tiết hoá đơn',
};

export const TEMPLATE_EXPORT_PURCHASE_INVOICE = {
  stt: 'STT',
  khmshdon: 'Ký hiệu mẫu số',
  khhdon: 'Ký hiệu hóa đơn',
  shdon: 'Số hoá đơn',
  tdlap: 'Ngày lập',
  nbmst: 'MST người bán',
  nbten: 'Tên người bán',
  diengiai: 'Diễn giải',
  tgtcthue: 'Tổng tiền trước thuế',
  tgtthue: 'Tổng tiền thuế',
  ttcktmai: 'Tổng tiền chiết khấu thương mại',
  tgtphi: 'Tổng tiền Phí',
  tgtttbso: 'Tổng tiền thanh toán',
  tthai: 'Trạng thái hoá đơn',
  ttxly: 'Kết quả xử lý',
  nmdchi: 'Địa chỉ người mua',
  nmten: 'Tên người mua',
  khmshdgoc: 'Ký hiệu mẫu số hóa đơn gốc',
  khhdgoc: 'Ký hiệu hóa đơn gốc',
  shdgoc: 'Số hóa đơn gốc',
};

export const TEMPLATE_EXPORT_SOLD_INVOICE = {
  stt: 'STT',
  khmshdon: 'Ký hiệu mẫu số',
  khhdon: 'Ký hiệu hóa đơn',
  shdon: 'Số hoá đơn',
  tdlap: 'Ngày lập',
  nmmst: 'MST người mua',
  nmten: 'Tên người mua',
  diengiai: 'Diễn giải',
  tgtcthue: 'Tổng tiền trước thuế',
  tgtthue: 'Tổng tiền thuế',
  ttcktmai: 'Tổng tiền chiết khấu thương mại',
  tgtttbso: 'Tổng tiền thanh toán',
  tthai: 'Trạng thái hoá đơn',
  ttxly: 'Kết quả xử lý',
  khmshdgoc: 'Ký hiệu mẫu số hóa đơn gốc',
  khhdgoc: 'Ký hiệu hóa đơn gốc',
  shdgoc: 'Số hóa đơn gốc',
};

export const TEMPLATE_EXPORT_COMPARE_RESULT = {
  stt: 'STT',
  khmshdon: 'Ký hiệu mẫu số',
  khhdon: 'Ký hiệu hóa đơn',
  shdon: 'Số hoá đơn',
  tdlap: 'Ngày lập',
  nbmst: 'MST người bán',
  nbten: 'Tên người bán',
  nmmst: 'MST người mua',
  nmten: 'Tên người mua',
  diengiai: 'Diễn giải',
  tgtcthue: 'Tổng tiền trước thuế',
  tgtthue: 'Tổng tiền thuế',
  ttcktmai: 'Tổng tiền chiết khấu thương mại',
  tgtphi: 'Tổng tiền Phí',
  tgtttbso: 'Tổng tiền thanh toán',
  tthai: 'Trạng thái hoá đơn',
  nmdchi: 'Địa chỉ người mua',
  khmshdgoc: 'Ký hiệu mẫu số hóa đơn gốc',
  khhdgoc: 'Ký hiệu hóa đơn gốc',
  shdgoc: 'Số hóa đơn gốc',
};

export const INVOICE_TTHAI_MAP: Record<number, string> = {
  1: 'Hóa đơn mới',
  2: 'Hóa đơn thay thế',
  3: 'Hóa đơn điều chỉnh',
  4: 'Hóa đơn đã bị thay thế',
  5: 'Hóa đơn đã bị điều chỉnh',
  6: 'Hóa đơn đã bị hủy',
};

export const INVOICE_TTXLY_MAP: Record<number, string> = {
  4: 'Hóa đơn không đủ điều kiện cấp mã',
  5: 'Đã cấp mã hóa đơn',
  6: 'Cục Thuế đã nhận không mã',
  8: 'Cục Thuế đã nhận hóa đơn có mã khởi tạo từ máy tính tiền'
};