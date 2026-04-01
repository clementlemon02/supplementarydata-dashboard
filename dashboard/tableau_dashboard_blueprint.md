# CA2 Dashboard Blueprint (BMS Energy Pattern Monitoring)

## Goal
Design a facilities-management dashboard that answers these operational questions:
1. What is the building baseload (minimum expected load when unoccupied)?
2. How does energy trend differ between occupied and unoccupied periods?
3. Where are energy anomalies occurring, and what likely caused them based on sensor evidence?

This directly supports CA2 expectations on system monitoring, anomaly identification, and practical recommendations.

## Data Inputs (Generated)
Use these files as Tableau data sources:
- `dashboard/output/room_monitoring_hourly.csv` (main source)
- `dashboard/output/room_energy_expected_by_hour.csv` (expected load by hour and occupancy mode)
- `dashboard/output/room_energy_baseload_summary.csv` (room-level baseload summary)
- `dashboard/output/room_energy_anomaly_events.csv` (event list with probable causes)
- `dashboard/output/room_monitoring_5min.csv` (optional drill-down)

## Dashboard Structure (One Main Dashboard)

### 1) KPI Strip: Baseload and Operational Health
Top KPI cards:
- Building baseload (median unoccupied load)
- Occupied median load
- Occupied-to-baseload ratio
- Load anomaly rate (% anomalous hourly points)
- Energy-without-occupancy rate (% points)

Interpretation:
- Higher baseload than expected suggests controllable waste.
- High anomaly rate means unstable operation.

### 2) Occupied vs Unoccupied Load Trendlines
Dual trendline chart:
- X-axis: `hour_start`
- Y-axis: `total_energy_kwh`
- Color: `occupancy_mode` (Occupied / Unoccupied)
- Optional detail: split by `room_name` or filter by room

Add reference overlay:
- `expected_load_kwh` as dashed line

Purpose: show baseline drift and load lift during occupied hours.

### 3) Baseload Profile by Hour
Line chart or heatmap:
- X-axis: `hour`
- Y-axis: expected unoccupied load (`expected_load_kwh` where `occupancy_mode = Unoccupied`)
- Color by room

Purpose: identify persistent overnight/weekend loads and possible scheduling issues.

### 4) Anomaly Timeline
Event chart:
- X-axis: `hour_start`
- Y-axis: `load_gap_kwh`
- Color: anomaly severity (absolute gap)
- Shape or detail: `room_name`

Tooltip fields:
- `total_energy_kwh`
- `expected_load_kwh`
- `anomaly_cause`
- key sensors (CO2, temperature, RH, PM2.5)

Purpose: locate when anomalies happen and quickly infer why.

### 5) Cause Breakdown and Action Panel
Bar chart (count by `anomaly_cause`) plus plain-language recommendations:
- Energy draw during unoccupied hours -> review schedules, night set-back, standby controls
- Temperature/humidity drift -> inspect HVAC loop, setpoints, valve/fan behavior
- IAQ-linked events -> check ventilation and occupancy pressure

Purpose: convert analytics into FM action.

## Recommended Filters (Apply to All)
- Date range
- Room
- Occupancy mode
- Weekday/weekend

## Core Calculations in Tableau (If Rebuilt Manually)

`load_gap_kwh`
```
[total_energy_kwh] - [expected_load_kwh]
```

`anomaly_severity`
```
ABS([load_gap_kwh])
```

`is_unoccupied`
```
IF [occupancy_mode] = "Unoccupied" THEN 1 ELSE 0 END
```

`baseload_proxy`
```
IF [occupancy_mode] = "Unoccupied" THEN [total_energy_kwh] END
```

## Suggested Visual Language
- Blue tones: normal/expected load
- Orange/red: anomaly and excess load
- Gray: unoccupied context
- Plain wording in titles: "Baseload", "Unexpected Load", "Likely Cause"

## How This Maps to CA2 Rubric
- System & sensing understanding: occupancy, HVAC, IAQ, and energy are linked explicitly.
- Observations and patterns: occupied/unoccupied trendlines and hourly baseload profile.
- Interpretation and reasoning: anomaly events tied to likely causes from sensors.
- Dashboard design: actionable FM-first layout with clear operational questions.

## Tableau MCP Option (If Available)
If Tableau MCP is configured, prompt it to:
1. Load `room_monitoring_hourly.csv` and `room_energy_anomaly_events.csv`.
2. Build occupied vs unoccupied trendline and expected-load overlay.
3. Build anomaly timeline and cause breakdown.
4. Assemble dashboard titled `BMS Energy Pattern Monitor`.

If MCP is not available, use Tableau Desktop and this blueprint directly.
