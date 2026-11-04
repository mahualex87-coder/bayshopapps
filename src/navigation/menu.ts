export const parcelTabs = [
  { key: 'waiting', label: 'navigation.waiting', icon: 'time-outline', activeIcon: 'time' },
  { key: 'warehouse', label: 'navigation.warehouse', icon: 'cube-outline', activeIcon: 'cube' },
  { key: 'shipments', label: 'navigation.shipments', icon: 'airplane-outline', activeIcon: 'airplane' },
  { key: 'support', label: 'navigation.supportTab', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
] as const;
const groups = [
  { label: 'navigation.groupCabinet', items: [
    { label: 'navigation.overview', href: '/', icon: 'grid-outline' },
    { label: 'shops.title', href: '/shops', icon: 'storefront-outline' },
    { label: 'navigation.shopping', href: '/shopping', icon: 'bag-handle-outline' },
    { label: 'navigation.cart', href: '/cart', icon: 'cart-outline' },
    { label: 'navigation.balance', href: '/balance', icon: 'receipt-outline' },
    { label: 'accountOps.payments', href: '/payments', icon: 'receipt-outline' },
    { label: 'refunds.title', href: '/refunds', icon: 'return-down-back-outline' },
  ] },
  { label: 'navigation.groupDelivery', items: [
    { label: 'navigation.received', href: '/received', icon: 'checkmark-circle-outline' },
    { label: 'navigation.warehouseAddresses', href: '/warehouse-addresses', icon: 'business-outline' },
    { label: 'navigation.recipients', href: '/address-book', icon: 'location-outline' },
    { label: 'navigation.calculator', href: '/calculator', icon: 'calculator-outline' },
    { label: 'accountOps.loyalty', href: '/loyalty', icon: 'ribbon-outline' },
  ] },
  { label: 'navigation.groupAccount', items: [
    { label: 'navigation.profile', href: '/account', icon: 'person-circle-outline' },
    { label: 'accountOps.news', href: '/notifications', icon: 'notifications-outline' },
    { label: 'navigation.settings', href: '/settings', icon: 'options-outline' },
  ] },
] as const;

/** The same destination definition drives the drawer and its route checks.
 * Payments and loyalty require a live account; the local preview has no such
 * screen. Active parcel stages and support stay in the persistent tab bar;
 * received parcels remain available as history in the drawer. */
export function drawerGroups(authenticated: boolean) {
  return groups.map(group => ({
    label: group.label,
    items: group.items.filter(item => authenticated || (item.href !== '/payments' && item.href !== '/loyalty' && item.href !== '/refunds' && item.href !== '/shops')),
  }));
}
