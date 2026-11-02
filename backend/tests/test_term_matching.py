"""Matcher behavior with invented terms, never clinical case reports."""

import json
from pathlib import Path

import pytest

from asclepius.normalization.matching import Candidate, TermMatcher, text_key

LONG_TERM = "synthetischer Alphabegriff mit mehreren umfangreichen zusaetzlichen Bezeichnungen"


@pytest.mark.parametrize(
    "source,alias",
    [
        ("TARQXALANGE D", "QX"),
        ("ALPHABETASYSTEM", "BE"),
        ("Zetafunktiom", "FU"),
        ("Betaobjekt mit Gammafaktor", LONG_TERM),
        ("Langer synthetischer Platzhalter links", "Faux du point"),
        ("Marker X1", "Marker X12"),
        ("Freier T3 Marker", "Freier T4 Marker"),
        ("Anti-Qrs", "Anti-Qrt"),
        ("AntiQrs", "AntiQrt"),
        ("hypozetafunktion", "hyperzetafunktion"),
        ("Alphaobjekt links", "Alphaobjekt rechts"),
        ("Alphaobjekt", "Alphaobjekt rechts"),
        ("Alphafluss unten", "Alphafluss oben"),
        ("kein Hinweis auf Alphafunktion", "Alphafunktion"),
        ("V.a. Alphafunktion", "Alphafunktion"),
        ("Z.n. Alphafunktion", "Alphafunktion"),
        ("Alphafunktion ausgeschlossen", "Alphafunktion"),
        ("Alphafunktion ohne Zusatz", "Alphafunktion mit Zusatz"),
        ("Alphafunktion", "Alphafunktion mit Zusatz"),
        ("Alphawort Langbegriff", "Alphawort Extra Langbegriff"),
    ],
)
def test_rejects_partial_strings_missing_information_and_contradictions(source, alias):
    matcher = TermMatcher([Candidate(1, alias, alias)], allow_qualifiers=True)
    assert matcher.match(source).norm_id is None


@pytest.mark.parametrize(
    "source,alias,method",
    [
        ("QX", "QX", "exact"),
        ("  qx ", "QX", "exact"),
        ("Alphafunktiom", "Alphafunktion", "spelling"),
        ("Betaplatzhaletr", "Betaplatzhalter", "spelling"),
        ("filosophie", "Philosophie", "spelling"),
        ("Langbegriff Gamma", "Gamma-Langbegriff", "spelling"),
        ("Delta-Kennung", "Delta Kennung", "exact"),
        ("Baerenmarke", "Bärenmarke", "spelling"),
        ("Objekt Alpha mit Gammafaktor", "Objekt Alpha", "qualified"),
        ("Objekt Alpha mit Gammafaktor seit 2030", "Objekt Alpha", "qualified"),
        ("Alphafunktion ohne Zusatz", "Alphafunktion", "qualified"),
    ],
)
def test_retains_exact_spelling_and_qualified_head_matching(source, alias, method):
    matcher = TermMatcher([Candidate(1, alias, alias)], allow_qualifiers=True)
    match = matcher.match(source)
    assert match.norm_id == 1
    assert match.method == method


def test_source_qualifiers_are_not_used_for_labs_or_medication_combinations():
    matcher = TermMatcher([Candidate(1, "Marker X12", "Marker X12")])
    assert matcher.match("Marker X12 mit Zusatzfaktor").norm_id is None


def test_reviewed_aliases_can_encode_different_identifier_families():
    matcher = TermMatcher([Candidate(1, "Zetabenennung", "Marker X12")])
    assert matcher.match("Zetabenennung").norm_id == 1
    assert matcher.match("Zetabenennunh").norm_id == 1
    alternate = TermMatcher([Candidate(1, "Delta-2 Langbegriff", "Omega-19")])
    assert alternate.match("Delta-2 Langbegriff").norm_id == 1
    assert alternate.match("Delta-2 Langbegrifg").norm_id == 1


def test_canonical_identifiers_cannot_contradict_the_original():
    marker = TermMatcher([Candidate(1, "Marker X1", "Marker X12")])
    assert marker.match("Marker X1").method == "conflict"
    typed = TermMatcher([Candidate(1, "Type 1 Alphawort", "Type 2 Alphawort")])
    assert typed.match("Type 1 Alphawort").method == "conflict"


def test_ambiguity_is_between_concepts_not_synonyms_of_one_concept():
    one = TermMatcher([Candidate(1, "abcdefghijk", "term"), Candidate(1, "abcdefghijl", "term")])
    assert one.match("abcdefghijx").norm_id == 1
    two = TermMatcher([Candidate(1, "abcdefghijk", "term"), Candidate(2, "abcdefghijl", "term")])
    assert two.match("abcdefghijx").method == "ambiguous"
    exact = TermMatcher([Candidate(1, "QX", "term"), Candidate(2, "QX", "term")])
    assert exact.match("QX").method == "ambiguous"


def test_close_runner_up_below_acceptance_threshold_still_blocks_match():
    matcher = TermMatcher(
        [Candidate(1, "abcdefghijk", "term"), Candidate(2, "abcdefghijyl", "term")]
    )
    assert matcher.match("abcdefghijx").method == "ambiguous"


def test_unreviewed_literal_identities_cannot_become_spelling_references():
    matcher = TermMatcher([Candidate(1, LONG_TERM, LONG_TERM, False)], allow_qualifiers=True)
    assert matcher.match(LONG_TERM).norm_id == 1
    assert matcher.match("Betaobjekt mit Gammafaktor").norm_id is None
    matcher.add_identity(Candidate(2, "Alphafunktion", "Alphafunktion", False))
    assert matcher.match("Alphafunktion").norm_id == 2
    assert matcher.match("Alphafunktiom").norm_id is None


def test_contradictory_external_codes_block_even_reviewed_aliases():
    matcher = TermMatcher([Candidate(1, "Alphafunktion", "Alpha Concept", code="TEST.A1")])
    assert matcher.match("Alphafunktion", code="TESTA1").norm_id == 1
    assert matcher.match("Alphafunktion", code="TEST.B2").norm_id is None


def test_normalization_preserves_numbers_identifiers_and_signs():
    assert text_key("Delta-Kennung") == text_key("Delta Kennung")
    assert text_key("X1") != text_key("X12")
    assert text_key("1,25") != text_key("125")
    assert text_key("AntiQrs") != text_key("AntiQrt")
    assert text_key("A+") != text_key("A-")
    assert text_key("-5") != text_key("5")


@pytest.mark.parametrize("kind", ["diagnoses", "lab_tests", "medications", "specialties"])
def test_public_reference_catalog_with_generated_typographical_errors(kind):
    # This established public catalog is independent of user case reports.
    path = Path(__file__).resolve().parents[2] / "config" / "seeds" / f"{kind}.json"
    entries = json.loads(path.read_text(encoding="utf-8"))
    candidates = [
        Candidate(norm_id, alias["alias"], entry["canonical_display"])
        for norm_id, entry in enumerate(entries, 1)
        for alias in entry["aliases"]
        if alias.get("language") in ("de", "en")
    ]
    matcher = TermMatcher(candidates, allow_qualifiers=kind == "diagnoses")
    accepted_typos = 0
    for candidate in candidates:
        exact = matcher.match(candidate.alias)
        assert exact.method in ("exact", "ambiguous")
        assert exact.norm_id in (None, candidate.norm_id)
        if exact.method == "ambiguous":
            assert candidate.norm_id in exact.candidates
        words = text_key(candidate.alias).split()
        index = max(range(len(words)), key=lambda i: len(words[i]))
        word = words[index]
        if len(word) < 8 or any(char.isdigit() for char in word):
            continue
        middle = len(word) // 2
        if word[middle] == word[middle + 1]:
            continue
        words[index] = word[:middle] + word[middle + 1] + word[middle] + word[middle + 2 :]
        typo = " ".join(words)
        if text_key(typo) in matcher.exact:
            continue
        match = matcher.match(typo)
        assert match.norm_id in (None, candidate.norm_id)
        accepted_typos += match.norm_id == candidate.norm_id
    assert accepted_typos > 0
