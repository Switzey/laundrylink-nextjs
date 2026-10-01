export const ROLES = [
  "CUSTOMER",
  "VENDOR_OWNER",
  "VENDOR_MANAGER",
  "VENDOR_STAFF",
  "RIDER",
  "SUPPORT_AGENT",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export const CUSTOMER_ROLES: Role[] = ["CUSTOMER"];
export const VENDOR_ROLES: Role[] = ["VENDOR_OWNER", "VENDOR_MANAGER", "VENDOR_STAFF"];
export const VENDOR_MANAGEMENT_ROLES: Role[] = ["VENDOR_OWNER", "VENDOR_MANAGER"];
export const ADMIN_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];
export const SUPPORT_ROLES: Role[] = ["SUPPORT_AGENT", "ADMIN", "SUPER_ADMIN"];
export const LOGISTICS_ROLES: Role[] = ["RIDER", "SUPPORT_AGENT", "ADMIN", "SUPER_ADMIN"];

export function roleRequiresPhoneVerification(role: Role) {
  return VENDOR_ROLES.includes(role) || role === "RIDER";
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  address: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
}

export interface Cleaner {
  id: number;
  user_id: number | null;
  business_name: string;
  description: string | null;
  address: string;
  city: string;
  phone: string;
  rating: number;
  turnaround_time: string | null;
  opening_hours: string | null;
  is_available: number;
  is_approved: number;
  services_count?: number;
  reviews_count?: number;
}

export interface Service {
  id: number;
  cleaner_id: number;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  is_active: number;
}

export interface OrderSummary {
  id: number;
  customer_id: number | null;
  cleaner_id: number;
  status: string;
  subtotal: number;
  total: number;
  payment_status: string;
  pickup_date: string | null;
  pickup_time_window: string | null;
  delivery_date: string | null;
  delivery_time_window: string | null;
  created_at: string | null;
  business_name: string;
  customer_name?: string | null;
}

