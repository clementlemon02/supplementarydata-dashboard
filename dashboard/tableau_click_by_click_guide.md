# Tableau Click-by-Click Build Guide (Beginner Friendly)

This guide is designed so your group can build the CA2 dashboard in one session even if nobody has used Tableau before.

Use these prepared data files:
- dashboard/output/room_monitoring_hourly.csv
- dashboard/output/room_monitoring_5min.csv
- dashboard/output/room_monitoring_kpi_summary.csv

Recommended: build the main dashboard with `room_monitoring_hourly.csv` first, then optionally add drill-down with `room_monitoring_5min.csv`.

## 1) Before You Start

1. Install Tableau Desktop or Tableau Public.
2. Open Tableau.
3. Keep this file open side-by-side while building.

## 2) Connect to Data (Main Source)

1. In Tableau start page, click **Microsoft Excel / Text file** depending on your version.
2. Select `dashboard/output/room_monitoring_hourly.csv`.
3. Tableau opens the **Data Source** tab.
4. Confirm there is one table loaded in the canvas.
5. Click the bottom tab **Sheet 1** to start building visuals.

## 3) Verify Data Types (Very Important)

1. On the left Data pane, find `hour_start`.
2. If icon is not Date+Time, click field type icon and set to **Date & Time**.
3. Confirm these are Dimensions: `room_name`, `room_id`, `weekday`, `month`.
4. Confirm these are Measures: `indoor_co2 [ppm]`, `air_temperature [Celsius]`, `indoor_relative_humidity [%]`, `pm2.5 [mu_g/m3]`, `total_energy_kwh`, `risk_score`, flag fields.
5. Right-click `is_weekend` and ensure type is **Boolean**.

## 4) Create Calculated Fields

Create all calculations now so every sheet is easier later.

1. In Data pane, right-click empty space and click **Create Calculated Field**.
2. Create `comfort_ok`:

```
IF [flag_temp_out_of_range] = 0
AND [flag_humidity_out_of_range] = 0
THEN 1 ELSE 0 END
```

3. Create `iaq_ok`:

```
IF [flag_high_co2] = 0
AND [flag_pm25_high] = 0
THEN 1 ELSE 0 END
```

4. Create `risk_band`:

```
IF [risk_score] >= 2 THEN "High"
ELSEIF [risk_score] >= 1 THEN "Medium"
ELSE "Low"
END
```

5. Create `comfort_compliance_pct`:

```
AVG([comfort_ok])
```

6. Create `pm25_compliance_pct`:

```
AVG(IF [flag_pm25_high] = 0 THEN 1 ELSE 0 END)
```

7. Create `energy_wo_occ_pct`:

```
AVG([flag_energy_without_occupancy])
```

8. Right-click `comfort_compliance_pct`, `pm25_compliance_pct`, `energy_wo_occ_pct`.
9. Choose **Default Properties > Number Format > Percentage** and set 1 decimal place.

## 5) Build Sheet A: KPI Card 1 (Average CO2)

1. Create a new sheet and rename it `KPI - CO2`.
2. Drag `indoor_co2 [ppm]` to **Text** on Marks card.
3. Click Marks drop-down and choose **Text**.
4. Click **Label** on Marks card.
5. Click **Text...** and replace with:

```
Avg CO2
<AVG(indoor_co2 [ppm])> ppm
```

6. Click **Font** and make it large (around 20-28).
7. Format the value to 0 decimals.
8. Optional color rule:
- Keep static color now for simplicity.
- Later you can color by threshold using another field.

## 6) Build Sheet B: KPI Card 2 (Comfort Compliance)

1. Duplicate sheet `KPI - CO2`.
2. Rename to `KPI - Comfort`.
3. Replace measure on Text with `comfort_compliance_pct`.
4. Edit label text to:

```
Comfort Compliance
<AVG(comfort_compliance_pct)>
```

5. Keep Percentage format.

## 7) Build Sheet C: KPI Card 3 (PM2.5 Compliance)

1. Duplicate `KPI - Comfort`.
2. Rename to `KPI - PM2.5`.
3. Replace measure with `pm25_compliance_pct`.
4. Label text:

```
PM2.5 Compliance
<AVG(pm25_compliance_pct)>
```

## 8) Build Sheet D: KPI Card 4 (Energy Without Occupancy)

1. Duplicate `KPI - PM2.5`.
2. Rename to `KPI - Energy Waste`.
3. Replace measure with `energy_wo_occ_pct`.
4. Label text:

```
Energy Without Occupancy
<AVG(energy_wo_occ_pct)>
```

## 9) Build Sheet E: Room Risk Ranking

1. New sheet, rename `Room Risk Ranking`.
2. Drag `room_name` to **Rows**.
3. Drag `risk_score` to **Columns**.
4. Ensure aggregation is AVG.
5. Click **Sort Descending**.
6. On Marks card choose **Bar**.
7. Drag `risk_score` to **Color**.
8. Drag `risk_score` to **Label**.
9. Format labels to 2 decimals.
10. Edit title to `Room Priority by Risk Score`.

## 10) Build Sheet F: Time Trend (CO2)

1. New sheet, rename `Trend - CO2`.
2. Drag `hour_start` to **Columns**.
3. Right-click `hour_start` pill and choose **Exact Date**.
4. Right-click again and choose **Continuous** (green pill).
5. Drag `indoor_co2 [ppm]` to **Rows**.
6. Drag `room_name` to **Color**.
7. Marks type should be **Line**.
8. Add reference line:
- Right-click Y-axis and select **Add Reference Line**.
- Scope: Entire Table.
- Value: Constant = 1000.
- Label: `CO2 threshold 1000 ppm`.

## 11) Build Sheet G: Time Trend (Risk Score)

1. Duplicate `Trend - CO2`.
2. Rename `Trend - Risk`.
3. Replace measure in Rows from `indoor_co2 [ppm]` to `risk_score`.
4. Keep lines by `room_name`.

## 12) Build Sheet H: Alert Heatmap

1. New sheet, rename `Alert Heatmap`.
2. Drag `weekday` to **Rows**.
3. Drag `hour` to **Columns**.
4. Drag `risk_score` to **Color**.
5. Marks type: **Square**.
6. Drag `risk_score` to **Label** (optional).
7. Sort weekday manually:
- Right-click `weekday` > Sort > Manual.
- Arrange Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
8. Increase square size using Marks **Size** slider.

## 13) Build Sheet I: Action Panel (Flag Frequency)

You cannot pivot fields directly on shelf easily for beginners, so create five mini-bars in one sheet using Measure Names.

1. New sheet, rename `Action Panel`.
2. Drag `Measure Names` to **Rows**.
3. Drag `Measure Values` to **Columns**.
4. On left filter card for Measure Names, keep only:
- `flag_high_co2`
- `flag_temp_out_of_range`
- `flag_humidity_out_of_range`
- `flag_pm25_high`
- `flag_energy_without_occupancy`
5. Set aggregation for Measure Values to SUM.
6. Sort descending by SUM.
7. Rename title to `Most Frequent Alert Types`.

## 14) Build the Dashboard Canvas

1. Click **New Dashboard** (bottom tab with grid icon).
2. Rename dashboard: `Building Health Monitor (Non-Expert)`.
3. Set size:
- Left panel **Size** > Fixed size.
- Use 1366 x 768.

4. Drag a **Horizontal container** to top area.
5. Drop sheets in this order:
- `KPI - CO2`
- `KPI - Comfort`
- `KPI - PM2.5`
- `KPI - Energy Waste`

6. Drag another **Horizontal container** below KPIs.
7. Place:
- Left: `Room Risk Ranking`
- Right: `Action Panel`

8. Drag another **Horizontal container** at bottom.
9. Place:
- Left: `Trend - CO2` (or `Trend - Risk`)
- Right: `Alert Heatmap`

## 15) Add Global Filters (Critical)

1. On `Trend - CO2`, click drop-down (top right of sheet in dashboard).
2. Choose **Filters** and show:
- `room_name`
- `date`
- `is_weekend`

3. For each filter card, click card drop-down > **Apply to Worksheets > All Using This Data Source**.
4. Move filter cards to top-right of dashboard.

## 16) Make the Dashboard Non-Expert Friendly

1. Add a **Text** object at top:
- `Green = Normal, Amber = Watch, Red = Action Needed`.
2. Rename chart titles in plain language:
- `Room Priority` instead of `AVG(risk_score) by room`.
- `Air Quality Trend` instead of technical names only.
3. Edit tooltips:
- Add one line: `What to do: Check ventilation / setpoint / scheduling`.
4. Keep units in axis names and labels.

## 17) Optional: Add Detailed Drill-down (5-Min Data)

1. Add second data source from `dashboard/output/room_monitoring_5min.csv`.
2. Create one sheet `Detail - 5min`:
- Columns: `timestamp_local`.
- Rows: `indoor_co2 [ppm]`.
- Color: `room_name`.
- Filter: date and room.
3. Add this sheet to a second dashboard tab called `Operations Drilldown`.

## 18) Final QA Checklist Before Presentation

1. Change date filter to a known busy day and check charts update.
2. Select each room and verify ranking, trend, and heatmap all respond.
3. Verify KPI cards change when filters change.
4. Ensure no axis says `Null` or blank.
5. Check typography size on projector.
6. Export one screenshot for report appendix.

## 19) Export for Submission

1. Save workbook as `.twb` or `.twbx`.
2. Export dashboard image:
- Dashboard > Export Image.
3. Export PDF if needed:
- File > Print to PDF.

## 20) Common Beginner Problems and Fixes

1. Problem: Date appears as text.
- Fix: set `hour_start` type to Date & Time.

2. Problem: Filter only affects one chart.
- Fix: filter card > Apply to Worksheets > All Using This Data Source.

3. Problem: Bars are stacked weirdly in Action Panel.
- Fix: keep only the five flag measures in Measure Names filter.

4. Problem: Heatmap weekdays alphabetical.
- Fix: manual sort Monday to Sunday.

5. Problem: KPI percentages show 0.56 instead of 56%.
- Fix: default number format to Percentage.

## 21) Team Build Split (Fastest Way)

1. Person A builds all KPI sheets.
2. Person B builds risk ranking + action panel.
3. Person C builds trend + heatmap.
4. Person D assembles dashboard and filters.
5. Person E does QA + visual polish + export.

If you follow this exactly, your team can usually finish a clean version in 60 to 90 minutes.