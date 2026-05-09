export interface Profile {
  id: string;
  display_name?: string;
  avatar_url?: string;
  goal?: "weight_loss" | "muscle_gain" | "performance" | "recovery" | "maintenance";
  height_cm?: number;
  weight_kg?: number;
  birth_year?: number;
  sex?: "male" | "female" | "other";
  garmin_enabled?: boolean;
}

export interface Activity {
  id: string;
  date: string;
  started_at?: string;
  type: string;
  name?: string;
  source?: string;       // "garmin" | "strava"
  distance_km?: number;
  duration_mins?: number;
  calories_burned?: number;
  avg_hr?: number;
  max_hr?: number;
  vo2_max?: number;
}

export interface HealthMetric {
  date: string;
  sleep_hours?: number;
  sleep_score?: number;
  hrv?: number;
  hrv_status?: string;
  hrv_weekly_avg?: number;
  hrv_baseline_low?: number;
  hrv_baseline_high?: number;
  resting_hr?: number;
  stress_level?: number;
  body_battery?: number;
  vo2_max?: number;
  steps?: number;
  active_mins?: number;
  training_readiness_score?: number;
  training_readiness_level?: string;
  training_readiness_feedback?: string;
}

export interface FoodLog {
  id: string;
  logged_at: string;
  date: string;
  meal_type: string;
  food_name: string;
  brand?: string;
  portion_g: number;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
}

export interface FoodSearchResult {
  openfoodfacts_id?: string;
  food_name: string;
  brand?: string;
  barcode?: string;
  image_url?: string;
  calories_per_100g?: number;
  protein_g_per_100g?: number;
  carbs_g_per_100g?: number;
  fat_g_per_100g?: number;
  fiber_g_per_100g?: number;
}

export interface DailyTarget {
  id?: string;
  calories_target: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  water_ml?: number;
}

export interface NutritionSummary {
  date: string;
  calories_consumed: number;
  calories_burned: number;
  calories_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  net_calories: number;
}

export interface SuggestionItem {
  name: string;
  category: "protein" | "recovery" | "sleep" | "energy" | "diet";
  reason: string;
  dose: string;
  priority: 1 | 2 | 3;
}

export interface SupplementSuggestion {
  id: string;
  generated_at: string;
  suggestions: SuggestionItem[];
  status: "pending" | "accepted" | "dismissed" | "ordered";
  summary?: string;
  context_json?: Record<string, unknown>;
}

export interface Product {
  product_id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  image_url?: string;
  description?: string;
}

export interface Order {
  id: string;
  placed_at: string;
  status: string;
  items: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    image_url?: string;
  }>;
  subtotal?: number;
  shipping?: number;
  total?: number;
  currency?: string;
  delivery_name?: string;
  mcp_provider?: string;
}

export interface MealPlan {
  id: string;
  week_start: string;
  goal: string;
  calorie_target: number;
  plan_json: Record<
    string,
    {
      breakfast: MealItem;
      lunch: MealItem;
      dinner: MealItem;
      snacks: MealItem[];
    }
  >;
  shopping_list?: {
    produce?: string[];
    protein?: string[];
    pantry?: string[];
    supplements?: string[];
  };
}

export interface MealItem {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_mins: number;
}
