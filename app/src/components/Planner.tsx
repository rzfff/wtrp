import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import {
  acquisitionDescription,
  acquisitionSummary,
  availabilityLabel,
  battleRating,
  formatMultiplier,
  formatRp,
  toRoman,
} from '../lib/formats'
import { isResearchTarget, isReserveVehicle, isVehicleComplete } from '../lib/vehicles'
import type {
  CalcPayload,
  CascadeResult,
  EstimateResult,
  ProgressEntry,
  ResearchEfficiencyRules,
  TreeResponse,
  Vehicle,
} from '../types'

type Row = { rp: string; minutes: string }
type Calculation =
  | { kind: 'estimate'; data: EstimateResult }
  | { kind: 'cascade'; data: CascadeResult }

type Props = {
  selected: Vehicle | null
  tree: TreeResponse
  getProgress: (id: number) => ProgressEntry
  exportProgress: () => CalcPayload['progress']
  onSaveProgress: (vehicle: Vehicle, rp: number, done: boolean) => void
}

export function Planner({ selected, tree, getProgress, exportProgress, onSaveProgress }: Props) {
  const [recentMode, setRecentMode] = useState(true)
  const [rows, setRows] = useState<Row[]>([
    { rp: '', minutes: '9' },
    { rp: '', minutes: '9' },
    { rp: '', minutes: '9' },
  ])
  const [avgRp, setAvgRp] = useState('')
  const [avgMinutes, setAvgMinutes] = useState('9')
  const [rpIsBase, setRpIsBase] = useState(false)
  const [premium, setPremium] = useState(false)
  const [booster, setBooster] = useState('')
  const [skill, setSkill] = useState('')
  const [hasTalisman, setHasTalisman] = useState(false)
  const [gameMode, setGameMode] = useState<'ab' | 'rb' | 'sb'>('rb')
  const [researchVehicleId, setResearchVehicleId] = useState('')
  const [cascade, setCascade] = useState(true)
  const [rpDraft, setRpDraft] = useState('0')
  const [result, setResult] = useState<Calculation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const calculationRequest = useRef(0)
  const calculationAbort = useRef<AbortController | null>(null)

  const requirements = useMemo(() => {
    if (!selected) return []
    const ids = tree.edges.filter((edge) => edge.child === selected.id).map((edge) => edge.parent)
    if (selected.folder_of) ids.push(selected.folder_of)
    const map = new Map(tree.nodes.map((item) => [item.id, item]))
    return [...new Set(ids)].map((id) => map.get(id)).filter((item): item is Vehicle => Boolean(item))
  }, [selected, tree])

  const researchVehicles = useMemo(
    () => tree.nodes
      .filter((vehicle) => vehicle.id !== selected?.id)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [selected, tree.nodes],
  )

  const researchVehicle = useMemo(
    () => researchVehicles.find((vehicle) => vehicle.id === Number(researchVehicleId)) || null,
    [researchVehicleId, researchVehicles],
  )
  const selectedProgress = selected ? getProgress(selected.id) : null

  useEffect(() => {
    setRpDraft(String(selectedProgress?.rp || 0))
  }, [selected?.id, selectedProgress?.done, selectedProgress?.rp])

  useEffect(() => {
    calculationRequest.current += 1
    calculationAbort.current?.abort()
    calculationAbort.current = null
    setResult(null)
    setError(null)
    setBusy(false)
    return () => {
      calculationRequest.current += 1
      calculationAbort.current?.abort()
      calculationAbort.current = null
    }
  }, [
    avgMinutes,
    avgRp,
    booster,
    cascade,
    exportProgress,
    gameMode,
    hasTalisman,
    premium,
    recentMode,
    researchVehicleId,
    rows,
    rpDraft,
    rpIsBase,
    selected?.id,
    skill,
  ])

  useEffect(() => {
    setResearchVehicleId((current) => {
      if (researchVehicles.some((vehicle) => vehicle.id === Number(current))) return current
      const ownedDirect = requirements.find((vehicle) => isVehicleComplete(vehicle, getProgress(vehicle.id)))
      const bestOwned = researchVehicles
        .filter((vehicle) => isVehicleComplete(vehicle, getProgress(vehicle.id)))
        .sort((a, b) => defaultResearchEfficiency(b, selected, tree.meta?.research_efficiency) - defaultResearchEfficiency(a, selected, tree.meta?.research_efficiency)
          || b.rank - a.rank
          || a.name.localeCompare(b.name))[0]
      return String(ownedDirect?.id || bestOwned?.id || '')
    })
  }, [selected, requirements, researchVehicles, getProgress])

  useEffect(() => {
    if (!rpIsBase || researchVehicle?.type === 'premium') setHasTalisman(false)
  }, [researchVehicle, rpIsBase])

  async function calculate() {
    if (!selected) return
    if (!researchVehicle) {
      setError('请选择用于研发的载具。')
      return
    }
    const recent = rows
      .map((row) => {
        const rp = Number(row.rp)
        const minutes = Number(row.minutes)
        return {
          rp: Number.isFinite(rp) ? Math.min(10_000_000, Math.max(0, rp)) : 0,
          minutes: Number.isFinite(minutes) ? Math.min(300, Math.max(0, minutes)) : 0,
        }
      })
      .filter((row) => Number.isFinite(row.rp) && row.rp > 0)
    if (recentMode && !recent.length) {
      setError(`请至少输入一场战斗的${rpIsBase ? '基础' : '改装'}研发点。`)
      return
    }
    const manualRp = Number(avgRp)
    if (!recentMode && (!Number.isFinite(manualRp) || manualRp <= 0 || manualRp > 10_000_000)) {
      setError('请输入每场平均研发点。')
      return
    }
    const manualMinutes = Number(avgMinutes)
    const draftProgress = progressFromDraft(rpDraft, selected.rp_cost || 0, Boolean(selectedProgress?.done))
    const payload: CalcPayload = {
      vehicle_id: selected.id,
      research_vehicle_id: researchVehicle.id,
      rp_current: draftProgress.rp,
      recent_battles: recentMode ? recent : [],
      avg_rp_per_battle: recentMode ? 0 : manualRp,
      avg_battle_minutes: recentMode ? 9 : (Number.isFinite(manualMinutes) && manualMinutes > 0 ? Math.min(300, manualMinutes) : 9),
      rp_is_base: rpIsBase,
      has_premium: premium,
      booster_percent: Math.min(1000, Math.max(0, Number(booster) || 0)),
      skill_bonus_percent: Math.min(500, Math.max(0, Number(skill) || 0)),
      has_talisman: hasTalisman,
      game_mode: gameMode,
      progress: cascade
        ? progressWithDraft(exportProgress(), selected.id, draftProgress)
        : undefined,
    }
    calculationAbort.current?.abort()
    const controller = new AbortController()
    const requestId = ++calculationRequest.current
    calculationAbort.current = controller
    try {
      setBusy(true)
      setError(null)
      if (cascade) {
        const data = await api.cascade(payload, controller.signal)
        if (requestId === calculationRequest.current) setResult({ kind: 'cascade', data })
      } else {
        const data = await api.estimate(payload, controller.signal)
        if (requestId === calculationRequest.current) setResult({ kind: 'estimate', data })
      }
    } catch (caught) {
      if (requestId === calculationRequest.current && !controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : '预测计算失败。')
      }
    } finally {
      if (requestId === calculationRequest.current) {
        calculationAbort.current = null
        setBusy(false)
      }
    }
  }

  if (!selected) {
    return (
      <aside className="planner empty-planner">
        <span className="empty-icon" aria-hidden="true">◎</span>
        <h2>选择一台载具</h2>
        <p>在科技树中点选卡片,更新进度并计算开线。</p>
      </aside>
    )
  }

  const progress = getProgress(selected.id)
  const total = selected.rp_cost || 0
  const reserve = isReserveVehicle(selected)
  const done = isVehicleComplete(selected, progress)
  const canResearch = isResearchTarget(selected)
  const draftProgress = progressFromDraft(rpDraft, total, done)
  const targetState = reserve
    ? '初始车'
    : canResearch
      ? done ? '已解锁' : '研发中'
      : selected.type === 'tree' ? '无需研发' : availabilityLabel(selected)

  return (
    <aside className="planner">
      <div className="planner-head">
        <div>
          <div className="eyebrow">当前目标</div>
          <h2>{selected.name}</h2>
          {selected.image && <img className="statcard" src={selected.image} alt="" loading="lazy" />}
          <p>
            等级 {toRoman(selected.rank)} · BR {battleRating(selected) ?? '-'} ·{' '}
            {reserve
              ? '初始车 · 默认解锁'
              : total > 0
                ? `${formatRp(total)} RP`
                : '无研发点成本'}
          </p>
        </div>
        <span className={`target-state ${done ? 'done' : ''}`}>{targetState}</span>
      </div>

      {canResearch && (
        <section className="planner-section progress-editor">
          <div className="section-title">
            <h3>你的进度</h3>
            <span>{total ? Math.round(Math.min(1, Number(rpDraft || 0) / total) * 100) : 0}%</span>
          </div>
          <div className="progress-input-row">
            <label>
              <span>已获研发点</span>
              <input type="number" min={0} max={total || undefined} value={rpDraft} onChange={(event) => setRpDraft(event.target.value)} />
            </label>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onSaveProgress(selected, draftProgress.rp, draftProgress.done)}
            >
              保存
            </button>
          </div>
          <button
            className={`unlock-toggle ${done ? 'is-done' : ''}`}
            type="button"
            onClick={() => {
              onSaveProgress(selected, done ? 0 : total, !done)
              setRpDraft(String(done ? 0 : total))
            }}
          >
            <i aria-hidden="true">{done ? '✓' : ''}</i>
            {done ? '载具已解锁' : '标记为已解锁'}
          </button>
          {requirements.length > 0 && (
            <p className="requirements">需前置:{requirements.map((item) => item.name).join('、')}</p>
          )}
        </section>
      )}

      {canResearch ? (
        <>
          <section className="planner-section research-setup">
            <div className="section-title"><h3>研发用车</h3></div>
            <label className="number-field">
              <span>出战载具(打谁来研发)</span>
              <select value={researchVehicleId} onChange={(event) => setResearchVehicleId(event.target.value)}>
                <option value="">选择载具</option>
                {researchVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    等级 {toRoman(vehicle.rank)} · {vehicle.name} · ×{formatMultiplier(vehicle.rp_multiplier)} RP
                  </option>
                ))}
              </select>
            </label>
            <div className="mode-switch game-mode" role="group" aria-label="Game mode">
              {(['ab', 'rb', 'sb'] as const).map((mode) => (
                <button key={mode} type="button" className={gameMode === mode ? 'is-active' : ''} onClick={() => setGameMode(mode)}>
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            {researchVehicle && (
              <p className="requirements">
                数据库研发倍率:×{formatMultiplier(researchVehicle.rp_multiplier)}。目标等级效率与直达前驱加成自动计算。
              </p>
            )}
          </section>

          <section className="planner-section">
            <div className="section-title">
              <h3>研发节奏</h3>
              <div className="mode-switch">
                <button type="button" className={recentMode ? 'is-active' : ''} onClick={() => setRecentMode(true)}>逐场输入</button>
                <button type="button" className={!recentMode ? 'is-active' : ''} onClick={() => setRecentMode(false)}>平均值</button>
              </div>
            </div>

            {recentMode ? (
              <div className="battle-table">
                <div className="battle-row battle-header">
                  <span>场次</span><span>{rpIsBase ? '基础 RP' : '改装 RP'}</span><span>分钟</span>
                </div>
                {rows.map((row, index) => (
                  <div className="battle-row" key={index}>
                    <span>#{index + 1}</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`第 ${index + 1} 场的${rpIsBase ? '基础' : '改装'}研发点`}
                      value={row.rp}
                      onChange={(event) => setRows(updateRow(rows, index, 'rp', event.target.value))}
                      placeholder="e.g. 2400"
                    />
                    <input
                      type="number"
                      min={0}
                      aria-label={`第 ${index + 1} 场的分钟数`}
                      value={row.minutes}
                      onChange={(event) => setRows(updateRow(rows, index, 'minutes', event.target.value))}
                    />
                  </div>
                ))}
                {rows.length < 5 && <button className="add-battle" type="button" onClick={() => setRows([...rows, { rp: '', minutes: '9' }])}>+ 加一场</button>}
              </div>
            ) : (
              <div className="two-fields">
                <NumberField label={`${rpIsBase ? '基础' : '改装'} RP/场`} value={avgRp} onChange={setAvgRp} placeholder="如 2400" />
                <NumberField label="分钟/场" value={avgMinutes} onChange={setAvgMinutes} />
              </div>
            )}
            <p className="requirements">
              {rpIsBase
                ? '基础 RP = 未计入任何载具/高账/护身符/加成/技能乘子的原始值。'
                : '填该载具获得的改装研发点(已含载具与高账等乘子,未计目标研发效率)。'}
            </p>
          </section>

          <section className="planner-section forecast-options">
            <label className="check-row">
              <input type="checkbox" checked={rpIsBase} onChange={(event) => setRpIsBase(event.target.checked)} />
              <span>
                <b>输入的是基础 RP</b>
                <small>仅当数值未含载具/高账/护身符/加成/技能乘子时勾选。</small>
              </span>
            </label>
            <div className={!rpIsBase ? 'bonus-fields is-disabled' : 'bonus-fields'}>
              <label className="check-compact"><input type="checkbox" disabled={!rpIsBase} checked={premium} onChange={(event) => setPremium(event.target.checked)} /> 高级账号 +100%</label>
              <NumberField label="加成卡 %" value={booster} onChange={setBooster} disabled={!rpIsBase} />
              <NumberField label="技能 %" value={skill} onChange={setSkill} disabled={!rpIsBase} />
            </div>
            <label className={`check-row compact ${!rpIsBase || researchVehicle?.type === 'premium' ? 'is-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={hasTalisman}
                disabled={!rpIsBase || researchVehicle?.type === 'premium'}
                onChange={(event) => setHasTalisman(event.target.checked)}
              />
              <span><b>护身符 +100%</b><small>仅作用于基础 RP 且非高级载具。</small></span>
            </label>
            <label className="check-row compact">
              <input type="checkbox" checked={cascade} onChange={(event) => setCascade(event.target.checked)} />
              <span><b>计入前置载具</b><small>计算通往目标路上的全部所需载具。</small></span>
            </label>
          </section>

          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button-primary calculate" type="button" disabled={busy} onClick={calculate}>
            {busy ? '计算中…' : '计算开线计划'} <span aria-hidden="true">→</span>
          </button>

          {result && <ResultPanel calculation={result} />}
        </>
      ) : reserve ? (
        <section className="planner-section premium-summary">
          <h3>初始载具</h3>
          <p>所有玩家默认拥有的起始载具,始终视为已解锁。</p>
          <strong>默认解锁</strong>
        </section>
      ) : selected.type === 'tree' ? (
        <section className="planner-section premium-summary">
          <h3>无需研发进度</h3>
          <p>当前目录中该载具没有研发点成本,无法编辑进度或预测。</p>
          <strong>无需研发即可获得</strong>
        </section>
      ) : (
        <section className="planner-section premium-summary">
          <h3>{availabilityLabel(selected)}载具</h3>
          <p>{acquisitionDescription(selected)}</p>
          <strong>{acquisitionSummary(selected)}</strong>
        </section>
      )}
    </aside>
  )
}

function defaultResearchEfficiency(
  source: Vehicle,
  target: Vehicle | null,
  rules?: ResearchEfficiencyRules,
): number {
  if (!target || !rules) return 0
  if (source.type === 'premium' && target.rank <= source.rank + rules.premium_max_target_rank_offset) return 1
  const difference = target.rank - source.rank
  if (difference >= 0) return rules.target_above[String(difference)] ?? rules.target_above_default
  return rules.target_below[String(Math.abs(difference))] ?? rules.target_below_default
}

function ResultPanel({ calculation }: { calculation: Calculation }) {
  const { data: result } = calculation
  const cascade = calculation.kind === 'cascade'
  const remaining = cascade ? (result as CascadeResult).rp_total_remaining : (result as EstimateResult).rp_remaining
  const modifiers = result.modifiers
  return (
    <section className="result-panel" aria-live="polite">
      <div className="result-heading"><span>预测</span><small>1 金鹰 ≈ 45 RP</small></div>
      <div className="result-grid">
        <ResultStat label="剩余" value={`${formatRp(remaining)} RP`} />
        <ResultStat label="场次" value={result.battles_needed === null ? '-' : formatRp(result.battles_needed)} />
        <ResultStat label="时长" value={result.hours_needed === null ? '-' : `${result.hours_needed} 小时`} />
        <ResultStat label="金鹰转换" value={`${formatRp(result.ge_cost_by_rate)} 金鹰`} />
      </div>
      <p>
        预测:<b>{formatRp(Math.round(result.effective_rp_per_battle))} RP/场</b> ·{' '}
        {result.base_from_recent.samples
          ? `${result.base_from_recent.samples} 场均值`
          : '手动均值'}
      </p>
      <p className="modifier-line">
        载具倍率 ×{formatMultiplier(modifiers.vehicle_rp_multiplier)}({modifiers.vehicle_rp_multiplier_applied ? '已计入' : '输入值已含'})
        {modifiers.vehicle_rp_multiplier_applied ? ` · 基础加成合计 ×${formatMultiplier(modifiers.economy_multiplier)}` : ''}
        {' '}· 研发效率 {Math.round(modifiers.research_efficiency * 100)}%
        {modifiers.direct_predecessor_bonus ? ' · 直达前驱加成' : ''}
      </p>
      {cascade && (
        <details>
          <summary>路线明细({(result as CascadeResult).breakdown.length})</summary>
          <ol>
            {(result as CascadeResult).breakdown.map((item) => (
              <li key={item.id}>
                <span>{item.name} · {Math.round(item.research_efficiency * 100)}%</span>
                <b>{item.done ? '已完成' : `${formatRp(item.rp_remaining)} RP`}</b>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" min={0} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function updateRow(rows: Row[], index: number, key: keyof Row, value: string) {
  return rows.map((row, position) => position === index ? { ...row, [key]: value } : row)
}

export function progressFromDraft(
  value: string,
  total: number,
  currentDone = false,
): { rp: number; done: boolean } {
  if (total <= 0) return { rp: 0, done: currentDone }
  const parsed = Number(value)
  const rp = Number.isFinite(parsed) ? Math.min(Math.max(0, Math.floor(parsed)), Math.max(0, total)) : 0
  return { rp, done: rp >= total }
}

export function progressWithDraft(
  saved: CalcPayload['progress'],
  vehicleId: number,
  draft: { rp: number; done: boolean },
): NonNullable<CalcPayload['progress']> {
  return {
    ...(saved || {}),
    [vehicleId]: { rp_current: draft.rp, done: draft.done },
  }
}
