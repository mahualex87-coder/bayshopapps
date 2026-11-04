import type { ParcelStatusTone } from '../domain/parcel-status';

// Opaque, compact status surfaces stay legible over both glass backgrounds.
export const parcelStatusColors = {
  light: {
    danger: { text: '#A9232C', background: '#FCE8E9', border: '#E7AFB4' },
    warning: { text: '#775900', background: '#FFF4C7', border: '#DCC76F' },
    success: { text: '#216B45', background: '#E3F3E9', border: '#A8D2B9' },
    neutral: { text: '#526174', background: '#EEF2F7', border: '#CBD4E0' },
  },
  dark: {
    danger: { text: '#FFB7BD', background: '#48282E', border: '#96535E' },
    warning: { text: '#F4D66C', background: '#3D341C', border: '#8A773A' },
    success: { text: '#96DDB2', background: '#1F3B2E', border: '#4A8460' },
    neutral: { text: '#BDCADB', background: '#273243', border: '#56657A' },
  },
} satisfies Record<'light' | 'dark', Record<ParcelStatusTone, { text: string; background: string; border: string }>>;
