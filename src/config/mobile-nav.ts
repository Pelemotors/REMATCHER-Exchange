import {
  Home,
  Package,
  Search,
  Plus,
  MoreHorizontal,
  Bell,
  Users,
  Sparkles,
} from "lucide-react";

/**
 * Reference bottom nav (RTL visual, right → left):
 * בית · המלאי · קליטת רכב · חיפוש · עוד
 */
export const MOBILE_BOTTOM_NAV_ITEMS = [
  { href: "/home", label: "בית", icon: Home, capture: false },
  { href: "/inventory", label: "המלאי", icon: Package, capture: false },
  { href: "/intake/handoff", label: "קליטת רכב", icon: Plus, capture: true },
  { href: "/demand", label: "חיפוש", icon: Search, capture: false },
  { href: "/account", label: "עוד", icon: MoreHorizontal, capture: false },
] as const;

/** Secondary destinations — reachable via עוד. */
export const SECONDARY_NAV_ITEMS = [
  { href: "/matches", label: "התאמות", icon: Sparkles },
  { href: "/customers", label: "לקוחות", icon: Users },
  { href: "/intelligence", label: "מודיעין רשת", icon: Sparkles },
  { href: "/activity", label: "פעילות", icon: Bell },
  { href: "/opportunities", label: "הזדמנויות", icon: Sparkles },
] as const;
