import './App.css'

import { Activity, Armchair, BookOpen, Building2, CircleAlert, CircleCheckBig } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import Papa from 'papaparse'
import ReactECharts from 'echarts-for-react'
import floorplanSvg from './assets/floorplan.svg'

type BaseloadRow = {
  room_id: string
  room_name: string
  occupied_load_kwh: string
  baseload_kwh: string
}

type HourlyRow = {
  room_id: string
  room_name: string
  hour_start: string
  hour: string
  occupancy_mode: string
  occupied_fraction: string
  total_energy_kwh: string
  expected_load_kwh: string
  is_occupied: string
}

type ExpectedRow = {
  room_id: string
  room_name: string
  hour: string
  occupancy_mode: string
  expected_load_kwh: string
}

type AnomalyRow = {
  room_id: string
  room_name: string
  hour_start: string
  occupancy_mode: string
  total_energy_kwh: string
  expected_load_kwh: string
  load_gap_kwh: string
  risk_score: string
  anomaly_cause: string
}

type KpiRow = {
  room_id: string
  room_name: string
  avg_actual_load_kwh: string
  avg_expected_load_kwh: string
  pct_energy_without_occupancy: string
  avg_risk_score: string
}

type DashboardData = {
  baseload: BaseloadRow[]
  hourly: HourlyRow[]
  expected: ExpectedRow[]
  anomalies: AnomalyRow[]
  kpis: KpiRow[]
}

const roomPositions: Record<string, { top: string; left: string }> = {
  Room1: { top: '76%', left: '18%' },
  Room2: { top: '58%', left: '17%' },
  Room3: { top: '40%', left: '18%' },
  Room4: { top: '57%', left: '81%' },
  Room5: { top: '40%', left: '81%' },
}

function toNum(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isWithinDateRange(date: string, startDate: string, endDate: string): boolean {
  if (startDate && date < startDate) {
    return false
  }

  if (endDate && date > endDate) {
    return false
  }

  return true
}

async function parseCsv<T>(path: string): Promise<T[]> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }

  const text = await response.text()
  const parsed = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error for ${path}`)
  }

  return parsed.data
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string>('')
  const [activeRoomId, setActiveRoomId] = useState<string>('')
  const [rangeStartDate, setRangeStartDate] = useState<string>('')
  const [rangeEndDate, setRangeEndDate] = useState<string>('')

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [baseload, hourly, expected, anomalies, kpis] = await Promise.all([
          parseCsv<BaseloadRow>('/data/room_energy_baseload_summary.csv'),
          parseCsv<HourlyRow>('/data/room_monitoring_hourly.csv'),
          parseCsv<ExpectedRow>('/data/room_energy_expected_by_hour.csv'),
          parseCsv<AnomalyRow>('/data/room_energy_anomaly_events.csv'),
          parseCsv<KpiRow>('/data/room_monitoring_kpi_summary.csv'),
        ])

        if (!active) {
          return
        }

        setData({ baseload, hourly, expected, anomalies, kpis })
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data')
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const availableDates = useMemo(() => {
    if (!data) {
      return []
    }

    return Array.from(new Set(data.hourly.map((row) => row.hour_start.slice(0, 10)))).sort((a, b) => a.localeCompare(b))
  }, [data])

  useEffect(() => {
    if (availableDates.length === 0) {
      return
    }

    const minDate = availableDates[0]
    const maxDate = availableDates[availableDates.length - 1]

    if (!rangeStartDate || !availableDates.includes(rangeStartDate)) {
      setRangeStartDate(minDate)
    }

    if (!rangeEndDate || !availableDates.includes(rangeEndDate)) {
      setRangeEndDate(maxDate)
    }
  }, [availableDates, rangeStartDate, rangeEndDate])

  const filteredHourly = useMemo(() => {
    if (!data) {
      return []
    }

    if (!rangeStartDate && !rangeEndDate) {
      return data.hourly
    }

    return data.hourly.filter((row) => isWithinDateRange(row.hour_start.slice(0, 10), rangeStartDate, rangeEndDate))
  }, [data, rangeStartDate, rangeEndDate])

  const filteredAnomalies = useMemo(() => {
    if (!data) {
      return []
    }

    if (!rangeStartDate && !rangeEndDate) {
      return data.anomalies
    }

    return data.anomalies.filter((row) => isWithinDateRange(row.hour_start.slice(0, 10), rangeStartDate, rangeEndDate))
  }, [data, rangeStartDate, rangeEndDate])

  const roomLoad = useMemo(() => {
    if (!data) {
      return []
    }

    const grouped = new Map<string, { room: string; occupied: number[]; unoccupied: number[]; all: number[] }>()
    for (const row of filteredHourly) {
      if (!grouped.has(row.room_id)) {
        grouped.set(row.room_id, {
          room: row.room_name.split('-')[0].trim(),
          occupied: [],
          unoccupied: [],
          all: [],
        })
      }

      const current = grouped.get(row.room_id)
      if (!current) {
        continue
      }

      const energy = toNum(row.total_energy_kwh)
      current.all.push(energy)
      if (toNum(row.is_occupied) === 1 || row.occupancy_mode === 'Occupied') {
        current.occupied.push(energy)
      } else {
        current.unoccupied.push(energy)
      }
    }

    if (grouped.size === 0) {
      return data.baseload.map((row) => ({
        roomId: row.room_id,
        room: row.room_name.split('-')[0].trim(),
        baseload: toNum(row.baseload_kwh),
        occupied: toNum(row.occupied_load_kwh),
      }))
    }

    return Array.from(grouped.entries())
      .map(([roomId, current]) => ({
        roomId,
        room: current.room,
        baseload: Number(mean(current.unoccupied.length > 0 ? current.unoccupied : current.all).toFixed(3)),
        occupied: Number(mean(current.occupied.length > 0 ? current.occupied : current.all).toFixed(3)),
      }))
      .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
  }, [data, filteredHourly])

  useEffect(() => {
    if (!activeRoomId && roomLoad.length > 0) {
      setActiveRoomId(roomLoad[0].roomId)
      return
    }

    if (activeRoomId && !roomLoad.some((row) => row.roomId === activeRoomId)) {
      setActiveRoomId(roomLoad[0]?.roomId ?? '')
    }
  }, [roomLoad, activeRoomId])

  const latestRoomStates = useMemo(() => {
    if (!data) {
      return []
    }

    const latestByRoom = new Map<string, HourlyRow>()
    for (const row of filteredHourly) {
      const existing = latestByRoom.get(row.room_id)
      if (!existing || new Date(row.hour_start).getTime() > new Date(existing.hour_start).getTime()) {
        latestByRoom.set(row.room_id, row)
      }
    }

    return Array.from(latestByRoom.values()).map((row) => {
      const occupied = toNum(row.is_occupied) === 1
      const utilization = Math.max(0, Math.min(100, Math.round(toNum(row.occupied_fraction) * 100)))
      const roomType = row.room_name.includes('-') ? row.room_name.split('-')[1].trim() : 'Room'
      const expectedLoad = toNum(row.expected_load_kwh)
      const actualLoad = toNum(row.total_energy_kwh)

      let status = 'Vacant'
      if (occupied) {
        status = 'Occupied'
      } else if (actualLoad > expectedLoad * 1.4 && actualLoad > 0.08) {
        status = 'Standby'
      }

      return {
        roomId: row.room_id,
        room: row.room_name.split('-')[0].trim(),
        type: roomType,
        status,
        use: utilization,
        load: actualLoad,
      }
    })
  }, [data, filteredHourly])

  const selectedRoomId = activeRoomId || roomLoad[0]?.roomId || 'Room1'

  const rangeLabel = useMemo(() => {
    if (!rangeStartDate && !rangeEndDate) {
      return 'All Dates'
    }

    if (rangeStartDate && rangeEndDate) {
      return rangeStartDate === rangeEndDate ? rangeStartDate : `${rangeStartDate} to ${rangeEndDate}`
    }

    if (rangeStartDate) {
      return `${rangeStartDate} onward`
    }

    return `Until ${rangeEndDate}`
  }, [rangeStartDate, rangeEndDate])

  const lineSeries = useMemo(() => {
    if (!data) {
      return { actual: Array(24).fill(0), expected: Array(24).fill(0) }
    }

    const roomHourly = filteredHourly.filter((row) => row.room_id === selectedRoomId)
    const actualByHour = Array.from({ length: 24 }, (_, hour) => {
      const values = roomHourly.filter((row) => toNum(row.hour) === hour).map((row) => toNum(row.total_energy_kwh))
      return Number(mean(values).toFixed(3))
    })

    const roomExpected = data.expected.filter((row) => row.room_id === selectedRoomId)
    const expectedByHour = Array.from({ length: 24 }, (_, hour) => {
      const occupiedRows = roomExpected.filter((row) => toNum(row.hour) === hour && row.occupancy_mode === 'Occupied')
      const fallbackRows = roomExpected.filter((row) => toNum(row.hour) === hour)
      const source = occupiedRows.length > 0 ? occupiedRows : fallbackRows
      return Number(mean(source.map((row) => toNum(row.expected_load_kwh))).toFixed(3))
    })

    return { actual: actualByHour, expected: expectedByHour }
  }, [data, filteredHourly, selectedRoomId])

  const anomalyRows = useMemo(() => {
    if (!data) {
      return []
    }

    return [...filteredAnomalies]
      .sort((a, b) => new Date(b.hour_start).getTime() - new Date(a.hour_start).getTime())
      .slice(0, 12)
      .map((row) => {
        const risk = toNum(row.risk_score)
        const severity = risk >= 2.5 ? 'High' : risk >= 1.5 ? 'Medium' : 'Low'
        return {
          timestamp: row.hour_start.replace('+08:00', ''),
          room: row.room_name.split('-')[0].trim(),
          cause: row.anomaly_cause,
          severity,
        }
      })
  }, [data, filteredAnomalies])

  const rootCauseCounts = useMemo(() => {
    if (!data) {
      return []
    }

    const counts = new Map<string, number>()
    for (const row of filteredAnomalies) {
      for (const cause of row.anomaly_cause.split(';')) {
        const trimmed = cause.trim()
        if (!trimmed) {
          continue
        }
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))
  }, [data, filteredAnomalies])

  const summary = useMemo(() => {
    if (!data) {
      return {
        avgOccupancy: 0,
        peakDemand: 0,
        energyIntensity: 0,
        carbonDelta: 0,
        carbonKg: 0,
        weeklyTrend: [0, 0, 0, 0, 0, 0, 0],
        latestDate: 'N/A',
      }
    }

    const avgOccupancy = mean(filteredHourly.map((row) => toNum(row.occupied_fraction)))
    const peakDemand = filteredHourly.reduce((max, row) => Math.max(max, toNum(row.total_energy_kwh)), 0)
    const energyIntensity = mean(filteredHourly.map((row) => toNum(row.total_energy_kwh)))
    const expectedAvg = mean(data.expected.map((row) => toNum(row.expected_load_kwh)))
    const carbonDelta = expectedAvg > 0 ? ((expectedAvg - energyIntensity) / expectedAvg) * 100 : 0

    const totalKwh = filteredHourly.reduce((sum, row) => sum + toNum(row.total_energy_kwh), 0)
    const carbonKg = totalKwh * 0.408

    const weekOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const weeklyTrend = weekOrder.map((day) => {
      const energyByDay = filteredHourly.filter((row) => row.hour_start.includes(day) || false)
      if (energyByDay.length > 0) {
        return mean(energyByDay.map((row) => toNum(row.total_energy_kwh)))
      }

      const byWeekday = filteredHourly.filter((row) => {
        const timestamp = new Date(row.hour_start)
        return weekOrder[timestamp.getDay() === 0 ? 6 : timestamp.getDay() - 1] === day
      })
      return mean(byWeekday.map((row) => toNum(row.total_energy_kwh)))
    })

    const latestTs = filteredHourly.reduce((latest, row) => {
      if (!latest) {
        return row.hour_start
      }
      return new Date(row.hour_start).getTime() > new Date(latest).getTime() ? row.hour_start : latest
    }, '')

    return {
      avgOccupancy,
      peakDemand,
      energyIntensity,
      carbonDelta,
      carbonKg,
      weeklyTrend,
      latestDate:
        latestTs
          ? new Date(latestTs).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'N/A',
    }
  }, [data, filteredHourly])

  const barOption = {
    color: ['#0f9aa8', '#8aa5b0'],
    grid: { left: 35, right: 16, top: 30, bottom: 30 },
    legend: { top: 0, textStyle: { color: '#2a4a4f', fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: roomLoad.map((row) => row.room),
      axisLabel: { color: '#28505b', fontSize: 11 },
      axisLine: { lineStyle: { color: '#afc6cb' } },
    },
    yAxis: {
      type: 'value',
      name: 'kW',
      nameTextStyle: { color: '#2a4a4f', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e6eff2' } },
      axisLabel: { color: '#28505b', fontSize: 11 },
    },
    series: [
      { name: 'Baseload', type: 'bar', data: roomLoad.map((row) => row.baseload), barWidth: 12 },
      { name: 'Occupied', type: 'bar', data: roomLoad.map((row) => row.occupied), barWidth: 12 },
    ],
    tooltip: { trigger: 'axis' },
  }

  const lineOption = {
    color: ['#0f9aa8', '#8ca0aa'],
    grid: { left: 35, right: 10, top: 24, bottom: 22 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => i),
      axisLabel: { fontSize: 10, color: '#28505b' },
      axisLine: { lineStyle: { color: '#afc6cb' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#28505b' },
      splitLine: { lineStyle: { color: '#e6eff2' } },
    },
    series: [
      { name: 'Actual', type: 'line', smooth: true, data: lineSeries.actual, symbol: 'none', lineStyle: { width: 2.8 } },
      { name: 'Expected', type: 'line', smooth: true, data: lineSeries.expected, symbol: 'none', lineStyle: { width: 2, type: 'dashed' } },
    ],
    legend: { top: 0, textStyle: { color: '#2a4a4f', fontSize: 11 } },
    tooltip: { trigger: 'axis' },
  }

  const donutOption = {
    color: ['#0b5b93', '#2f95a7', '#f09f3e', '#dd5d5d', '#9f9f9f'],
    series: [
      {
        type: 'pie',
        center: ['50%', '39%'],
        radius: ['42%', '58%'],
        data: rootCauseCounts,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 10,
            formatter: '{b}: {d}%',
          },
        },
      },
    ],
    legend: {
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      textStyle: { fontSize: 8, color: '#2a4a4f' },
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 8,
    },
  }

  const areaOption = {
    grid: { left: 20, right: 8, top: 8, bottom: 20 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      axisLabel: { fontSize: 9, color: '#2a4a4f' },
      axisLine: { lineStyle: { color: '#afc6cb' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, color: '#2a4a4f' },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: summary.weeklyTrend.map((value) => Number(value.toFixed(3))),
        areaStyle: { color: 'rgba(47, 149, 167, 0.35)' },
        lineStyle: { color: '#2f95a7', width: 2 },
      },
    ],
  }

  if (error) {
    return <div className="dashboard-shell error-box">{error}</div>
  }

  if (!data) {
    return <div className="dashboard-shell loading-box">Loading dashboard data from CSV files...</div>
  }

  return (
    <div className="dashboard-shell">
      <header className="dash-header panel">
        <div>
          <h1>ROBOD: Campus Building Management Dashboard</h1>
          <p>Singapore UTC +08:00 · SDE4 @ NUS · Active Focus: {selectedRoomId} · Range: {rangeLabel}</p>
        </div>
        <div className="header-tags">
          <div className="date-filter-group">
            <label className="date-filter" htmlFor="global-start-date-filter">
              <span>From</span>
              <input
                id="global-start-date-filter"
                type="date"
                value={rangeStartDate}
                min={availableDates[0] || undefined}
                max={rangeEndDate || availableDates[availableDates.length - 1] || undefined}
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setRangeStartDate(nextStartDate)
                  if (rangeEndDate && nextStartDate && nextStartDate > rangeEndDate) {
                    setRangeEndDate(nextStartDate)
                  }
                }}
              />
            </label>

            <label className="date-filter" htmlFor="global-end-date-filter">
              <span>To</span>
              <input
                id="global-end-date-filter"
                type="date"
                value={rangeEndDate}
                min={rangeStartDate || availableDates[0] || undefined}
                max={availableDates[availableDates.length - 1] || undefined}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setRangeEndDate(nextEndDate)
                  if (rangeStartDate && nextEndDate && nextEndDate < rangeStartDate) {
                    setRangeStartDate(nextEndDate)
                  }
                }}
              />
            </label>
          </div>
          <span className="live-pill">LIVE</span>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel section-1">
          <h2>Section 1: Real-Time Status & Occupancy Tracking</h2>
          <div className="section-1-grid">
            <article className="card map-card">
              <h3>Live Occupancy Heatmap</h3>
              <div className="floorplan-wrap">
                <img src={floorplanSvg} alt="Floorplan" className="floorplan-image" />
                {latestRoomStates.map((room) => {
                  const position = roomPositions[room.roomId]
                  if (!position) {
                    return null
                  }

                  const intensityClass = room.use >= 70 ? 'high' : room.use >= 35 ? 'med' : 'low'
                  return (
                    <button
                      key={room.roomId}
                      className={`floorplan-marker ${intensityClass} ${selectedRoomId === room.roomId ? 'active' : ''}`}
                      style={{ top: position.top, left: position.left }}
                      onMouseEnter={() => setActiveRoomId(room.roomId)}
                      onFocus={() => setActiveRoomId(room.roomId)}
                      onClick={() => setActiveRoomId(room.roomId)}
                      type="button"
                    >
                      {room.room}
                    </button>
                  )
                })}
              </div>
              <p className="legend-text">Low → Medium → High</p>
            </article>

            <article className="card room-state-card">
              <h3>Current Room State & Capacity Use</h3>
              <div className="state-list">
                {latestRoomStates.map((state) => (
                  <div
                    key={state.room}
                    className={`state-item ${selectedRoomId === state.roomId ? 'active' : ''}`}
                    onMouseEnter={() => setActiveRoomId(state.roomId)}
                  >
                    <div className="state-title-row">
                      <strong>{state.room}</strong>
                      <span className={`status-tag ${state.status.toLowerCase()}`}>{state.status}</span>
                    </div>
                    <div className="state-meta">
                      {state.type.includes('Library') ? <BookOpen size={15} /> : <Armchair size={15} />} {state.type}
                    </div>
                    <div className="meter-track">
                      <div style={{ width: `${state.use}%` }} className="meter-fill" />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="panel section-2">
          <h2>Section 2: Energy Efficiency & Baseload Analysis</h2>
          <div className="charts-two-up">
            <article className="card chart-card">
              <h3>Baseload vs Occupied Load</h3>
              <ReactECharts option={barOption} style={{ height: '100%' }} />
            </article>
            <article className="card chart-card">
              <h3>Actual vs Expected Load Profile</h3>
              <ReactECharts option={lineOption} style={{ height: '100%' }} />
            </article>
          </div>
        </section>

        <section className="panel section-3">
          <h2>Section 3: Anomaly Detection & Diagnostics</h2>
          <div className="charts-two-up">
            <article className="card anomaly-log-card">
              <h3>Anomaly Event Log</h3>
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Room</th>
                      <th>Anomaly</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyRows.map((row) => (
                      <tr key={`${row.timestamp}-${row.room}`}>
                        <td>{row.timestamp}</td>
                        <td>{row.room}</td>
                        <td className="anomaly-cell" title={row.cause}>{row.cause}</td>
                        <td>{row.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card chart-card">
              <h3>Root Cause Distribution</h3>
              <ReactECharts option={donutOption} style={{ height: '100%' }} />
            </article>
          </div>
        </section>

        <section className="panel section-4">
          <h2>Section 4: Strategic KPI & Trend Summary</h2>
          <div className="charts-three-up">
            <article className="card kpi-grid">
              <h3>Room-Level KPI Scorecard</h3>
              <div className="kpi-cells">
                <div><span>Energy Intensity</span><strong>{summary.energyIntensity.toFixed(3)}</strong></div>
                <div><span>Avg Occupancy</span><strong>{summary.avgOccupancy.toFixed(2)}</strong></div>
                <div><span>Peak Demand</span><strong>{summary.peakDemand.toFixed(2)}</strong></div>
                <div><span>Carbon Delta</span><strong>{summary.carbonDelta.toFixed(1)}%</strong></div>
              </div>
            </article>
            <article className="card">
              <h3>Weekly Utilization Trend</h3>
              <ReactECharts option={areaOption} style={{ height: 170 }} />
            </article>
            <article className="card carbon-card">
              <h3>Carbon Footprint Estimation</h3>
              <p className="carbon-value">{summary.carbonKg.toFixed(1)}</p>
              <div className="carbon-foot">
                <Building2 size={15} /> Sustainability Score
              </div>
              <div className="health-row">
                {summary.carbonDelta >= 0 ? <CircleCheckBig size={16} /> : <CircleAlert size={16} />}
                {summary.carbonDelta >= 0 ? 'Improving' : 'Watchlist'}
                <Activity size={16} /> {summary.carbonDelta.toFixed(1)}%
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
