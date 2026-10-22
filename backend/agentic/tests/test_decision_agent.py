from agentic.decision_agent import DecisionAgent
from agentic.schemas import DamageSignal


def test_auto_approve_minor_scratch():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="scratch", confidence=0.92, severity="minor")
    decision = agent.decide(signal)
    assert decision.action == "AUTO_APPROVE"


def test_low_confidence_human_review():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="dent", confidence=0.40, severity="moderate")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_escalate_severe_damage():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="dent", confidence=0.80, severity="severe")
    decision = agent.decide(signal)
    assert decision.action == "ESCALATE"


def test_human_review_moderate_dent():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="dent", confidence=0.80, severity="moderate")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_human_review_crack():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="crack", confidence=0.80, severity="minor")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_human_review_glass_shatter():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="glass_shatter", confidence=0.80, severity="minor")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_human_review_lamp_broken():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="lamp_broken", confidence=0.80, severity="minor")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_human_review_tire_flat():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="tire_flat", confidence=0.80, severity="minor")
    decision = agent.decide(signal)
    assert decision.action == "HUMAN_REVIEW"


def test_no_damage_detected_human_review():
    agent = DecisionAgent(policies_dir="policies")
    signal = DamageSignal(damage_type="unknown", confidence=0.30, severity="minor")
    decision = agent.decide(signal)
    # No matching rule -> fallback to HUMAN_REVIEW
    assert decision.action == "HUMAN_REVIEW"
