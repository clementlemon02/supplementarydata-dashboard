# Tableau MCP Quickstart for This Project

This guide helps you connect Tableau MCP and then build the CA2 dashboard from prepared CSVs.

## 1) Prerequisites
- Node.js 22.7.5 or newer
- A Tableau Server or Tableau Cloud site
- Tableau personal access token (PAT): name and value
- MCP-enabled client (for example VS Code with MCP support)

## 2) MCP Server Config
Add this to your MCP client configuration (from the official Tableau MCP quick-start pattern):

```json
{
  "mcpServers": {
    "tableau": {
      "command": "npx",
      "args": ["-y", "@tableau/mcp-server@latest"],
      "env": {
        "SERVER": "https://your-tableau-server-or-cloud-url",
        "SITE_NAME": "your_site_name",
        "PAT_NAME": "your_pat_name",
        "PAT_VALUE": "your_pat_value"
      }
    }
  }
}
```

## 3) Build Data for Dashboard
Run:

```bash
/usr/bin/python3 dashboard/prepare_dashboard_data.py
```

Use:
- `dashboard/output/room_monitoring_hourly.csv` for main dashboard trends
- `dashboard/output/room_monitoring_5min.csv` for detailed drill-down

## 4) Suggested MCP Prompt Sequence
In your MCP-enabled client, use prompts similar to:

1. "Create a Tableau datasource from the CSV file room_monitoring_hourly.csv."
2. "Create a worksheet with room_name vs average risk_score as horizontal bars, sorted descending."
3. "Create a time-series worksheet with hour_start on x-axis and average indoor_co2 [ppm] on y-axis, colored by room_name, with a reference line at 1000."
4. "Create a heatmap with weekday rows and hour columns, colored by average risk_score for the selected room."
5. "Assemble these worksheets into a dashboard titled 'Building Health Monitor (Non-Expert)'."

## 5) Manual Fallback
If MCP setup is not available during submission week, follow:
- `dashboard/tableau_dashboard_blueprint.md`

The blueprint mirrors the same dashboard structure and CA2 alignment.