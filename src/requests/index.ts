export interface loginReq {
    username: string;
    password: string;
}

export interface TaxFile {
    STT: number;
    "Ký hiệu mẫu số": string;
    "Ký hiệu hóa đơn": string;
    "Số hóa đơn": string;
    "Ngày lập": string;
    "MST người bán/MST người xuất hàng": string;
    "Tên người bán/Tên người xuất hàng": string;
    "MST người mua/MST người nhận hàng": string;
    "Tên người mua/Tên người nhận hàng": string;
    "Địa chỉ người mua": string;
    "Tổng tiền chưa thuế": number;
    "Tổng tiền thuế": number;
    "Tổng tiền chiết khấu thương mại": number;
    "Tổng tiền phí": number;
    "Tổng tiền thanh toán": number;
    "Đơn vị tiền tệ": string;
    "Tỷ giá": number;
    "Trạng thái hóa đơn": string;
    "Kết quả kiểm tra hóa đơn": string;
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