import {
  ArrowDownLeft,
  ArrowUpRight,
  Car,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  PiggyBank,
  Shirt,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Tv,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";

const BY_CATEGORY: Record<string, LucideIcon> = {
  food: Utensils,
  transport: Car,
  bills: Home,
  household: Home,
  subscriptions: Tv,
  outings: Wine,
  shopping: ShoppingBag,
  personal: ShoppingBag,
  clothing: Shirt,
  health: HeartPulse,
  data: Smartphone,
  church: Landmark,
  tithe_payment: Landmark,
  charity: Gift,
  helping_others: Gift,
  family_support: Gift,
  investment_deposit: TrendingUp,
  asset_purchase: TrendingUp,
  real_estate: TrendingUp,
  gold: TrendingUp,
  safe_haven: PiggyBank,
};

/** An icon for a transaction row: its category if known, else the direction of the money. */
export function transactionIcon(type: string, category: string | null): LucideIcon {
  if (type === "i") return ArrowDownLeft;
  return (category && BY_CATEGORY[category]) || ArrowUpRight;
}
