# Tableau Click-by-Click Guide: BMS Baseload + Anomaly Dashboard

This is the detailed version of the dashboard build for your exact objective:
- evaluate building energy usage patterns,
- compare occupied vs unoccupied trendlines,
- detect anomalies,
- show likely causes from sensor data for facilities management.

Expected time: 60 to 90 minutes for first build.

## 1) Files You Will Use

Main Tableau source:
- `dashboard/output/room_monitoring_hourly.csv`

Supporting sources:
- `dashboard/output/room_energy_expected_by_hour.csv`
- `dashboard/output/room_energy_baseload_summary.csv`
- `dashboard/output/room_energy_anomaly_events.csv`

## 2) Open Tableau and Connect Data

1. Open Tableau Desktop or Tableau Public.
2. On start page, click **Text file**.
3. Select `dashboard/output/room_monitoring_hourly.csv`.
4. Click **Add** in data source pane and add:
- `room_energy_baseload_summary.csv`
- `room_energy_anomaly_events.csv`
5. Do not create joins yet. We will use separate sheets per source.

## 3) Data Type Check (Do This Before Building)

For `room_monitoring_hourly.csv` source:
1. Ensure `hour_start` is **Date & Time**.
2. Ensure `room_name`, `room_id`, `occupancy_mode`, `weekday`, `month` are **Dimensions**.
3. Ensure `total_energy_kwh`, `expected_load_kwh`, `load_gap_kwh`, `normal_band_kwh` are **Measures**.
4. Ensure `flag_load_anomaly` is numeric (0/1).

For anomaly source:
1. Ensure `hour_start` is Date & Time.
2. Ensure `anomaly_cause` is Dimension.

## 4) Create Reusable Calculated Fields (Main Source)

Create each field by right-clicking in Data pane -> **Create Calculated Field**.

1. `anomaly_abs_gap`
```
ABS([load_gap_kwh])
```

2. `is_unoccupied`
```
IF [occupancy_mode] = "Unoccupied" THEN 1 ELSE 0 END
```

3. `baseload_proxy_kwh`
```
IF [occupancy_mode] = "Unoccupied" THEN [total_energy_kwh] END
```

4. `pct_load_anomaly`
```
AVG([flag_load_anomaly])
```

5. `pct_energy_wo_occ`
```
AVG([flag_energy_without_occupancy])
```

Format `pct_load_anomaly` and `pct_energy_wo_occ` as Percentage with 1 decimal.

## 5) Build KPI Sheet 1: Building Baseload

1. New sheet -> rename `KPI - Baseload`.
2. Drag `baseload_proxy_kwh` to **Text**.
3. Set aggregation to **MEDIAN**.
4. Edit label:
```
Building Baseload
<MEDIAN(baseload_proxy_kwh)> kWh / 5-min
```
5. Set font size 22 to 28.

## 6) Build KPI Sheet 2: Occupied Load

1. Duplicate `KPI - Baseload`.
2. Rename `KPI - Occupied Load`.
3. Replace measure with `total_energy_kwh`.
4. Add filter `occupancy_mode` and keep only `Occupied`.
5. Label:
```
Occupied Median Load
<MEDIAN(total_energy_kwh)> kWh / 5-min
```

## 7) Build KPI Sheet 3: Load Anomaly Rate

1. Duplicate `KPI - Occupied Load`.
2. Rename `KPI - Anomaly Rate`.
3. Remove occupancy filter.
4. Replace measure with `pct_load_anomaly`.
5. Label:
```
Hourly Load Anomaly Rate
<AVG(pct_load_anomaly)>
```

## 8) Build KPI Sheet 4: Energy Without Occupancy

1. Duplicate `KPI - Anomaly Rate`.
2. Rename `KPI - Energy Without Occupancy`.
3. Replace measure with `pct_energy_wo_occ`.
4. Label:
```
Energy During Unoccupied Periods
<AVG(pct_energy_wo_occ)>
```

## 9) Build Sheet: Occupied vs Unoccupied Trendline

1. New sheet -> rename `Trend - Occupied vs Unoccupied`.
2. Drag `hour_start` to Columns.
3. Set date to **Exact Date** and **Continuous**.
4. Drag `total_energy_kwh` to Rows.
5. Drag `occupancy_mode` to Color.
6. Marks = Line.
7. Drag `room_name` to Filters (show filter card).
8. Add expected line overlay:
- Drag `expected_load_kwh` to Rows.
- Right-click second axis -> **Dual Axis**.
- Right-click axis -> **Synchronize Axis**.
- On Marks for expected series, set line style dashed (if available) and neutral color.

## 10) Build Sheet: Baseload Hour Profile

1. New sheet -> rename `Profile - Baseload by Hour`.
2. Drag `hour` to Columns.
3. Drag `expected_load_kwh` to Rows.
4. Drag `room_name` to Color.
5. Add filter `occupancy_mode` and keep only `Unoccupied`.
6. Marks = Line.
7. Title: `Expected Baseload by Hour (Unoccupied)`.

## 11) Build Sheet: Anomaly Timeline

Use source `room_monitoring_hourly.csv`.

1. New sheet -> rename `Anomaly Timeline`.
2. Drag `hour_start` to Columns (Exact Date, Continuous).
3. Drag `load_gap_kwh` to Rows.
4. Drag `flag_load_anomaly` to Color.
5. In color legend, set:
- 0 = light gray
- 1 = red
6. Drag `room_name` to Detail.
7. Drag `anomaly_cause` to Tooltip.
8. Drag `total_energy_kwh`, `expected_load_kwh`, `indoor_co2 [ppm]`, `air_temperature [Celsius]`, `indoor_relative_humidity [%]`, `pm2.5 [mu_g/m3]` to Tooltip.

## 12) Build Sheet: Cause Breakdown

Use source `room_energy_anomaly_events.csv` for clarity.

1. Switch data source to anomaly events source.
2. New sheet -> rename `Cause Breakdown`.
3. Drag `anomaly_cause` to Rows.
4. Drag `Number of Records` to Columns.
5. Sort descending.
6. Marks = Bar.
7. Drag `Number of Records` to Label.

## 13) Build Sheet: Room Baseload Comparison

Use source `room_energy_baseload_summary.csv`.

1. Switch to baseload summary source.
2. New sheet -> rename `Room Baseload Comparison`.
3. Drag `room_name` to Rows.
4. Drag `baseload_kwh` to Columns.
5. Duplicate axis for occupied load:
- Drag `occupied_load_kwh` to Columns next to baseload axis.
6. Use **Side-by-side bars** with Measure Names/Measure Values if needed:
- Place `Measure Names` on Color.
- Keep only `baseload_kwh` and `occupied_load_kwh`.

## 14) Assemble Dashboard

1. Click **New Dashboard**.
2. Rename dashboard: `BMS Energy Pattern Monitor`.
3. Set fixed size: 1366 x 768.

Layout recommendation:
1. Top horizontal container:
- `KPI - Baseload`
- `KPI - Occupied Load`
- `KPI - Anomaly Rate`
- `KPI - Energy Without Occupancy`

2. Middle horizontal container:
- Left: `Trend - Occupied vs Unoccupied`
- Right: `Profile - Baseload by Hour`

3. Bottom horizontal container:
- Left: `Anomaly Timeline`
- Right top: `Cause Breakdown`
- Right bottom: `Room Baseload Comparison`

## 15) Add Global Filters and Apply Everywhere

Show these filters from one sheet:
1. `room_name`
2. `date`
3. `occupancy_mode`
4. `is_weekend`

For each filter card:
1. Click filter card menu.
2. Select **Apply to Worksheets**.
3. Choose **All Using Related Data Sources**.

## 16) Make It FM-Ready (Non-Expert Actions)

Add a text box on dashboard with direct interpretation:
1. Baseload high overnight -> check standby loads and schedules.
2. Unoccupied trend rising -> investigate uncontrolled operation.
3. Frequent anomaly with temp/humidity drift -> inspect HVAC controls.
4. CO2-linked anomalies in occupied periods -> check ventilation strategy.

## 17) Visual Standards for Presentation

1. Keep normal bands in blue/gray.
2. Use red only for anomaly points.
3. Show units everywhere (`kWh / 5-min`, `ppm`, `%`).
4. Keep chart titles as plain language.

## 18) QA Checklist Before Demo

1. Pick one room and check all charts update.
2. Toggle occupancy mode and confirm trendline changes.
3. Confirm anomaly points align with cause categories.
4. Confirm baseload remains lower than occupied load in most rooms.
5. Export one dashboard image for report.

## 19) Export

1. Save workbook as `.twbx`.
2. Dashboard -> Export Image.
3. File -> Print to PDF (for appendix).

## 20) If Something Breaks

1. Missing data in sheet:
- Verify correct data source is selected for that sheet.

2. Filter does not affect some sheets:
- Use **All Using Related Data Sources**.

3. Dual-axis overlay looks wrong:
- Synchronize axes and verify both use same unit (`kWh`).

4. Too many causes in one label:
- Group similar causes in Tableau using **Create Group** on `anomaly_cause`.

5. Error AF934BE3 / SQLSTATE 42703 unknown column `is_occupied` when creating extract:
- Cause: Tableau workbook is using a stale data-source schema or old extract metadata.
- Fix steps (in order):
1. Close Tableau workbook.
2. Re-generate data files by running:
	- `/usr/bin/python3 dashboard/prepare_dashboard_data.py`
3. Re-open Tableau.
4. In Data pane, right-click the data source and choose **Extract > Remove** (if extract exists).
5. Go to **Data Source** tab and click **Refresh**.
6. If error persists, add a fresh connection to `dashboard/output/room_monitoring_hourly.csv`.
7. Use **Data > Replace Data Source...** to swap old source to the new one.
8. Delete old broken source from workbook.
- Last-resort workaround:
1. In all sheets, replace references to `is_occupied` with `occupancy_mode`.
2. Recreate extract from the refreshed data source.