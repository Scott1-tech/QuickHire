"""Phone normalization used for TCPA STOP / opt-out matching."""
from app.store import norm_phone


def test_strips_formatting_characters():
    assert norm_phone("(214) 555-1000") == "2145551000"


def test_strips_leading_country_code():
    assert norm_phone("+1 214-555-1000") == "2145551000"
    assert norm_phone("12145551000") == "2145551000"


def test_empty_input():
    assert norm_phone(None) == ""
    assert norm_phone("") == ""


def test_leaves_non_eleven_digit_numbers_alone():
    assert norm_phone("2145551000") == "2145551000"  # already 10 digits
    assert norm_phone("5551000") == "5551000"          # short, not a country code
