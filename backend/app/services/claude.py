"""Claude AI integration for supplement suggestions and meal plans.

Falls back to deterministic stub output when ANTHROPIC_API_KEY is not set,
so the full flow (suggestion → accept → order) is clickable in dev.
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from ..config import get_settings

logger = logging.getLogger(__name__)

SUGGESTION_SYSTEM = """You are FitFuel's nutrition + supplement advisor.

You receive a JSON snapshot of the user's last 7 days of Garmin activity,
sleep, HRV, stress, macro intake, and goal. Output a JSON object with:

{
  "suggestions": [
    {
      "name": "<supplement or diet item>",
      "category": "protein|recovery|sleep|energy|diet",
      "reason": "<concise, data-backed reason referencing specific metrics>",
      "dose": "<evidence-based daily dose or change>",
      "priority": 1 | 2 | 3
    }
  ],
  "summary": "<1-2 sentence overall insight>"
}

Rules: cite actual numbers from the input. Keep dose conservative and safe.
Never recommend prescription-only substances. Max 5 suggestions."""


MEAL_PLAN_SYSTEM = """You are FitFuel's weekly meal planner.

Given the user's calorie target, macro targets, goal, and food preferences,
produce a 7-day meal plan as JSON:

{
  "plan": {
    "monday": { "breakfast": {"name","calories","protein_g","carbs_g","fat_g","prep_mins"},
                "lunch": {...}, "dinner": {...}, "snacks": [{...}] },
    "tuesday": {...}, ... "sunday": {...}
  },
  "shopping_list": {
    "produce": [...], "protein": [...], "pantry": [...], "supplements": [...]
  }
}

Keep total daily calories within ±5% of target. Balance macros. Vary meals."""


def _stub_suggestions(context: dict[str, Any]) -> dict[str, Any]:
    goal = (context.get("goal") or "performance").replace("_", " ")
    avg_sleep = context.get("avg_sleep_hours") or 6.8
    avg_protein = context.get("avg_protein_g") or 110
    net_cal = context.get("avg_net_calories") or 0

    items = [
        {
            "name": "Whey Protein Isolate",
            "category": "protein",
            "reason": f"Avg protein intake {avg_protein:.0f}g/day is below 1.6g/kg target for {goal}.",
            "dose": "25–30g post-workout, daily",
            "priority": 1,
        },
        {
            "name": "Magnesium Glycinate",
            "category": "sleep",
            "reason": f"Average sleep {avg_sleep:.1f}h trails the 7.5h recovery target.",
            "dose": "300–400mg, 30 min before bed",
            "priority": 2,
        },
        {
            "name": "Creatine Monohydrate",
            "category": "recovery",
            "reason": "Training load sustained ≥4 sessions/wk; creatine supports strength and recovery.",
            "dose": "5g daily, any time",
            "priority": 2,
        },
    ]
    summary = (
        f"You're in a {'surplus' if net_cal > 0 else 'deficit'} averaging "
        f"{net_cal:+.0f} kcal/day. Focus: protein timing + sleep recovery."
    )
    return {"suggestions": items, "summary": summary}


def _stub_meal_plan(calorie_target: int, goal: str) -> dict[str, Any]:
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    breakfast = {
        "name": "Greek yogurt, berries, granola",
        "calories": 420, "protein_g": 28, "carbs_g": 52, "fat_g": 10, "prep_mins": 5,
    }
    lunch = {
        "name": "Grilled chicken quinoa bowl",
        "calories": 620, "protein_g": 45, "carbs_g": 65, "fat_g": 18, "prep_mins": 20,
    }
    dinner = {
        "name": "Salmon, sweet potato, broccoli",
        "calories": 680, "protein_g": 42, "carbs_g": 55, "fat_g": 24, "prep_mins": 25,
    }
    snack = {
        "name": "Apple + almond butter",
        "calories": 260, "protein_g": 6, "carbs_g": 32, "fat_g": 14, "prep_mins": 2,
    }
    plan = {d: {"breakfast": breakfast, "lunch": lunch, "dinner": dinner, "snacks": [snack]} for d in days}
    shopping = {
        "produce": ["Berries 500g", "Broccoli 1kg", "Sweet potato 1kg", "Apples 7"],
        "protein": ["Chicken breast 1.5kg", "Salmon fillets 7", "Greek yogurt 1kg"],
        "pantry": ["Quinoa 500g", "Granola 500g", "Almond butter 250g", "Olive oil"],
        "supplements": ["Whey protein 1kg", "Creatine 300g", "Magnesium glycinate"],
    }
    return {"plan": plan, "shopping_list": shopping, "calorie_target": calorie_target, "goal": goal}


async def generate_suggestions(context: dict[str, Any]) -> dict[str, Any]:
    s = get_settings()
    if not s.ANTHROPIC_API_KEY:
        logger.info("ANTHROPIC_API_KEY not set — returning stub suggestions")
        return _stub_suggestions(context)

    try:
        from anthropic import AsyncAnthropic  # type: ignore

        client = AsyncAnthropic(api_key=s.ANTHROPIC_API_KEY)
        msg = await client.messages.create(
            model=s.CLAUDE_MODEL,
            max_tokens=1500,
            system=SUGGESTION_SYSTEM,
            messages=[{"role": "user", "content": json.dumps(context)}],
        )
        text = "".join(block.text for block in msg.content if hasattr(block, "text"))
        return json.loads(text)
    except Exception as e:  # pragma: no cover
        logger.warning("Claude call failed, using stub: %s", e)
        return _stub_suggestions(context)


async def generate_meal_plan(calorie_target: int, goal: str, preferences: list[str]) -> dict[str, Any]:
    s = get_settings()
    if not s.ANTHROPIC_API_KEY:
        return _stub_meal_plan(calorie_target, goal)

    try:
        from anthropic import AsyncAnthropic  # type: ignore

        client = AsyncAnthropic(api_key=s.ANTHROPIC_API_KEY)
        payload = {
            "calorie_target": calorie_target,
            "goal": goal,
            "preferences": preferences,
            "week_start": (date.today() - timedelta(days=date.today().weekday())).isoformat(),
        }
        msg = await client.messages.create(
            model=s.CLAUDE_MODEL,
            max_tokens=4000,
            system=MEAL_PLAN_SYSTEM,
            messages=[{"role": "user", "content": json.dumps(payload)}],
        )
        text = "".join(block.text for block in msg.content if hasattr(block, "text"))
        return json.loads(text)
    except Exception as e:  # pragma: no cover
        logger.warning("Claude meal plan failed, using stub: %s", e)
        return _stub_meal_plan(calorie_target, goal)
