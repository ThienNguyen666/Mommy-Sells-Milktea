const BANK_NAMES = {
  '970422': 'MB Bank', '970436': 'Vietcombank', '970415': 'Vietinbank',
  '970418': 'BIDV',    '970432': 'VPBank',       '970423': 'TPBank',
  '970407': 'Techcombank', '970443': 'SHB',      '970405': 'Agribank',
  '970425': 'VIB',     '970426': 'OCB',          '970416': 'ACB',
  '970431': 'Eximbank','970448': 'OCB',           '970414': 'Oceanbank',
};
const BANK_BIN_TO_CODE = {
  '970422': 'MB',  '970436': 'VCB', '970415': 'ICB',
  '970418': 'BIDV','970432': 'VPB', '970423': 'TPB',
  '970407': 'TCB', '970443': 'SHB', '970405': 'VBA',
  '970425': 'VIB', '970426': 'OCB', '970416': 'ACB',
  '970431': 'EIB',
};

const CATEGORY_CONFIG = {
  'Trà Sữa':      { emoji: '🧋', short: 'tra-sua' },
  'Trà Trái Cây': { emoji: '🍓', short: 'tra-trai-cay' },
  'Cà Phê':       { emoji: '☕', short: 'ca-phe' },
  'Đá Xay':       { emoji: '🧊', short: 'da-xay' },
  'Topping':      { emoji: '✨', short: 'topping' },
};

const BEST_SELLER_NAMES = [
  'trà sữa trân châu đen',
  'trà dâu tây',
  'cà phê sữa',
  'đá xay matcha',
  'trà sữa khoai môn',
];

module.exports = { BANK_NAMES, BANK_BIN_TO_CODE, CATEGORY_CONFIG, BEST_SELLER_NAMES };