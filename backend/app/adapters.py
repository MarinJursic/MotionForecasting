from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Mapping
from typing import Any

from pydantic import ValidationError

from .schemas import Actor, MapFeature, Scenario


class AdapterInputError(ValueError):
    """Raised when an adapter receives a malformed normalized record."""


def _scenario_from_mapping(source: Mapping[str, Any], *, provider: str) -> Scenario:
    """Validate a provider-neutral export into the shared scenario contract.

    Production integrations can decode Waymo protos or CARLA snapshots into this
    small mapping first. Keeping decoding outside the forecasting core prevents
    optional heavyweight dependencies from leaking into the default demo.
    """

    try:
        actors = [Actor.model_validate(actor) for actor in source["actors"]]
        map_features = [
            MapFeature.model_validate(feature) for feature in source["map_features"]
        ]
        return Scenario(
            id=str(source["id"]),
            title=str(source["title"]),
            sample_hz=int(source.get("sample_hz", 10)),
            coordinate_frame="ENU",
            actors=actors,
            map_features=map_features,
            story_note=f"Normalized from {provider}; source data is not redistributed.",
        )
    except (KeyError, TypeError, ValueError, ValidationError) as error:
        raise AdapterInputError(f"Invalid {provider} normalized scenario: {error}") from error


class ScenarioAdapter(ABC):
    """Boundary for dataset/simulator-specific parsers."""

    @abstractmethod
    def load(self, source: Any) -> Iterable[Scenario]:
        raise NotImplementedError


class WaymoMotionAdapter(ScenarioAdapter):
    """Seam for TFRecord or Scenario proto ingestion.

    Install Waymo's separately distributed dependency and map official Scenario
    protos here. The default demo never imports or redistributes dataset content.
    """

    def load(self, source: Any) -> Iterable[Scenario]:
        if not isinstance(source, Mapping):
            raise AdapterInputError(
                "Waymo adapter expects a normalized mapping. Decode the licensed "
                "Scenario proto before crossing this dependency-free boundary."
            )
        return [_scenario_from_mapping(source, provider="Waymo")]


class CarlaAdapter(ScenarioAdapter):
    """Seam for CARLA snapshots using the same ENU telemetry contract."""

    def load(self, source: Any) -> Iterable[Scenario]:
        if not isinstance(source, Mapping):
            raise AdapterInputError(
                "CARLA adapter expects a normalized mapping produced from a simulator snapshot."
            )
        return [_scenario_from_mapping(source, provider="CARLA")]


def builtin_scenario() -> Scenario:
    return Scenario(
        id="sf-market-0142",
        title="Occluded crosswalk emergence",
        sample_hz=10,
        coordinate_frame="ENU",
        map_features=[
            MapFeature(id="lane-nb", kind="lane", points=[(-5.2, -42), (-5.2, 42)]),
            MapFeature(id="crosswalk-n", kind="crosswalk", points=[(-9, 14), (9, 14)]),
            MapFeature(id="road-edge-e", kind="road_boundary", points=[(10, -42), (10, 42)]),
            MapFeature(id="stop-nb", kind="stop_line", points=[(-10, 9), (0, 9)]),
            MapFeature(id="signal-n", kind="traffic_light", points=[(-9, 10)], state="green"),
            MapFeature(id="van-shadow", kind="occlusion", points=[(2, 9), (13, 5), (13, 19)]),
        ],
        story_note="Synthetic, dataset-free scenario inspired by dense urban interactions.",
        actors=[
            Actor(id="ego-01", kind="ego", position=(-5.2, -12), velocity=(0, 9.8), extent=(2.15, 4.3), visible_fraction=1),
            Actor(id="veh-27", kind="vehicle", position=(-14, -5), velocity=(7.1, 0), extent=(2, 4.1), visible_fraction=0.96),
            Actor(id="ped-04", kind="pedestrian", position=(3.2, 14), velocity=(-1.4, 0), extent=(0.6, 0.6), visible_fraction=0.31),
            Actor(id="cyc-09", kind="cyclist", position=(5.4, 18), velocity=(0, -4.2), extent=(0.8, 1.8), visible_fraction=0.83),
        ],
    )
