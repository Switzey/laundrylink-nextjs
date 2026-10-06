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
  contact_name: string | null;
  business_email: string | null;
  state: string | null;
  lga: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  pickup_radius_km: number;
  delivery_radius_km: number;
  verification_status: "draft" | "pending" | "approved" | "needs_changes";
  onboarding_step: "business" | "location" | "services" | "verification" | "review" | "submitted";
  submitted_at: string | null;
  approved_at: string | null;
  services_count?: number;
  reviews_count?: number;
  logo_file_id?: number | null;
  cover_file_id?: number | null;
}

export interface Service {
  id: number;
  cleaner_id: number;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  is_active: number;
  category: string;
  turnaround_time: string | null;
  express_available: number;
}

export interface VendorVerification {
  id: number;
  cleaner_id: number;
  identity_type: "nin" | "drivers_license" | "passport" | "voters_card" | null;
  identity_number_encrypted: string | null;
  business_registration_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number_encrypted: string | null;
  information_confirmed: number;
  created_at: string;
  updated_at: string;
}

export interface VendorFileMetadata {
  id: number;
  cleaner_id: number;
  kind: "logo" | "cover" | "identity_document" | "business_document";
  filename: string;
  media_type: string;
  size: number;
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

