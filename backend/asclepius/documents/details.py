"""Validated, type-specific document details, independent of clinical records."""

import json
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DetailModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReferralDetails(DetailModel):
    target_specialty: str | None = Field(default=None, max_length=200)
    recipient: str | None = Field(default=None, max_length=500)
    requested_service: str | None = Field(default=None, max_length=5000)
    clinical_question: str | None = Field(default=None, max_length=5000)
    indication: str | None = Field(default=None, max_length=5000)
    urgency: str | None = Field(default=None, max_length=500)


class MedicalOrderDetails(DetailModel):
    order_kind: (
        Literal[
            "therapeutic_service",
            "medical_aid",
            "nursing_care",
            "transport",
            "hospital_admission",
            "other",
            "unknown",
        ]
        | None
    ) = None
    service: str | None = Field(default=None, max_length=5000)
    indication: str | None = Field(default=None, max_length=5000)
    quantity: str | None = Field(default=None, max_length=200)
    frequency: str | None = Field(default=None, max_length=500)
    valid_from: date | None = None
    valid_until: date | None = None
    instructions: str | None = Field(default=None, max_length=5000)


class ExaminationDetails(DetailModel):
    examination: str | None = Field(default=None, max_length=500)
    body_region: str | None = Field(default=None, max_length=500)
    method: str | None = Field(default=None, max_length=50000)
    findings: str | None = Field(default=None, max_length=200000)
    assessment: str | None = Field(default=None, max_length=100000)
    recommendations: str | None = Field(default=None, max_length=100000)


class InsuranceDetails(DetailModel):
    insurer: str | None = Field(default=None, max_length=500)
    reference_number: str | None = Field(default=None, max_length=500)
    subject: str | None = Field(default=None, max_length=5000)
    decision: (
        Literal[
            "approved",
            "partially_approved",
            "denied",
            "pending",
            "unknown",
        ]
        | None
    ) = None
    coverage: str | None = Field(default=None, max_length=5000)
    valid_from: date | None = None
    valid_until: date | None = None
    conditions: str | None = Field(default=None, max_length=5000)


class DocumentDetails(DetailModel):
    # Separate namespaces preserve details from different sections of mixed PDFs.
    referral: ReferralDetails | None = None
    medical_order: MedicalOrderDetails | None = None
    examination_report: ExaminationDetails | None = None
    insurance_document: InsuranceDetails | None = None


ADMINISTRATIVE_DOC_TYPES = {"referral", "medical_order", "insurance_document"}


def parse_document_details(value) -> dict:
    """Decode stored details without making older rows unreadable."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def sanitize_document_details(value) -> dict:
    """Validate LLM details per field so one bad date cannot discard findings."""
    from pydantic import ValidationError

    result = {}
    models = {
        "referral": ReferralDetails,
        "medical_order": MedicalOrderDetails,
        "examination_report": ExaminationDetails,
        "insurance_document": InsuranceDetails,
    }
    for kind, data in parse_document_details(value).items():
        model = models.get(kind)
        if model is None or not isinstance(data, dict):
            continue
        clean = {}
        for field, val in data.items():
            if field not in model.model_fields:
                continue
            try:
                clean.update(
                    model.model_validate({field: val}).model_dump(
                        mode="json",
                        exclude_unset=True,
                    )
                )
            except ValidationError:
                continue
        if clean:
            result[kind] = clean
    return result
