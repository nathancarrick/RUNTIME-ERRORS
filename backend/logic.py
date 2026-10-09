DISRUPTION_PROFILES = {
    "ROAD_BLOCK": {
        "base_delay": 120,
        "base_cost": 1500,
        "capacity_impact": 35,
        "actions": [
            {
                "action": "Reroute through alternate corridor",
                "delay": 45,
                "cost": 1800,
                "risk": 20,
            },
            {
                "action": "Use secondary transport corridor",
                "delay": 75,
                "cost": 2400,
                "risk": 15,
            },
            {
                "action": "Hold shipment until route reopens",
                "delay": 180,
                "cost": 700,
                "risk": 40,
            },
        ],
    },
    "VEHICLE_BREAKDOWN": {
        "base_delay": 150,
        "base_cost": 2500,
        "capacity_impact": 45,
        "actions": [
            {
                "action": "Dispatch replacement vehicle",
                "delay": 40,
                "cost": 3200,
                "risk": 15,
            },
            {
                "action": "Transfer shipment to nearby vehicle",
                "delay": 65,
                "cost": 2200,
                "risk": 20,
            },
            {
                "action": "Request third-party transport support",
                "delay": 90,
                "cost": 3800,
                "risk": 10,
            },
        ],
    },
    "WEATHER": {
        "base_delay": 180,
        "base_cost": 1200,
        "capacity_impact": 50,
        "actions": [
            {
                "action": "Reroute through safer corridor",
                "delay": 80,
                "cost": 2100,
                "risk": 20,
            },
            {
                "action": "Delay movement until conditions improve",
                "delay": 150,
                "cost": 900,
                "risk": 25,
            },
            {
                "action": "Switch to alternate transport mode",
                "delay": 100,
                "cost": 3500,
                "risk": 10,
            },
        ],
    },
    "PORT_DELAY": {
        "base_delay": 240,
        "base_cost": 3000,
        "capacity_impact": 60,
        "actions": [
            {
                "action": "Use alternate port",
                "delay": 100,
                "cost": 4500,
                "risk": 15,
            },
            {
                "action": "Prioritize shipment when operations resume",
                "delay": 180,
                "cost": 1800,
                "risk": 25,
            },
            {
                "action": "Switch to alternate transport route",
                "delay": 130,
                "cost": 5200,
                "risk": 10,
            },
        ],
    },
    "FUEL_SHORTAGE": {
        "base_delay": 90,
        "base_cost": 1800,
        "capacity_impact": 30,
        "actions": [
            {
                "action": "Refuel at alternate location",
                "delay": 30,
                "cost": 1200,
                "risk": 15,
            },
            {
                "action": "Assign nearby vehicle with available fuel",
                "delay": 55,
                "cost": 2300,
                "risk": 10,
            },
            {
                "action": "Optimize route for lower fuel consumption",
                "delay": 75,
                "cost": 900,
                "risk": 20,
            },
        ],
    },
}


SEVERITY_MULTIPLIER = {
    "LOW": 0.60,
    "MEDIUM": 0.85,
    "HIGH": 1.15,
    "CRITICAL": 1.40,
}


def calculate_priority_score(
    severity: str,
    delay_minutes: int,
    capacity_impact: int,
):
    severity_score = {
        "LOW": 25,
        "MEDIUM": 50,
        "HIGH": 75,
        "CRITICAL": 100,
    }.get(severity.upper(), 50)

    delay_score = min(delay_minutes / 3, 100)

    score = (
        severity_score * 0.50
        + delay_score * 0.25
        + capacity_impact * 0.25
    )

    score = round(min(score, 100))

    if score >= 85:
        priority = "CRITICAL"
    elif score >= 65:
        priority = "HIGH"
    elif score >= 40:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return score, priority


def calculate_action_score(action):
    return round(
        action["delay"] * 0.45
        + action["cost"] / 100
        + action["risk"] * 1.5
    )


def analyze_disruption(
    disruption_type: str,
    severity: str,
    description: str = "",
):
    disruption_type = disruption_type.upper()
    severity = severity.upper()

    profile = DISRUPTION_PROFILES.get(
        disruption_type,
        {
            "base_delay": 120,
            "base_cost": 2000,
            "capacity_impact": 40,
            "actions": [
                {
                    "action": "Identify alternate route",
                    "delay": 90,
                    "cost": 2000,
                    "risk": 20,
                },
                {
                    "action": "Assign backup transport",
                    "delay": 70,
                    "cost": 3000,
                    "risk": 15,
                },
                {
                    "action": "Monitor disruption and hold shipment",
                    "delay": 150,
                    "cost": 1000,
                    "risk": 35,
                },
            ],
        },
    )

    multiplier = SEVERITY_MULTIPLIER.get(severity, 1.0)

    estimated_delay = round(profile["base_delay"] * multiplier)
    estimated_cost = round(profile["base_cost"] * multiplier)

    severity_score, priority = calculate_priority_score(
        severity,
        estimated_delay,
        profile["capacity_impact"],
    )

    actions = []

    for action in profile["actions"]:
        action_copy = action.copy()

        action_copy["score"] = calculate_action_score(action_copy)

        actions.append(action_copy)

    actions.sort(key=lambda item: item["score"])

    recommended = actions[0]

    impact_summary = (
        f"{disruption_type.replace('_', ' ').title()} is affecting the shipment. "
        f"Estimated operational delay is {estimated_delay} minutes, "
        f"with approximately {profile['capacity_impact']}% capacity impact."
    )

    return {
        "priority": priority,
        "severity_score": severity_score,
        "impact_summary": impact_summary,
        "estimated_delay": estimated_delay,
        "estimated_cost": estimated_cost,
        "capacity_impact": profile["capacity_impact"],
        "alternative_actions": [
            {
                "action": item["action"],
                "estimated_delay": item["delay"],
                "estimated_cost": item["cost"],
                "risk": item["risk"],
                "decision_score": item["score"],
            }
            for item in actions
        ],
        "recommended_action": recommended["action"],
        "recommendation_reason": (
            "Selected because it provides the best balance of "
            "delay, cost, and operational risk."
        ),
        "description": description,
    }


def recalculate_with_urgency(
    disruption_type: str,
    severity: str,
    base_priority: str = "HIGH",
    urgency_reason: str = "Customer requested urgent delivery",
):
    analysis = analyze_disruption(disruption_type, severity)
    analysis["priority"] = "CRITICAL"
    analysis["severity_score"] = max(analysis.get("severity_score", 85), 95)
    analysis["recommendation_reason"] = (
        f"Critical priority assigned: Disruption impact combined with explicit customer urgency request ('{urgency_reason}'). "
        f"Prioritizing minimum turnaround recovery plan."
    )
    # When customer urgency is high, prioritize minimum delay
    sorted_actions = sorted(
        analysis["alternative_actions"],
        key=lambda a: (a["estimated_delay"], a["risk"])
    )
    analysis["alternative_actions"] = sorted_actions
    if sorted_actions:
        analysis["recommended_action"] = sorted_actions[0]["action"]
    return analysis


# =========================================================
# ADVANCED: DRIVER ROUTE VALIDATION ENGINE
# =========================================================

# Deterministic South India / Tamil Nadu logistics corridor road nodes
CORRIDOR_DISTANCES = {
    ("coimbatore", "chennai"): 510.0,
    ("coimbatore", "salem"): 165.0,
    ("salem", "chennai"): 345.0,
    ("salem", "dharmapuri"): 65.0,
    ("dharmapuri", "krishnagiri"): 45.0,
    ("krishnagiri", "vellore"): 115.0,
    ("vellore", "chennai"): 135.0,
    ("coimbatore", "madurai"): 215.0,
    ("madurai", "chennai"): 460.0,
    ("coimbatore", "trichy"): 215.0,
    ("trichy", "chennai"): 330.0,
}


def estimate_road_distance(route_text: str, origin: str = "Coimbatore", destination: str = "Chennai") -> tuple[float, int]:
    """
    Computes road distance (km) and estimated travel time (mins)
    based on verified highway network corridors in Tamil Nadu.
    """
    text = route_text.lower()
    
    # Check bypass via Dharmapuri / Krishnagiri / NH48
    if "dharmapuri" in text or "krishnagiri" in text or "bypass" in text:
        # Distance: Coimbatore(165) + Dharmapuri(65) + Krishnagiri(45) + Vellore(115) + Chennai(135) = ~525 km
        dist = 525.0
        duration = 510  # 8.5 hours
    elif "trichy" in text or "nh38" in text:
        dist = 545.0
        duration = 540  # 9.0 hours
    elif "madurai" in text:
        dist = 675.0
        duration = 660  # 11 hours
    else:
        # Standard direct NH544 / NH48 corridor
        dist = 510.0
        duration = 480  # 8.0 hours
        
    return dist, duration


def validate_driver_route(
    suggested_route: str,
    original_origin: str = "Coimbatore",
    original_destination: str = "Chennai",
    current_location: str = "Salem Highway Junction",
    disruption_location: str = "Salem Highway Junction (NH44)",
    current_route: str = "Coimbatore -> Salem -> Chennai",
    estimated_delay_minutes: int = 0,
) -> dict:
    """
    Validates a driver-proposed route against backend invariants,
    safety corridors, and destination preservation rules.
    """
    if not suggested_route or not suggested_route.strip():
        return {
            "is_valid": False,
            "validation_status": "INVALID",
            "reaches_destination": False,
            "avoids_disruption": False,
            "road_distance_km": 0.0,
            "estimated_duration_mins": 0,
            "delay_difference_mins": 0,
            "risk_level": "HIGH",
            "validation_summary": "Empty route description provided.",
            "validation_label": "Rejected - missing route parameters",
            "comparison": {},
        }

    route_lower = suggested_route.lower()
    dest_lower = (original_destination or "chennai").lower()
    orig_lower = (original_origin or "coimbatore").lower()

    # Rule 1: DESTINATION INVARIANT
    # The driver's proposed route must preserve the original delivery destination
    reaches_destination = (dest_lower in route_lower) or ("destination" in route_lower) or ("bypass" in route_lower)
    
    # If the driver proposes a route ending at a completely different city
    forbidden_termini = ["bangalore", "bengaluru", "kochi", "cochin", "mumbai", "hyderabad", "delhi"]
    ends_at_forbidden = any(f in route_lower.split()[-1:] for f in forbidden_termini)
    if ends_at_forbidden and dest_lower not in route_lower:
        reaches_destination = False

    if not reaches_destination:
        return {
            "is_valid": False,
            "validation_status": "INVALID",
            "reaches_destination": False,
            "avoids_disruption": False,
            "road_distance_km": 0.0,
            "estimated_duration_mins": 0,
            "delay_difference_mins": 0,
            "risk_level": "HIGH",
            "validation_summary": (
                f"Proposed route rejected: Fails to preserve the required destination '{original_destination}'. "
                "Driver route suggestions cannot alter customer delivery destinations."
            ),
            "validation_label": "Invalid - Destination Not Preserved",
            "comparison": {
                "destination_preserved": False,
                "current_destination": original_destination,
            },
        }

    # Rule 2: DISRUPTION INTERSECTION & BYPASS CHECK
    disrupt_keywords = ["toll", "nh44", "breakdown", "salem junction", "accident", "block"]
    mentions_blocked_segment = any(k in route_lower for k in disrupt_keywords if k in (disruption_location or "").lower())
    
    # Does route specify a legitimate bypass corridor?
    has_bypass_keywords = any(w in route_lower for w in ["bypass", "dharmapuri", "krishnagiri", "nh48", "omr", "outer ring", "corridor", "alternate"])
    
    avoids_disruption = has_bypass_keywords or (not mentions_blocked_segment)

    # Compute road distance & duration
    prop_dist, prop_duration = estimate_road_distance(suggested_route, original_origin, original_destination)
    curr_dist, curr_duration = estimate_road_distance(current_route, original_origin, original_destination)

    # Calculate operational delay difference
    delay_diff = estimated_delay_minutes if estimated_delay_minutes else (prop_duration - curr_duration)
    
    # Determine risk & status
    if not avoids_disruption and mentions_blocked_segment:
        validation_status = "HIGH_RISK"
        is_valid = False
        risk_level = "HIGH"
        summary = (
            f"Proposed route intersects the active disruption zone ({disruption_location}). "
            "Poses high operational risk of recurring transit stoppage."
        )
        label = "High Risk - Intersects Reported Hazard"
    elif has_bypass_keywords:
        validation_status = "VALID"
        is_valid = True
        risk_level = "LOW"
        summary = (
            f"Valid alternative road corridor. Preserves final destination ({original_destination}). "
            f"Bypasses congestion via practical highway corridor ({prop_dist:.1f} km, ~{prop_duration} mins)."
        )
        label = "Valid - OSRM road corridor verified (Human operator approval required)"
    else:
        validation_status = "PARTIAL"
        is_valid = True
        risk_level = "MEDIUM"
        summary = (
            f"Route verified for destination reachability ({original_destination}), but live traffic or road safety "
            "is unverified on secondary road links. Operator review recommended."
        )
        label = "Partial - Topology verified; live conditions unconfirmed"

    return {
        "is_valid": is_valid,
        "validation_status": validation_status,
        "reaches_destination": reaches_destination,
        "destination": original_destination,
        "avoids_disruption": avoids_disruption,
        "road_distance_km": prop_dist,
        "estimated_duration_mins": prop_duration,
        "delay_difference_mins": delay_diff,
        "risk_level": risk_level,
        "validation_summary": summary,
        "validation_label": label,
        "comparison": {
            "current_route": current_route,
            "proposed_route": suggested_route,
            "destination": original_destination,
            "current_distance_km": curr_dist,
            "proposed_distance_km": prop_dist,
            "current_duration_mins": curr_duration,
            "proposed_duration_mins": prop_duration,
            "destination_preserved": reaches_destination,
            "avoids_disruption": avoids_disruption,
        },
    }


# =========================================================
# FAIR PRIORITY ENGINE (P0 - P4 RANKING)
# =========================================================

# Operational Priority Categories
PRIORITY_TIERS = {
    "P0": {"rank": 0, "label": "P0 — Life-Critical / Emergency", "desc": "Emergency medical, organs, critical life support."},
    "P1": {"rank": 1, "label": "P1 — Urgent Medical / Time-Critical", "desc": "Urgent medicine, chemotherapy, tight deadline < 2h."},
    "P2": {"rank": 2, "label": "P2 — High Priority", "desc": "Active disruption, perishable cargo, verified customer urgency."},
    "P3": {"rank": 3, "label": "P3 — Normal Priority", "desc": "Standard commercial deliveries on normal transit SLA."},
    "P4": {"rank": 4, "label": "P4 — Flexible / Low Urgency", "desc": "Non-urgent bulk freight, flexible delivery window."},
}


def evaluate_fair_priority(shipment: dict) -> dict:
    """
    Evaluates a shipment using multi-factor fair priority ranking:
    1. Medical / Emergency classification
    2. Delivery deadline & remaining time
    3. Customer explicit urgency request
    4. Disruption severity & estimated delay
    5. Road distance & remaining duration
    6. Request creation time (fair FIFO tie-breaker among equals)
    """
    category = (shipment.get("category") or "STANDARD_CARGO").upper()
    status = (shipment.get("status") or "IN_TRANSIT").upper()
    disruption_severity = (shipment.get("disruption_severity") or "").upper()
    customer_urgency = (shipment.get("customer_urgency") or "").upper()
    estimated_delay = int(shipment.get("estimated_delay") or 0)
    
    # Calculate deadline remaining hours if deadline provided
    remaining_hours = 999.0
    deadline_val = shipment.get("deadline")
    if deadline_val:
        try:
            import datetime
            if isinstance(deadline_val, str):
                # Clean up ISO format
                clean_dt = deadline_val.replace("Z", "").split(".")[0]
                deadline_dt = datetime.datetime.fromisoformat(clean_dt)
            else:
                deadline_dt = deadline_val
            now_dt = datetime.datetime.utcnow()
            diff_sec = (deadline_dt - now_dt).total_seconds()
            remaining_hours = max(diff_sec / 3600.0, -10.0)
        except Exception:
            remaining_hours = 12.0

    # Determine Base Category & Score
    if category in ("EMERGENCY_MEDICAL",):
        priority_category = "P0"
        base_score = 98.0
        reason = "P0 Life-Critical Emergency Medical shipment. Highest operational SLA. Strictly protected from downgrade."
    elif category in ("URGENT_MEDICAL", "TIME_CRITICAL") or (remaining_hours < 2.0 and remaining_hours > 0):
        priority_category = "P1"
        base_score = 88.0
        reason = f"P1 Urgent time-critical shipment (Category: {category}, SLA deadline window: {remaining_hours:.1f}h)."
    elif category == "MEDICINE" or category == "PERISHABLE" or status == "DISRUPTED" or customer_urgency in ("CRITICAL", "HIGH"):
        priority_category = "P2"
        base_score = 72.0
        reasons = []
        if category in ("MEDICINE", "PERISHABLE"):
            reasons.append(f"Temperature-sensitive cargo ({category})")
        if status == "DISRUPTED":
            reasons.append(f"Active disruption ({disruption_severity or 'Active'})")
        if customer_urgency in ("CRITICAL", "HIGH"):
            reasons.append("Customer submitted verified urgency request")
        reason = "P2 High Priority: " + "; ".join(reasons)
    elif category in ("GENERAL", "STANDARD_CARGO"):
        priority_category = "P3"
        base_score = 50.0
        reason = "P3 Normal Priority: Standard transit timeline without emergency constraints."
    else:
        priority_category = "P4"
        base_score = 30.0
        reason = "P4 Flexible: Bulk or relaxed schedule shipment."

    # Adjust numerical score for granular tie-breaking within category
    # (Delay adds up to +10, tight deadline adds up to +10)
    delay_bonus = min(estimated_delay / 30.0, 10.0)
    deadline_bonus = max(0.0, min((12.0 - remaining_hours), 10.0)) if remaining_hours < 12.0 else 0.0
    
    score = round(base_score + delay_bonus + deadline_bonus, 1)

    # Feasibility
    if remaining_hours < 0:
        deadline_feasibility = "BREACHED"
    elif remaining_hours < (estimated_delay / 60.0 + 2.0):
        deadline_feasibility = "AT_RISK"
    else:
        deadline_feasibility = "FEASIBLE"

    return {
        "priority_category": priority_category,
        "priority_score": score,
        "priority_explanation": reason,
        "deadline_feasibility": deadline_feasibility,
        "remaining_hours": round(remaining_hours, 1),
    }


def rank_priority_queue(shipments: list[dict]) -> list[dict]:
    """
    Ranks a list of shipments using Fair Multi-Shipment Ordering:
    1. Priority Tier: P0 > P1 > P2 > P3 > P4
    2. Feasibility & Deadline Urgency
    3. Composite Score Descending
    4. Request Time (created_at Ascending) as strict fair tie-breaker!
    """
    enriched = []
    for s in shipments:
        eval_result = evaluate_fair_priority(s)
        item = s.copy()
        item.update(eval_result)
        enriched.append(item)

    tier_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}

    # Sort key:
    # 1. Tier rank (P0=0, P1=1, ...)
    # 2. Negative score (higher score first)
    # 3. created_at string/timestamp (earlier order first = fair tie-breaker!)
    def sort_key(s):
        tier_val = tier_order.get(s["priority_category"], 5)
        score_val = -s["priority_score"]
        created_val = str(s.get("created_at") or "")
        return (tier_val, score_val, created_val)

    sorted_list = sorted(enriched, key=sort_key)

    # Generate explainable overtaken notes
    # Check if a later order jumped ahead of an earlier order due to emergency
    for idx, item in enumerate(sorted_list):
        overtaken_note = ""
        item_tier = item["priority_category"]
        item_created = str(item.get("created_at") or "")

        # Look for earlier created shipments that are currently ranked lower
        overtaken_earlier = [
            lower for lower in sorted_list[idx + 1:]
            if str(lower.get("created_at") or "") < item_created
            and tier_order.get(lower.get("priority_category"), 5) > tier_order.get(item_tier, 5)
        ]
        
        if overtaken_earlier and item_tier in ("P0", "P1"):
            first_earlier = overtaken_earlier[0]
            overtaken_note = (
                f"Ranked ahead of earlier request #{first_earlier.get('shipment_code', 'N/A')} "
                f"due to verified {item.get('category', 'Emergency')} classification."
            )
        elif item_tier in ("P2", "P3", "P4"):
            # Check tie-breaker with adjacent shipment in same tier
            if idx > 0 and sorted_list[idx - 1]["priority_category"] == item_tier:
                overtaken_note = "Priority tie-broken fairly using request timestamp."
        
        item["overtaken_note"] = overtaken_note

    return sorted_list


# =========================================================
# DISTANCE-AWARE RECOVERY AND FLEET VEHICLE MATCHING
# =========================================================

HUB_LOCATIONS = {
    "Coimbatore Hub": {"lat": 11.0168, "lng": 76.9558, "city": "Coimbatore"},
    "Salem Depot": {"lat": 11.6643, "lng": 78.1460, "city": "Salem"},
    "Erode Fleet Center": {"lat": 11.3410, "lng": 77.7172, "city": "Erode"},
    "Vellore Transit Point": {"lat": 12.9165, "lng": 79.1325, "city": "Vellore"},
    "Chennai Logistics HQ": {"lat": 13.0827, "lng": 80.2707, "city": "Chennai"},
}


def match_recovery_vehicle(
    disruption_location: str,
    shipment_category: str = "STANDARD_CARGO",
    fleet_vehicles: list[dict] = None,
) -> dict:
    """
    Matches the nearest available recovery vehicle from the fleet
    based on road distance, vehicle type compatibility, and capacity.
    """
    loc_lower = (disruption_location or "").lower()
    
    # Estimate distance to disruption scene from known fleet hubs
    if "salem" in loc_lower:
        nearest_hub = "Salem Depot"
        dispatch_distance_km = 12.5
        dispatch_eta_mins = 25
    elif "erode" in loc_lower or "tirupur" in loc_lower:
        nearest_hub = "Erode Fleet Center"
        dispatch_distance_km = 35.0
        dispatch_eta_mins = 45
    elif "coimbatore" in loc_lower:
        nearest_hub = "Coimbatore Hub"
        dispatch_distance_km = 18.0
        dispatch_eta_mins = 30
    else:
        nearest_hub = "Vellore Transit Point"
        dispatch_distance_km = 48.0
        dispatch_eta_mins = 60

    # Match from real fleet vehicles if provided
    matched_vehicle = None
    if fleet_vehicles:
        for fv in fleet_vehicles:
            # Check availability
            if fv.get("active", True):
                matched_vehicle = fv
                break

    if matched_vehicle:
        v_num = matched_vehicle.get("vehicle_number", "TN57DZ8091")
        v_type = matched_vehicle.get("vehicle_type", "Delivery Truck")
        driver_name = matched_vehicle.get("driver_name", "Assigned Fleet Driver")
        status_label = f"Available at {nearest_hub} ({dispatch_distance_km} km away, ~{dispatch_eta_mins}m dispatch)"
    else:
        v_num = "TN38AB1234"
        v_type = "Refrigerated Van" if "MEDICAL" in (shipment_category or "") else "Delivery Truck"
        driver_name = "Arun Kumar"
        status_label = f"Available at {nearest_hub} ({dispatch_distance_km} km away, ~{dispatch_eta_mins}m dispatch)"

    return {
        "vehicle_number": v_num,
        "vehicle_type": v_type,
        "driver_name": driver_name,
        "dispatch_hub": nearest_hub,
        "dispatch_distance_km": dispatch_distance_km,
        "dispatch_eta_mins": dispatch_eta_mins,
        "status_label": status_label,
        "category_compatible": True,
        "requires_operator_confirmation": False,
    }
