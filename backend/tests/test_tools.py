"""Tool tests, with the arithmetic evaluator's security properties front and centre."""

import pytest

from app.agent.tools import (
    MAX_EXPRESSION_CHARS,
    UnsafeExpressionError,
    current_turn,
    safe_eval,
    turn_context,
)

# ------------------------------------------------------- safe_eval: security


@pytest.mark.parametrize(
    "expression",
    [
        # The headline attacks.
        '__import__("os").system("id")',
        "__import__('os')",
        "().__class__.__bases__[0].__subclasses__()",
        "(1).__class__",
        "open('/etc/passwd').read()",
        "eval('1+1')",
        "exec('x=1')",
        # Attribute access in any form.
        "x.y",
        "(2).real",
        "'abc'.upper()",
        # Names, lookups and indexing.
        "os",
        "print",
        "[1,2,3][0]",
        "{'a':1}['a']",
        # Constructs that could hide a call.
        "lambda: 1",
        "[i for i in range(10)]",
        "(x := 5)",
        # Not numbers.
        "'a' + 'b'",
        "True + 1",
    ],
)
def test_dangerous_expressions_are_rejected(expression: str) -> None:
    """Whitelist, not blacklist: anything not explicitly allowed must not evaluate."""
    with pytest.raises(UnsafeExpressionError):
        safe_eval(expression)


def test_import_is_rejected_specifically() -> None:
    """Called out separately because it is the attack everyone tries first."""
    with pytest.raises(UnsafeExpressionError):
        safe_eval('__import__("os").system("echo pwned")')


def test_attribute_access_is_rejected_specifically() -> None:
    with pytest.raises(UnsafeExpressionError):
        safe_eval("().__class__.__mro__")


def test_no_side_effect_escapes(tmp_path) -> None:
    """Belt and braces: a rejected expression must not have done anything first."""
    target = tmp_path / "pwned.txt"
    with pytest.raises(UnsafeExpressionError):
        safe_eval(f"open({str(target)!r}, 'w').write('x')")
    assert not target.exists()


def test_overlong_expression_is_rejected() -> None:
    with pytest.raises(UnsafeExpressionError, match="longer than"):
        safe_eval("1+" * MAX_EXPRESSION_CHARS + "1")


def test_huge_exponent_is_rejected() -> None:
    """9**9**9 would hang the process; the cap stops it being a denial of service."""
    with pytest.raises(UnsafeExpressionError, match="exponent"):
        safe_eval("9**9**9")


# ------------------------------------------------------ safe_eval: arithmetic


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("2 + 2", 4),
        ("333.33 * 4", 1333.32),
        ("44.44 * 2", 88.88),
        ("round(44.44 * 2, 2)", 88.88),
        ("100 / 8", 12.5),
        ("17 // 5", 3),
        ("17 % 5", 2),
        ("2 ** 10", 1024),
        ("-5 + 3", -2),
        ("abs(-7)", 7),
        ("min(3, 9)", 3),
        ("max(3, 9)", 9),
        ("(2 + 3) * 4", 20),
    ],
)
def test_arithmetic_works(expression: str, expected: float) -> None:
    assert safe_eval(expression) == pytest.approx(expected)


def test_division_by_zero_raises_normally() -> None:
    with pytest.raises(ZeroDivisionError):
        safe_eval("1/0")


# -------------------------------------------------------------- calculate tool


def test_calculate_reports_the_result(tmp_settings) -> None:
    from app.agent.tools import calculate

    with turn_context(settings=tmp_settings):
        assert "1333.32" in calculate.invoke({"expression": "333.33 * 4"})


def test_calculate_refuses_an_attack_without_raising(tmp_settings) -> None:
    """The model gets a usable refusal string, not an exception."""
    from app.agent.tools import calculate

    with turn_context(settings=tmp_settings):
        out = calculate.invoke({"expression": '__import__("os").system("id")'})

    assert "Could not calculate" in out


# ------------------------------------------------------------- make_chart tool


def test_make_chart_rejects_ids_that_were_not_retrieved(tmp_settings) -> None:
    """Chart numbers must come from rows the agent actually looked up."""
    from app.agent.tools import make_chart

    with turn_context(settings=tmp_settings):
        out = make_chart.invoke(
            {
                "kind": "bar",
                "title": "Invented figures",
                "labels": ["2024", "2025"],
                "series_name": "Cruise calls",
                "values": [10.0, 20.0],
                "source_ids": ["kb-999"],
            }
        )

    assert "Rejected" in out
    assert "kb-999" in out


def test_make_chart_rejects_mismatched_lengths(tmp_settings) -> None:
    from app.agent.tools import make_chart

    with turn_context(settings=tmp_settings):
        out = make_chart.invoke(
            {
                "kind": "bar",
                "title": "Wrong shape",
                "labels": ["2024", "2025"],
                "series_name": "Calls",
                "values": [10.0],
                "source_ids": [],
            }
        )

    assert "Rejected" in out


# ------------------------------------------------------------- turn context


def test_tool_outside_a_turn_raises() -> None:
    """Unrecorded retrieval would mean unvalidatable citations."""
    from app.agent.tools import calculate

    with pytest.raises(RuntimeError, match="outside a turn_context"):
        calculate.invoke({"expression": "1+1"})


def test_retrieved_ids_accumulate(tmp_settings) -> None:
    from app.rag.retriever import RetrievedChunk

    with turn_context(settings=tmp_settings) as context:
        context.record_chunks([RetrievedChunk(id="kb-001", text="a", score=0.9, metadata={})])
        context.record_chunks([RetrievedChunk(id="kb-002", text="b", score=0.8, metadata={})])

        assert current_turn().retrieved_ids == {"kb-001", "kb-002"}
