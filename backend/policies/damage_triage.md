# Damage Triage SOP (Demo)

## low-confidence
If the model confidence is low, route the case to human review.  
Rationale: avoid automation on uncertain predictions.

**Action:** HUMAN_REVIEW  
**Next steps:** request better photos / additional angles; verify vehicle ID and context.

---

## minor-scratch
Minor scratch with high confidence can be auto-approved for standard processing.

**Action:** AUTO_APPROVE  
**Next steps:** create repair ticket; estimate based on standard scratch policy; notify customer.

---

## minor-scratch-review
Minor scratches may be excluded from coverage per ICICI Lombard policy.  
High-confidence minor scratch detection requires policy wording verification.

**Action:** HUMAN_REVIEW  
**Next steps:** verify exact product wording and endorsements; confirm if minor scratch exclusion applies; check for applicable endorsements; request additional photos if needed.

---

## moderate-damage
Moderate damage should be reviewed by an operator before approval.

**Action:** HUMAN_REVIEW  
**Next steps:** verify severity; check affected area; confirm if replacement is required.

---

## severe-damage
Severe damage must be escalated for specialist assessment.

**Action:** ESCALATE  
**Next steps:** assign to senior assessor; request additional documentation; safety check if needed.

---

## crack-damage
Crack damage requires structural assessment. Even minor cracks can indicate structural compromise.

**Action:** HUMAN_REVIEW  
**Next steps:** request additional angles; check for structural impact; verify repair vs replace decision.

---

## glass-shatter
Glass shatter requires immediate safety assessment. Risk of injury from broken glass.

**Action:** HUMAN_REVIEW  
**Next steps:** verify safety risk; check for occupant injury; confirm glass type (tempered/laminated); request professional glass assessment.

---

## lamp-broken
Broken lamp requires electrical safety verification. Risk of short circuit or fire.

**Action:** HUMAN_REVIEW  
**Next steps:** verify electrical system integrity; check for wiring damage; confirm lamp type (LED/HID/halogen); request professional electrical assessment.

---

## tire-flat
Tire damage requires roadworthiness assessment. Risk of blowout or loss of control.

**Action:** HUMAN_REVIEW  
**Next steps:** verify tire sidewall integrity; check for rim damage; confirm tire age and tread depth; request professional tire assessment.
