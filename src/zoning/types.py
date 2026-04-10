from dataclasses import dataclass


@dataclass
class FeatureVector:
    canopy: float
    bare_soil: float
    slope: float
    aspect: float
    drainage: float
    shade: float
    uv: float
    bushfire: float
    flood: float
    drought: float
    proximity: float


@dataclass
class Zone:
    zone_id: str
    area_ha: float
    feature_vector: FeatureVector
