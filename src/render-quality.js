// 手机横竖屏采用同一清晰度；限制像素总量，而不是把高密度屏降到 1.5 倍。
export function renderPixelRatio(width, height, deviceRatio) {
  const phone = Math.min(width, height) < 650;
  return Math.min(deviceRatio, phone ? 2.5 : 1.75, Math.sqrt((phone ? 3_000_000 : 4_000_000) / (width * height)));
}
