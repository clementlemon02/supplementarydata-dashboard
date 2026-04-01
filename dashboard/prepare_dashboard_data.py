from __future__ import annotations

from pathlib import Path
from typing import Tuple

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "dashboard" / "output"

ROOM_LABELS = {
    "Room1": "Room 1 - Lecture",
    "Room2": "Room 2 - Lecture",
    "Room3": "Room 3 - Office",
    "Room4": "Room 4 - Office",
    "Room5": "Room 5 - Library",
}


def build_combined_dataset() -> pd.DataFrame:
    files = sorted(ROOT.glob("combined_Room*.csv"))
    frames: list[pd.DataFrame] = []

    for file_path in files:
        room_id = file_path.stem.replace("combined_", "")
        df = pd.read_csv(file_path)
        df["room_id"] = room_id
        df["room_name"] = ROOM_LABELS.get(room_id, room_id)
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    combined["timestamp"] = pd.to_datetime(combined["timestamp"], utc=True)
    combined["timestamp_local"] = combined["timestamp"].dt.tz_convert("Asia/Singapore")
    combined["date"] = combined["timestamp_local"].dt.date
    combined["hour"] = combined["timestamp_local"].dt.hour
    combined["weekday"] = combined["timestamp_local"].dt.day_name()
    combined["is_weekend"] = combined["weekday"].isin(["Saturday", "Sunday"])
    combined["month"] = combined["timestamp_local"].dt.strftime("%Y-%m")

    return combined


def add_occupancy_mode(df: pd.DataFrame) -> pd.DataFrame:
    if "occupant_presence [binary]" in df.columns:
        occupied = (df["occupant_presence [binary]"].fillna(0) > 0).astype(int)
    elif "occupant_count [number]" in df.columns:
        occupied = (df["occupant_count [number]"].fillna(0) > 0).astype(int)
    elif "wifi_connected_devices [number]" in df.columns:
        occupied = (df["wifi_connected_devices [number]"].fillna(0) > 0).astype(int)
    else:
        occupied = pd.Series(0, index=df.index)

    df["is_occupied"] = occupied
    df["occupancy_mode"] = df["is_occupied"].map({0: "Unoccupied", 1: "Occupied"})
    return df


def add_monitoring_flags(df: pd.DataFrame) -> pd.DataFrame:
    # Comfort and IAQ thresholds are simple, explainable rules for non-expert users.
    df["flag_high_co2"] = (df["indoor_co2 [ppm]"] > 1000).astype(int)
    df["flag_temp_out_of_range"] = (
        (df["air_temperature [Celsius]"] < 24) | (df["air_temperature [Celsius]"] > 27)
    ).astype(int)
    df["flag_humidity_out_of_range"] = (
        (df["indoor_relative_humidity [%]"] < 40)
        | (df["indoor_relative_humidity [%]"] > 70)
    ).astype(int)
    df["flag_pm25_high"] = (df["pm2.5 [mu_g/m3]"] > 12).astype(int)

    energy_columns = [
        column
        for column in [
            "ceiling_fan_energy [kWh]",
            "lighting_energy [kWh]",
            "plug_load_energy [kWh]",
            "chilled_water_energy [kWh]",
            "fcu_fan_energy [kWh]",
            "ahu_fan_energy [kWh]",
        ]
        if column in df.columns
    ]
    df["total_energy_kwh"] = df[energy_columns].fillna(0).sum(axis=1)

    df["flag_energy_without_occupancy"] = (
        (df["total_energy_kwh"] > 0.02) & (df["is_occupied"] == 0)
    ).astype(int)

    df["risk_score"] = (
        df["flag_high_co2"]
        + df["flag_temp_out_of_range"]
        + df["flag_humidity_out_of_range"]
        + df["flag_pm25_high"]
        + df["flag_energy_without_occupancy"]
    )

    return df


def build_hourly_dataset(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    hourly = df.copy()
    hourly["hour_start"] = hourly["timestamp_local"].dt.floor("h")

    numeric_columns = [
        "indoor_co2 [ppm]",
        "air_temperature [Celsius]",
        "indoor_relative_humidity [%]",
        "pm2.5 [mu_g/m3]",
        "occupant_count [number]",
        "wifi_connected_devices [number]",
        "illuminance [lux]",
        "is_occupied",
        "total_energy_kwh",
        "risk_score",
        "flag_high_co2",
        "flag_temp_out_of_range",
        "flag_humidity_out_of_range",
        "flag_pm25_high",
        "flag_energy_without_occupancy",
    ]
    numeric_columns = [column for column in numeric_columns if column in hourly.columns]

    grouped = (
        hourly.groupby(["room_id", "room_name", "hour_start"], as_index=False)[numeric_columns]
        .mean()
        .sort_values(["room_id", "hour_start"])
    )

    grouped = grouped.rename(columns={"is_occupied": "occupied_fraction"})
    grouped["is_occupied"] = (grouped["occupied_fraction"] >= 0.5).astype(int)
    grouped["occupancy_mode"] = grouped["is_occupied"].map(
        {0: "Unoccupied", 1: "Occupied"}
    )

    grouped["date"] = grouped["hour_start"].dt.date
    grouped["hour"] = grouped["hour_start"].dt.hour
    grouped["weekday"] = grouped["hour_start"].dt.day_name()
    grouped["is_weekend"] = grouped["weekday"].isin(["Saturday", "Sunday"])
    grouped["month"] = grouped["hour_start"].dt.strftime("%Y-%m")

    expected_profile = (
        grouped.groupby(["room_id", "room_name", "hour", "occupancy_mode"], as_index=False)
        .agg(
            expected_load_kwh=("total_energy_kwh", "median"),
            p10_load_kwh=("total_energy_kwh", lambda s: s.quantile(0.10)),
            p90_load_kwh=("total_energy_kwh", lambda s: s.quantile(0.90)),
        )
        .sort_values(["room_id", "occupancy_mode", "hour"])
    )

    grouped = grouped.merge(
        expected_profile,
        on=["room_id", "room_name", "hour", "occupancy_mode"],
        how="left",
    )

    grouped["load_gap_kwh"] = grouped["total_energy_kwh"] - grouped["expected_load_kwh"]
    grouped["normal_band_kwh"] = (grouped["p90_load_kwh"] - grouped["p10_load_kwh"]).clip(lower=0.05)
    grouped["flag_load_anomaly"] = (
        grouped["load_gap_kwh"].abs() > grouped["normal_band_kwh"]
    ).astype(int)

    grouped["anomaly_cause"] = grouped.apply(infer_anomaly_cause, axis=1)

    return grouped, expected_profile


def infer_anomaly_cause(row: pd.Series) -> str:
    if row.get("flag_load_anomaly", 0) == 0:
        return "Normal"

    causes: list[str] = []

    if row.get("occupancy_mode") == "Unoccupied" and row.get("flag_energy_without_occupancy", 0) >= 0.5:
        causes.append("Energy draw during unoccupied hours")
    if row.get("flag_high_co2", 0) >= 0.25:
        causes.append("High CO2 with occupancy pressure")
    if row.get("flag_temp_out_of_range", 0) >= 0.25:
        causes.append("Temperature control drift")
    if row.get("flag_humidity_out_of_range", 0) >= 0.25:
        causes.append("Humidity control drift")
    if row.get("flag_pm25_high", 0) >= 0.25:
        causes.append("Particle event or filtration issue")

    if causes:
        return "; ".join(causes)

    if row.get("load_gap_kwh", 0) > 0:
        return "Unexplained high load; check schedules and major equipment"

    return "Lower-than-expected load; verify equipment availability"


def build_baseload_summary(df: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        df.groupby(["room_id", "room_name", "occupancy_mode"], as_index=False)
        .agg(
            median_load_kwh=("total_energy_kwh", "median"),
            p10_load_kwh=("total_energy_kwh", lambda s: s.quantile(0.10)),
            p90_load_kwh=("total_energy_kwh", lambda s: s.quantile(0.90)),
        )
        .sort_values(["room_id", "occupancy_mode"])
    )

    pivot = grouped.pivot_table(
        index=["room_id", "room_name"],
        columns="occupancy_mode",
        values="median_load_kwh",
        aggfunc="first",
    ).reset_index()

    pivot.columns.name = None
    if "Unoccupied" not in pivot.columns:
        pivot["Unoccupied"] = pd.NA
    if "Occupied" not in pivot.columns:
        pivot["Occupied"] = pd.NA

    pivot = pivot.rename(
        columns={
            "Unoccupied": "baseload_kwh",
            "Occupied": "occupied_load_kwh",
        }
    )

    pivot["occupied_minus_baseload_kwh"] = pivot["occupied_load_kwh"] - pivot["baseload_kwh"]
    pivot["occupied_to_baseload_ratio"] = pivot["occupied_load_kwh"] / pivot["baseload_kwh"]

    return pivot


def build_anomaly_events(hourly: pd.DataFrame) -> pd.DataFrame:
    events = hourly.loc[hourly["flag_load_anomaly"] == 1].copy()
    columns = [
        "room_id",
        "room_name",
        "hour_start",
        "occupancy_mode",
        "total_energy_kwh",
        "expected_load_kwh",
        "load_gap_kwh",
        "normal_band_kwh",
        "risk_score",
        "anomaly_cause",
        "indoor_co2 [ppm]",
        "air_temperature [Celsius]",
        "indoor_relative_humidity [%]",
        "pm2.5 [mu_g/m3]",
    ]
    columns = [column for column in columns if column in events.columns]

    events = events[columns].sort_values(["room_id", "hour_start"])
    return events

    return grouped


def build_kpi_summary(df: pd.DataFrame) -> pd.DataFrame:
    summary = (
        df.groupby(["room_id", "room_name"], as_index=False)
        .agg(
            avg_co2_ppm=("indoor_co2 [ppm]", "mean"),
            pct_high_co2=("flag_high_co2", "mean"),
            avg_temp_c=("air_temperature [Celsius]", "mean"),
            pct_temp_out_of_range=("flag_temp_out_of_range", "mean"),
            avg_rh_pct=("indoor_relative_humidity [%]", "mean"),
            pct_rh_out_of_range=("flag_humidity_out_of_range", "mean"),
            avg_pm25=("pm2.5 [mu_g/m3]", "mean"),
            pct_pm25_high=("flag_pm25_high", "mean"),
            avg_total_energy_kwh=("total_energy_kwh", "mean"),
            pct_energy_without_occupancy=("flag_energy_without_occupancy", "mean"),
            avg_risk_score=("risk_score", "mean"),
        )
        .sort_values("avg_risk_score", ascending=False)
    )

    percent_columns = [column for column in summary.columns if column.startswith("pct_")]
    for column in percent_columns:
        summary[column] = (summary[column] * 100).round(2)

    return summary


def add_hourly_anomaly_kpis(summary: pd.DataFrame, hourly: pd.DataFrame) -> pd.DataFrame:
    anomaly_kpi = (
        hourly.groupby(["room_id", "room_name"], as_index=False)
        .agg(
            pct_load_anomaly=("flag_load_anomaly", "mean"),
            avg_expected_load_kwh=("expected_load_kwh", "mean"),
            avg_actual_load_kwh=("total_energy_kwh", "mean"),
        )
        .sort_values("pct_load_anomaly", ascending=False)
    )
    anomaly_kpi["pct_load_anomaly"] = (anomaly_kpi["pct_load_anomaly"] * 100).round(2)

    merged = summary.merge(anomaly_kpi, on=["room_id", "room_name"], how="left")
    return merged


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    combined = build_combined_dataset()
    combined = add_occupancy_mode(combined)
    combined = add_monitoring_flags(combined)
    hourly, expected_profile = build_hourly_dataset(combined)
    kpi_summary = build_kpi_summary(combined)
    kpi_summary = add_hourly_anomaly_kpis(kpi_summary, hourly)
    baseload_summary = build_baseload_summary(combined)
    anomaly_events = build_anomaly_events(hourly)

    combined.to_csv(OUTPUT_DIR / "room_monitoring_5min.csv", index=False)
    hourly.to_csv(OUTPUT_DIR / "room_monitoring_hourly.csv", index=False)
    expected_profile.to_csv(OUTPUT_DIR / "room_energy_expected_by_hour.csv", index=False)
    kpi_summary.to_csv(OUTPUT_DIR / "room_monitoring_kpi_summary.csv", index=False)
    baseload_summary.to_csv(OUTPUT_DIR / "room_energy_baseload_summary.csv", index=False)
    anomaly_events.to_csv(OUTPUT_DIR / "room_energy_anomaly_events.csv", index=False)

    print("Created dashboard datasets:")
    print("- dashboard/output/room_monitoring_5min.csv")
    print("- dashboard/output/room_monitoring_hourly.csv")
    print("- dashboard/output/room_energy_expected_by_hour.csv")
    print("- dashboard/output/room_monitoring_kpi_summary.csv")
    print("- dashboard/output/room_energy_baseload_summary.csv")
    print("- dashboard/output/room_energy_anomaly_events.csv")


if __name__ == "__main__":
    main()
