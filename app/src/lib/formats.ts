import type { Vehicle } from '../types'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export function formatRp(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatMultiplier(value?: number | null): string {
  return (value ?? 1).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function toRoman(value: number): string {
  return ROMAN[value - 1] || String(value)
}

export function battleRating(vehicle: Vehicle): number | null | undefined {
  return vehicle.br?.rb ?? vehicle.br?.ab ?? vehicle.br?.sb
}

export function vehicleCountLabel(count: number): string {
  return `${count} 台`
}

export function availabilityLabel(vehicle: Vehicle): string {
  if (vehicle.availability === 'squadron') return '中队'
  if (vehicle.availability === 'battle_pass') return '通行证'
  if (vehicle.availability === 'event') return '活动'
  if (vehicle.availability === 'marketplace') return '市场'
  if (vehicle.availability === 'pack') return '礼包'
  if (vehicle.availability === 'special') return '特殊'
  if (vehicle.availability === 'limited') return '限时'
  if (vehicle.availability === 'unavailable') return '已下架'
  if (vehicle.availability === 'retired') return '已退役'
  return vehicle.type === 'premium' ? '高级' : '收藏'
}

export function acquisitionSummary(vehicle: Vehicle): string {
  const market = vehicle.marketplace_item_id ? ' · 市场券' : ''
  if (vehicle.availability === 'battle_pass') return `通行证奖励${market}`
  if (vehicle.availability === 'event') return `活动奖励${market}`
  if (vehicle.availability === 'marketplace') return 'Gaijin 市场交易券'
  if (vehicle.availability === 'pack') return '商店礼包车'
  if (vehicle.availability === 'special') return '特殊/促销载具'
  if (vehicle.availability === 'unavailable' || vehicle.availability === 'retired') return '当前不可获取'
  if (vehicle.availability === 'squadron' && vehicle.rp_cost) return `${formatRp(vehicle.rp_cost)} 中队研发点`
  if (vehicle.availability === 'limited' && vehicle.ge_cost) return `限时 ${formatRp(vehicle.ge_cost)} 金鹰`
  if (vehicle.gjn_cost) return `${vehicle.gjn_cost} GJN`
  if (vehicle.ge_cost) return `${formatRp(vehicle.ge_cost)} 金鹰`
  return '无直购价格'
}

export function acquisitionDescription(vehicle: Vehicle): string {
  const premiumNote = vehicle.type === 'premium'
    ? ' 出战时仍享受高级研发效率。'
    : ''
  const marketplaceNote = vehicle.marketplace_item_id
    ? ' Gaijin 市场上可能也有可交易券。'
    : ''
  if (vehicle.availability === 'battle_pass') {
    return `该载具为通行证奖励。${premiumNote}${marketplaceNote}`
  }
  if (vehicle.availability === 'event') {
    return `该载具为活动奖励。${premiumNote}${marketplaceNote}`
  }
  if (vehicle.availability === 'marketplace') {
    return `该载具通过市场交易券获取。${premiumNote}`
  }
  if (vehicle.availability === 'pack') {
    return `该载具随商店礼包发放,不能金鹰直购。${premiumNote}`
  }
  return `该载具不在常规研发路线上。${premiumNote}`
}
