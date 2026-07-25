from fastapi.testclient import TestClient

from app.adapters import AdapterInputError, CarlaAdapter, WaymoMotionAdapter, builtin_scenario
from app.main import app

client = TestClient(app)


def test_health_and_scenario() -> None:
    assert client.get("/health").json()["status"] == "ok"
    response = client.get("/api/scenarios/sf-market-0142")
    assert response.status_code == 200
    assert {actor["kind"] for actor in response.json()["actors"]} == {
        "ego",
        "vehicle",
        "pedestrian",
        "cyclist",
    }
    assert {feature["kind"] for feature in response.json()["map_features"]} == {
        "lane",
        "crosswalk",
        "road_boundary",
        "stop_line",
        "traffic_light",
        "occlusion",
    }


def test_forecast_is_deterministic_and_normalized() -> None:
    payload = {"scenario_id": "sf-market-0142", "seed": 73, "samples": 128, "obstruction": "present"}
    first = client.post("/api/forecast", json=payload)
    second = client.post("/api/forecast", json=payload)
    assert first.status_code == 200
    assert first.json() == second.json()
    for actor in first.json()["forecasts"]:
        assert abs(sum(mode["probability"] for mode in actor["modes"]) - 1) < 1e-5
        assert len(actor["modes"]) == 3
        for mode in actor["modes"]:
            assert len(mode["points"]) == 17
            assert len(mode["covariance_trace"]) == len(mode["points"])
            assert mode["covariance_trace"] == sorted(mode["covariance_trace"])
    assert first.json()["sample_count"] == 128


def test_seed_and_sample_count_drive_mode_sampling() -> None:
    base = {"scenario_id": "sf-market-0142", "samples": 64, "obstruction": "present"}
    first = client.post("/api/forecast", json={**base, "seed": 1}).json()
    second = client.post("/api/forecast", json={**base, "seed": 2}).json()
    larger = client.post("/api/forecast", json={**base, "seed": 1, "samples": 256}).json()
    assert first["forecasts"][0]["modes"] != second["forecasts"][0]["modes"]
    assert first["forecasts"][0]["modes"] != larger["forecasts"][0]["modes"]
    assert larger["sample_count"] == 256


def test_counterfactual_lowers_risk_when_obstruction_removed() -> None:
    response = client.post(
        "/api/counterfactual",
        json={"scenario_id": "sf-market-0142", "obstruction": "removed", "seed": 42},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["counterfactual"]["collision_probability"] < body["baseline"]["collision_probability"]
    assert body["counterfactual"]["visibility"] > body["baseline"]["visibility"]
    assert body["risk_delta"] == round(
        body["counterfactual"]["collision_probability"]
        - body["baseline"]["collision_probability"],
        3,
    )
    assert body["baseline_forecast"]["risk"] == body["baseline"]
    assert body["counterfactual_forecast"]["risk"] == body["counterfactual"]
    assert body["counterfactual_forecast"]["forecasts"] != body["baseline_forecast"]["forecasts"]
    assert "samples:128" in body["controlled_variables"]


def test_obstruction_interventions_rerun_risk_monotonically() -> None:
    results = {}
    for obstruction in ("present", "shifted", "removed"):
        response = client.post(
            "/api/counterfactual",
            json={"scenario_id": "sf-market-0142", "obstruction": obstruction, "seed": 42},
        )
        assert response.status_code == 200
        results[obstruction] = response.json()["counterfactual"]
    assert results["present"]["collision_probability"] > results["shifted"]["collision_probability"] > results["removed"]["collision_probability"]
    assert results["present"]["visibility"] < results["shifted"]["visibility"] < results["removed"]["visibility"]


def test_validation_and_not_found() -> None:
    invalid = client.post("/api/forecast", json={"horizon_s": 20})
    assert invalid.status_code == 422
    too_few_samples = client.post("/api/forecast", json={"samples": 4})
    assert too_few_samples.status_code == 422
    extra_field = client.post("/api/forecast", json={"unexpected": True})
    assert extra_field.status_code == 422
    missing = client.get("/api/scenarios/not-real")
    assert missing.status_code == 404
    missing_forecast = client.post("/api/forecast", json={"scenario_id": "not-real"})
    assert missing_forecast.status_code == 404
    missing_counterfactual = client.post(
        "/api/counterfactual",
        json={"scenario_id": "not-real", "obstruction": "removed"},
    )
    assert missing_counterfactual.status_code == 404


def test_metrics_are_calibrated_portfolio_fixture() -> None:
    metrics = client.get("/api/metrics").json()
    assert len(metrics) == 3
    assert metrics[0]["expected_calibration_error"] < metrics[1]["expected_calibration_error"]
    assert all(row["provenance"] == "synthetic_portfolio_fixture" for row in metrics)
    assert all(0 <= row["ood_auroc"] <= 1 for row in metrics)


def test_openapi_exposes_typed_success_and_validation_contracts() -> None:
    schema = client.get("/openapi.json").json()
    counterfactual_schema = schema["components"]["schemas"]["CounterfactualResponse"]
    assert "counterfactual_forecast" in counterfactual_schema["properties"]
    assert "baseline_forecast" in counterfactual_schema["properties"]
    assert "422" in schema["paths"]["/api/counterfactual"]["post"]["responses"]


def test_waymo_and_carla_adapter_seams_normalize_shared_contract() -> None:
    payload = builtin_scenario().model_dump()
    for adapter in (WaymoMotionAdapter(), CarlaAdapter()):
        [scenario] = list(adapter.load(payload))
        assert scenario.coordinate_frame == "ENU"
        assert scenario.actors[2].kind == "pedestrian"
        assert scenario.map_features[-1].kind == "occlusion"


def test_adapter_seams_fail_with_actionable_errors() -> None:
    for adapter in (WaymoMotionAdapter(), CarlaAdapter()):
        try:
            list(adapter.load([]))
        except AdapterInputError as error:
            assert "expects a normalized mapping" in str(error)
        else:
            raise AssertionError("adapter accepted an unsupported source")

        try:
            list(adapter.load({"id": "broken"}))
        except AdapterInputError as error:
            assert "Invalid" in str(error)
        else:
            raise AssertionError("adapter accepted an incomplete mapping")
