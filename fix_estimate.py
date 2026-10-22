import re

with open('backend/main.py', 'r') as f:
    content = f.read()

new_func = '''def estimate_costs(detections_by_view: Dict[str, Any]) -> tuple[int, int, str, str, str]:
    """Estimate repair costs based on detections. Returns (min_cost, max_cost, severity, primary_component, summary)."""
    all_detections = []
    for view_data in detections_by_view.values():
        all_detections.extend(view_data.get("detections", []))

    if not all_detections:
        return 0, 0, "uncertain", "Unable to determine", "No supported damage classes detected in the submitted images."

    # Normalize damage types (model returns "glass shatter" -> "glass_shatter")
    for d in all_detections:
        d["damage_type"] = normalize_damage_type(d["damage_type"])

    # FILTER: Only keep valid damage classes for insurance assessment
    valid_detections = [d for d in all_detections if is_valid_damage_class(d["damage_type"])]
    
    if not valid_detections:
        return 0, 0, "uncertain", "Unable to determine", "No valid damage classes detected in the submitted images."

    # Determine severity based on highest confidence detection and count
    max_conf = max(d["confidence"] for d in valid_detections)
    total_valid_count = len(valid_detections)

    # Get most common damage type from VALID detections only
    from collections import Counter
    damage_types = [d["damage_type"] for d in valid_detections]
    primary_damage = Counter(damage_types).most_common(1)[0][0]

    # Map to severity - use area percentage if available, otherwise confidence
    has_area = any("area_percentage" in d for d in valid_detections)
    
    if has_area:
        max_area = max(d.get("area_percentage", 0) for d in valid_detections)
        if max_area >= 15:
            severity = "severe"
        elif max_area >= 5:
            severity = "moderate"
        elif max_area >= 1:
            severity = "minor"
        else:
            severity = "minor"
    else:
        if max_conf >= 0.7 and total_valid_count >= 3:
            severity = "severe"
        elif max_conf >= 0.5 and total_valid_count >= 2:
            severity = "moderate"
        elif max_conf >= 0.3:
            severity = "minor"
        else:
            severity = "uncertain"

    # Estimate cost
    cost_map = DAMAGE_COST_MAP.get(primary_damage, DAMAGE_COST_MAP["damage"])
    min_cost, max_cost = cost_map.get(severity, cost_map["minor"])

    # Adjust for multiple UNIQUE damage types (not total detections)
    unique_damage_types = set(damage_types)
    unique_count = len(unique_damage_types)
    
    if unique_count > 1:
        # Each additional unique damage type adds 30% to cost
        min_cost = int(min_cost * (1 + 0.3 * (unique_count - 1)))
        max_cost = int(max_cost * (1 + 0.3 * (unique_count - 1)))
    elif total_valid_count > 1:
        # Multiple detections of same type: smaller multiplier (10% per additional)
        min_cost = int(min_cost * (1 + 0.1 * (total_valid_count - 1)))
        max_cost = int(max_cost * (1 + 0.1 * (total_valid_count - 1)))

    # Component mapping
    component_map = {
        "dent": "Body Panel",
        "scratch": "Body Panel",
        "crack": "Bumper/Fender",
        "glass_shatter": "Windshield/Window",
        "lamp_broken": "Headlight/Taillight",
        "tire_flat": "Tire/Wheel",
        "damage": "Vehicle Component",
    }
    primary_component = component_map.get(primary_damage, "Vehicle Component")

    # Summary
    unique_types = list(set(damage_types))
    summary = f"Detected {total_valid_count} valid damage instance(s): {', '.join(unique_types)}. Primary: {primary_damage} ({severity})."

    return min_cost, max_cost, severity, primary_component, summary'''

# Use DOTALL flag to match across newlines
new_content = re.sub(
    r'def estimate_costs\(detections_by_view: Dict\[str, Any\]\) -> tuple\[int, int, str, str, str\]:.*?return min_cost, max_cost, severity, primary_component, summary',
    new_func,
    content,
    flags=re.DOTALL
)

if new_content != content:
    with open('backend/main.py', 'w') as f:
        f.write(new_content)
    print('Successfully replaced estimate_costs function')
else:
    print('No replacement made')