"""Whole-word matching for medical terminology, independent of database I/O.

Scores are spelling similarities, not probabilities of a medical diagnosis.
Partial strings and token-set subset scores are deliberately not used.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache

from rapidfuzz.distance import DamerauLevenshtein

MIN_SCORE = 0.86
MIN_COVERAGE = 0.90
MIN_MARGIN = 0.08
MAX_FUZZY_TOKENS = 12

# These words carry no positive evidence. Negation/status is checked separately.
STOP_WORDS = frozenset(
    """
    der die das des den dem ein eine einer eines einem einen und oder mit bei
    im in am an auf von vom zum zur fuer für the of and or with at to for
    de het een met bij van en
""".split()
)
_BOUNDARIES = frozenset(("mit", "bei", "with", "met", "ohne", "without", "zonder"))
_TOKEN = re.compile(r"[^\W_]+(?:[.,]\d+)?", re.UNICODE)
_NEGATIVE = re.compile(
    r"^(?:kein\w*|ohne|ausschluss|no|not|negative|without|rule out|geen|zonder)\b"
)
_SUSPECTED = re.compile(r"^(?:v a|verdacht|suspected|suspect|possible|verdenking)\b")
_HISTORICAL = re.compile(r"^(?:z n|zustand nach|history of|status post)\b")
_SIDES = {
    "links": "left",
    "linke": "left",
    "linken": "left",
    "linker": "left",
    "linkes": "left",
    "linkem": "left",
    "left": "left",
    "rechts": "right",
    "rechte": "right",
    "rechten": "right",
    "rechter": "right",
    "rechtes": "right",
    "rechtem": "right",
    "right": "right",
    "beidseits": "bilateral",
    "beidseitig": "bilateral",
    "bilateral": "bilateral",
}
_COURSE = {
    "acute": "acute",
    "akut": "acute",
    "akute": "acute",
    "akuter": "acute",
    "chronic": "chronic",
    "chronisch": "chronic",
    "chronische": "chronic",
    "chronischer": "chronic",
}


def text_key(text: str) -> str:
    """Normalize word boundaries without discarding numbers or identifiers."""
    value = unicodedata.normalize("NFKC", text or "").casefold()
    # A+/A- and signed values must not collapse when punctuation is split.
    value = value.replace("+", " plus ")
    value = re.sub(r"(?<!\w)[-−](?=\d)", "minus ", value)
    value = re.sub(r"(?<=\w)[-−](?!\w)", " minus ", value)
    for symbol, word in (
        ("≤", "less equal"),
        ("≥", "greater equal"),
        ("<", "less"),
        (">", "greater"),
    ):
        value = value.replace(symbol, f" {word} ")
    # Keep short antibody identifiers separate, including the unhyphenated form.
    value = re.sub(r"\banti(?=[a-z])", "anti ", value)
    value = re.sub(r"\b(vitamin)([abcdek]\d*)\b", r"\1 \2", value)
    return " ".join(_TOKEN.findall(value))


@dataclass(frozen=True)
class Term:
    key: str
    words: tuple[str, ...]
    head: tuple[str, ...]
    status: str
    sides: frozenset[str]
    prefixes: frozenset[str]
    course: frozenset[str]
    numbers: tuple[str, ...]
    numbered_words: tuple[tuple[str, tuple[str, ...]], ...]
    vitamin: str | None
    qualifiers: frozenset[str]


@lru_cache(maxsize=8192)
def parse_term(text: str) -> Term:
    key = text_key(text)
    words = tuple(key.split())
    boundary = next((i for i, word in enumerate(words) if i and word in _BOUNDARIES), len(words))
    status = "positive"
    if _NEGATIVE.search(key) or re.search(r"\b(?:ausgeschlossen|ruled out)$", key):
        status = "negative"
    elif _SUSPECTED.search(key):
        status = "suspected"
    elif _HISTORICAL.search(key):
        status = "historical"
    vitamin = re.search(r"\b(?:vitamin|hypovitaminose|hypervitaminose)\s*([a-z])\d*\b", key)
    numbered_words: dict[str, list[str]] = defaultdict(list)
    for index, word in enumerate(words):
        numbers = re.findall(r"\d+(?:[.,]\d+)?", word)
        if numbers:
            family = re.sub(r"\d+(?:[.,]\d+)?", "#", word)
            if family == "#" and index:
                family = words[index - 1] + "#"
            numbered_words[family].extend(numbers)
    return Term(
        key,
        words,
        words[:boundary],
        status,
        frozenset(_SIDES[word] for word in words if word in _SIDES),
        frozenset(
            prefix
            for word in words[:boundary]
            for prefix in ("hypo", "hyper")
            if word.startswith(prefix)
        ),
        frozenset(_COURSE[word] for word in words if word in _COURSE),
        tuple(re.findall(r"\d+(?:[.,]\d+)?", key)),
        tuple((family, tuple(values)) for family, values in numbered_words.items()),
        vitamin[1] if vitamin else None,
        frozenset(
            "without" if word in ("ohne", "without", "zonder") else "with"
            for word in words[boundary:]
            if word in _BOUNDARIES
        ),
    )


def compatible(query: Term, target: Term, *, canonical: bool = False) -> bool:
    """Reject contradictions; a generic canonical name may omit qualifiers."""
    if query.status != target.status:
        return False
    for source, destination in (
        (query.sides, target.sides),
        (query.prefixes, target.prefixes),
        (query.course, target.course),
        (query.qualifiers, target.qualifiers),
    ):
        if source and destination and source != destination:
            return False
    if not canonical and target.sides and not query.sides:
        return False
    if query.vitamin and target.vitamin and query.vitamin != target.vitamin:
        return False
    if not canonical and query.numbers != target.numbers:
        return False
    if canonical:
        # A reviewed semantic alias may use different identifier families:
        # SARS-CoV-2 belongs to COVID-19. Within a shared family, however,
        # B1/B12 or Type 1/Type 2 still contradict each other.
        destination_numbers = dict(target.numbered_words)
        if any(
            family in destination_numbers and values != destination_numbers[family]
            for family, values in query.numbered_words
        ):
            return False
    return True


def _spelling_key(word: str) -> str:
    # A comparison view only: original text and exact identities remain intact.
    return word.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ph", "f")


@lru_cache(maxsize=32768)
def word_similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    if min(len(left), len(right)) < 5 or any(c.isdigit() for c in left + right):
        return 0.0
    if min(len(left), len(right)) / max(len(left), len(right)) < 0.75:
        return 0.0
    budget = 1 if min(len(left), len(right)) < 10 else 2
    distance = DamerauLevenshtein.distance(left, right, score_cutoff=budget)
    score = 1 - distance / max(len(left), len(right)) if distance <= budget else 0.0
    a, b = _spelling_key(left), _spelling_key(right)
    if (a, b) != (left, right):
        alternate = DamerauLevenshtein.distance(a, b, score_cutoff=budget)
        if alternate <= budget:
            score = max(score, 0.96 * (1 - alternate / max(len(a), len(b))))
    return score if score >= 0.82 else 0.0


@dataclass(frozen=True)
class Candidate:
    norm_id: int
    alias: str
    canonical: str
    allow_fuzzy: bool = True
    alias_id: int | None = None
    code: str | None = None


@dataclass(frozen=True)
class Match:
    norm_id: int | None
    method: str
    score: float = 0.0
    alias_id: int | None = None
    candidates: tuple[int, ...] = ()


class TermMatcher:
    def __init__(self, candidates: list[Candidate], *, allow_qualifiers: bool = False):
        self.candidates = candidates
        self.allow_qualifiers = allow_qualifiers
        self.exact: dict[str, list[int]] = defaultdict(list)
        self.by_word: dict[str, set[int]] = defaultdict(set)
        self.by_bigram: dict[str, set[str]] = defaultdict(set)
        frequency: dict[str, set[int]] = defaultdict(set)
        for index, candidate in enumerate(candidates):
            term = parse_term(candidate.alias)
            self.exact[term.key].append(index)
            if not candidate.allow_fuzzy:
                continue
            for word in set(term.words) - STOP_WORDS:
                self.by_word[word].add(index)
                frequency[word].add(candidate.norm_id)
                if len(word) >= 5:
                    for view in (word, _spelling_key(word)):
                        for position in range(len(view) - 1):
                            self.by_bigram[view[position : position + 2]].add(word)
        count = len({candidate.norm_id for candidate in candidates})
        self.weights = {
            word: 1 + math.log((count + 1) / (len(ids) + 1)) for word, ids in frequency.items()
        }

    def add_identity(self, candidate: Candidate) -> None:
        """New literal identities must never become new fuzzy candidates."""
        index = len(self.candidates)
        self.candidates.append(candidate)
        self.exact[parse_term(candidate.alias).key].append(index)

    def _eligible(self, query: Term, candidate: Candidate, code: str | None) -> bool:
        if code and candidate.code:

            def normalize_code(value: str) -> str:
                return re.sub(r"[.\s]", "", value).casefold()

            if normalize_code(code) != normalize_code(candidate.code):
                return False
        return compatible(query, parse_term(candidate.canonical), canonical=True)

    def exact_match(self, text: str, *, code: str | None = None) -> Match:
        query = parse_term(text)
        indices = self.exact.get(query.key, [])
        eligible = [
            self.candidates[i] for i in indices if self._eligible(query, self.candidates[i], code)
        ]
        ids = tuple(sorted({candidate.norm_id for candidate in eligible}))
        if len(ids) > 1:
            return Match(None, "ambiguous", candidates=ids)
        if eligible:
            return Match(ids[0], "exact", 1.0, eligible[0].alias_id)
        return Match(None, "conflict" if indices else "unmatched")

    def _score(self, source: tuple[str, ...], target: tuple[str, ...]) -> float:
        left = tuple(word for word in source if word not in STOP_WORDS)
        right = tuple(word for word in target if word not in STOP_WORDS)
        if not left or not right or max(len(left), len(right)) > MAX_FUZZY_TOKENS:
            return 0.0
        # Short tokens/identifiers must occur literally, with multiplicity.
        if Counter(word for word in left if len(word) < 5) != Counter(
            word for word in right if len(word) < 5
        ):
            return 0.0
        similarities = [[word_similarity(a, b) for b in right] for a in left]
        if not any(
            len(left[i]) >= 5 and score for i, row in enumerate(similarities) for score in row
        ):
            if len(left) < 2 or Counter(left) != Counter(right):
                return 0.0
        lw = [self.weights.get(word, 2.0) for word in left]
        rw = [self.weights.get(word, 2.0) for word in right]

        @lru_cache(maxsize=None)
        def align(index: int, mask: int) -> tuple[float, tuple[tuple[int, int], ...]]:
            if index == len(left):
                return 0.0, ()
            best, pairs = align(index + 1, mask)
            for j, similarity in enumerate(similarities[index]):
                if not similarity or mask & (1 << j):
                    continue
                tail, alignment = align(index + 1, mask | (1 << j))
                score = tail + (lw[index] + rw[j]) * similarity
                if score > best:
                    best, pairs = score, ((index, j), *alignment)
            return best, pairs

        score, pairs = align(0, 0)
        if sum(lw[i] for i, _ in pairs) / sum(lw) < MIN_COVERAGE:
            return 0.0
        if sum(rw[j] for _, j in pairs) / sum(rw) < MIN_COVERAGE:
            return 0.0
        return score / (sum(lw) + sum(rw))

    def match(self, text: str, *, code: str | None = None) -> Match:
        exact = self.exact_match(text, code=code)
        if exact.method != "unmatched":
            return exact
        query = parse_term(text)
        indices: set[int] = set()
        for word in set(query.words) - STOP_WORDS:
            indices.update(self.by_word.get(word, ()))
            if len(word) < 5:
                continue
            words: set[str] = set()
            for view in (word, _spelling_key(word)):
                for position in range(len(view) - 1):
                    words.update(self.by_bigram.get(view[position : position + 2], ()))
            for spelling in words:
                if word_similarity(word, spelling):
                    indices.update(self.by_word[spelling])
        ranked: dict[int, tuple[float, Candidate, str]] = {}
        for index in indices:
            candidate = self.candidates[index]
            if not self._eligible(query, candidate, code):
                continue
            target = parse_term(candidate.alias)
            score = self._score(query.words, target.words) if compatible(query, target) else 0.0
            method = "spelling"
            # Only diagnosis inputs may carry a tail; the reference alias must
            # be a complete, unqualified term, with a substantive head anchor.
            if (
                self.allow_qualifiers
                and query.head != query.words
                and target.head == target.words
                and any(len(word) >= 5 and word not in STOP_WORDS for word in query.head)
            ):
                head = parse_term(" ".join(query.head))
                if compatible(head, target) and compatible(query, target, canonical=True):
                    head_score = 0.98 * self._score(query.head, target.words)
                    if head_score > score:
                        score, method = head_score, "qualified"
            if score > ranked.get(candidate.norm_id, (0.0,))[0]:
                ranked[candidate.norm_id] = score, candidate, method
        results = sorted(ranked.values(), key=lambda item: (-item[0], item[1].norm_id))
        if not results:
            return Match(None, "unmatched")
        score, candidate, method = results[0]
        if score < MIN_SCORE:
            return Match(None, "unmatched", score)
        ids = tuple(result[1].norm_id for result in results)
        if len(results) > 1 and score - results[1][0] < MIN_MARGIN:
            return Match(None, "ambiguous", score, candidates=ids)
        return Match(candidate.norm_id, method, score, candidate.alias_id, ids)
