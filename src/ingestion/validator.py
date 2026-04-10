from dataclasses import fields
from .types import Dataset, ValidationReport, QualityFlag

_SOURCES = ("drone", "weather", "hazard", "site", "economic")


def validate_dataset(d: Dataset) -> ValidationReport:
    missing_sources = [s for s in _SOURCES if getattr(d, s) is None]
    completeness = (len(_SOURCES) - len(missing_sources)) / len(_SOURCES)

    flags = []
    none_fields = []

    for source_name in _SOURCES:
        source = getattr(d, source_name)
        if source is None:
            flags.append(QualityFlag.MISSING)
            continue
        if source.quality_flag != QualityFlag.OK:
            flags.append(source.quality_flag)
        for f in fields(source):
            if f.name == "quality_flag":
                continue
            if getattr(source, f.name) is None:
                none_fields.append(f"{source_name}.{f.name}")

    passed = completeness >= 0.8 and QualityFlag.MISSING not in flags

    return ValidationReport(
        completeness=completeness,
        flags=flags,
        missing_sources=missing_sources,
        none_fields=none_fields,
        passed=passed,
    )
