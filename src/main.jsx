import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Download,
  RefreshCw,
  X,
  Search,
  Database,
  RotateCcw,
  ExternalLink,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  countries,
  models,
  channels,
  ALL,
  channelName,
  channelShort,
  variantLabel,
  retailers,
  weeks,
  labels,
  anomaly,
  history,
  cell,
  money,
  usd,
  brands,
  flagEmoji,
  fxLabel,
  freshness,
  localTime,
  percentage,
  csv,
  dataInfo,
  records,
  loadRemoteRecords,
  currencyOf,
  cadenceLabel,
  specOf,
  specValues,
  weeklyTrend,
} from "./data";
import "./styles.css";
gsap.registerPlugin(useGSAP);
function Select({ label, value, onChange, options }) {
  return (
    <label className="select">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}
function Change({ data, currency }) {
  const Icon =
    data.delta > 0 ? ArrowUpRight : data.delta < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={`change ${data.delta > 0 ? "up" : data.delta < 0 ? "down" : ""}`}
    >
      <Icon size={14} />
      {data.delta == null
        ? "暂无环比"
        : `${data.delta > 0 ? "+" : data.delta < 0 ? "−" : ""}${money(Math.abs(data.delta), currency)}`}
      <span>{percentage(data.percent)}</span>
    </span>
  );
}
function NumberValue({ value, currency }) {
  const ref = useRef(null),
    old = useRef(value);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const n = { value: old.current ?? value ?? 0 };
        if (value != null)
          gsap.to(n, {
            value,
            duration: 0.2,
            ease: "power2.out",
            onUpdate: () => {
              if (ref.current)
                ref.current.textContent = money(n.value, currency);
            },
          });
      });
      old.current = value;
      return () => mm.revert();
    },
    { scope: ref, dependencies: [value, currency], revertOnUpdate: true },
  );
  return <span ref={ref}>{money(value, currency)}</span>;
}
function Drawer({ title, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      trigger?.focus();
    };
  }, []);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () =>
        gsap.fromTo(
          ref.current,
          { x: 24, opacity: 0.5 },
          { x: 0, opacity: 1, duration: 0.22, ease: "power3.out" },
        ),
      );
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) close();
      }}
    >
      <header className="drawer-head">
        <h2>{title}</h2>
        <button
          autoFocus
          className="icon"
          aria-label="关闭详情"
          title="关闭详情"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
/* ------------------------ product specs (R2 / WC §5) --------------------- */

const CONFIDENCE_LABEL = { official: "官方", retailer: "零售商", unverified: "未核实" };

const SPEC_FIELDS = [
  {
    key: "screenInches",
    label: "屏幕尺寸",
    value: (spec) => (spec.screenInches == null || spec.screenInches === "" ? null : `${spec.screenInches}"`),
    // The researched `display` string already opens with the size (every published
    // entry does, e.g. `6.7" PLS LCD HD+`), so strip that leading token only:
    // the value column owns the number and the note keeps the panel detail.
    note: (spec) => {
      if (!spec.display) return null;
      const display = String(spec.display).trim();
      if (!display) return null;
      return display.replace(/^\d+(?:\.\d+)?\s*["″]?\s*/, "") || null;
    },
  },
  {
    key: "batteryMah",
    label: "电池容量",
    value: (spec) => (spec.batteryMah == null || spec.batteryMah === "" ? null : `${spec.batteryMah} mAh`),
  },
  {
    key: "storage",
    label: "容量（存储）",
    value: (spec) => {
      const list = Array.isArray(spec.storage) ? spec.storage.filter((v) => v != null && v !== "") : [];
      return list.length ? list.join(" / ") : null;
    },
  },
  {
    key: "ramGb",
    label: "运行内存",
    value: (spec) => (spec.ramGb == null || spec.ramGb === "" ? null : `${spec.ramGb} GB`),
  },
  {
    key: "chipset",
    label: "芯片",
    value: (spec) => (spec.chipset == null || spec.chipset === "" ? null : String(spec.chipset)),
  },
  {
    key: "releaseYear",
    label: "发布时间",
    value: (spec) => (spec.releaseYear == null || spec.releaseYear === "" ? null : `${spec.releaseYear} 年`),
  },
];

/** Only URLs actually published in `sources` are rendered (anti-fabrication, WC §7). */
function specSources(spec) {
  return Array.isArray(spec?.sources)
    ? spec.sources.filter((url) => typeof url === "string" && /^https?:/.test(url))
    : [];
}

/** R2 — the researched product specs behind a model name in the matrix header. */
function SpecDetail({ model, close }) {
  const spec = specOf(model.id);
  const sources = specSources(spec);
  return (
    <Drawer title={`${model.name} · 产品规格`} close={close}>
      <div className="drawer-body spec-body">
        {!spec ? (
          <p className="spec-empty">
            {model.name} 暂无已核实的规格数据（specs.json 中没有该型号的条目）。为避免编造，本页不显示任何推测值。
          </p>
        ) : (
          <>
            <p className="note spec-meta">
              型号 {model.id} · Samsung · 数据置信度：
              {CONFIDENCE_LABEL[spec.confidence] ?? spec.confidence ?? "未标注"} · 未核实字段显示「暂无数据」。
            </p>
            <dl className="spec-grid">
              {SPEC_FIELDS.map((field) => {
                const value = field.value(spec);
                const note = field.note ? field.note(spec) : null;
                return (
                  <div className="spec-row" key={field.key}>
                    <dt>{field.label}</dt>
                    <dd className={value == null ? "unknown" : ""}>
                      <span>{value ?? "暂无数据"}</span>
                      {value != null && note ? <small>{note}</small> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <h3 className="spec-heading">来源链接</h3>
            {sources.length ? (
              <ul className="spec-sources">
                {sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      <span>{url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="spec-sources-empty">暂无数据</p>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ---------------------- weekly trend (R4 / WC §3.2, §5) ------------------ */

/** `pct` values from `weeklyTrend()` are FRACTIONS (0.0123 = +1.23%). */
const trendPct = (fraction) => (fraction == null ? null : fraction * 100);

const trendSeriesName = (item) =>
  `${item.model}${item.variant && item.variant !== ALL ? ` ${item.variant}` : ""}`;

const trendMove = (item) =>
  `${trendSeriesName(item)}（${money(item.from, currencyOf(item.country))} → ${money(item.to, currencyOf(item.country))}，${percentage(trendPct(item.pct))}）`;

const trendWeekLabel = (item) =>
  `${trendSeriesName(item)}（${money(item.from, currencyOf(item.country))} → ${money(item.to, currencyOf(item.country))}，${percentage(trendPct(item.pct))}，${item.week}）`;

/**
 * R4 — `本周价格变化趋势`. Every sentence below is derived from the returned
 * `weeklyTrend()` payload only: no interpolation, no narrative the sample cannot
 * support (WC §5, §7, A2, A3).
 */
function TrendSection({ trend, week, scopeText }) {
  const { points = [], summary, excluded } = trend ?? {};
  const chart = points.map((point) => ({
    week: point.week.slice(5),
    fullWeek: point.week,
    index: point.index,
    up: point.changedUp,
    down: point.changedDown,
    sample: point.sample,
  }));
  const latest = points.at(-1) ?? null;
  const sample = summary?.sample ?? 0;
  const thin = Boolean(summary?.insufficient) || (latest?.sample ?? 0) < 3;

  const latestMarkets = summary?.markets ?? [];
  const latestChannels = summary?.channels ?? [];
  const onlyMarket =
    sample > 0 && latestMarkets.length === 1 && latestMarkets[0].sample === sample
      ? countries.find((c) => c.id === latestMarkets[0].id)?.name ?? latestMarkets[0].id
      : null;
  const onlyChannel =
    sample > 0 && latestChannels.length === 1 && latestChannels[0].sample === sample
      ? channelName(latestChannels[0].id)
      : null;
  const concentration =
    onlyMarket && onlyChannel
      ? `${onlyMarket} · ${onlyChannel}`
      : onlyMarket ?? onlyChannel ?? null;

  const medianText =
    summary?.medianPct == null ? "不可计算（可比样本不足）" : percentage(trendPct(summary.medianPct));
  // A move that is listed in the weekly movers AND is a suspect must not read as
  // an unlabelled trend (A2, R-4).
  const flaggedMovers = [...(summary?.topGainers ?? []), ...(summary?.topLosers ?? [])].filter((item) =>
    (summary?.suspects ?? []).some(
      (suspect) =>
        suspect.country === item.country &&
        suspect.model === item.model &&
        suspect.variant === item.variant &&
        suspect.pct === item.pct,
    ),
  );

  return (
    <section className="trend" aria-label="本周价格变化趋势">
      <div className="section-head">
        <h2>本周价格变化趋势</h2>
        <span className="trend-week-badge">截至 {week}</span>
      </div>
      <p className="trend-scope">
        范围：{scopeText} · 数据为每周快照（{cadenceLabel()}）· 非实时行情 · 缺口不插值
      </p>

      {points.length > 0 ? (
        <>
          <div className="trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 18, right: 12, left: 0, bottom: 6 }}>
                <CartesianGrid vertical={false} stroke="#e7e9ec" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12, fill: "#69707b" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="index"
                  width={56}
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 12, fill: "#69707b" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => Number(v).toFixed(0)}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  width={38}
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#69707b" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value, name, item) => {
                    if (name === "index") {
                      return [item?.payload?.index == null ? "缺口（无可比样本）" : Number(value).toFixed(2), "价格指数（基准 100）"];
                    }
                    return [`${value} 个型号`, name === "up" ? "上涨" : "下跌"];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return row ? `${row.fullWeek} · 可比样本 ${row.sample}` : label;
                  }}
                />
                <Bar yAxisId="count" dataKey="up" fill="#16756a" barSize={9} isAnimationActive={false} />
                <Bar yAxisId="count" dataKey="down" fill="#b16629" barSize={9} isAnimationActive={false} />
                <Line
                  yAxisId="index"
                  type="linear"
                  dataKey="index"
                  stroke="#24272e"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#24272e" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="trend-legend">
            <span>
              <i className="legend-line" />
              价格指数（左轴，基准 100）
            </span>
            <span>
              <i className="legend-bar up" />
              上涨家数（右轴）
            </span>
            <span>
              <i className="legend-bar down" />
              下跌家数（右轴）
            </span>
            <span>指数缺口表示该周可比样本不足，均不连线、不插值</span>
          </div>
          <div className="trend-weeks">
            {points.map((point) => (
              <div className="trend-week" key={point.week}>
                <b>{point.week}</b>
                <span>指数 {point.index == null ? "缺口" : point.index.toFixed(2)}</span>
                <span>
                  上涨 {point.changedUp} · 下跌 {point.changedDown}
                </span>
                <span>可比样本 {point.sample}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="trend-empty">
          当前筛选范围内没有可比的两周真实记录，因此不显示价格指数（不插值、不推测）。
        </p>
      )}

      <div className="trend-summary">
        <h3>趋势分析总结</h3>
        <p>
          范围：{scopeText}，截至 {week}。统计对象是每个「市场 × 型号 × 渠道 × 容量」系列的真实周度观测，
          数据为每周快照（{cadenceLabel()}），不是实时行情。
        </p>
        {thin ? (
          <p className="trend-thin">
            本周可比样本不足，暂不判断趋势。
            {points.length === 0
              ? "当前范围内没有任何一周达到 3 个可比系列，中位数与价格指数均为缺口（不插值、不推测）。"
              : `最近一周（${latest.week}）可比样本 ${latest.sample} 项，少于计算中位数所需的 3 项${
                  summary?.medianPct != null ? `；该周中位周变动 ${medianText}，仅供参考` : ""
                }。`}
          </p>
        ) : (
          <p>
            最近一周（{latest.week}）可比样本 {sample} 项：上涨 {summary.up} · 下跌 {summary.down} · 持平{" "}
            {summary.flat}，中位周变动 {medianText}。
          </p>
        )}
        {!thin && latest?.index != null ? (
          <p>
            价格指数以 {points.find((point) => point.index != null)?.week} 的 100 为基准链式累计，最近一周为{" "}
            {latest.index.toFixed(2)}。
          </p>
        ) : null}
        {concentration ? (
          <p className="trend-concentration">
            样本仅来自{concentration}。可比样本越集中，结论越不具代表性。
          </p>
        ) : latestMarkets.length > 1 ? (
          <p>
            可比样本分布于 {latestMarkets.length} 个市场（
            {latestMarkets.map((m) => `${countries.find((c) => c.id === m.id)?.name ?? m.id} ${m.sample} 项`).join("、")}
            ）。
          </p>
        ) : null}
        {summary?.topGainers?.length ? (
          <p>
            最近一周涨幅前三：{summary.topGainers.map(trendMove).join("；")}。
          </p>
        ) : null}
        {summary?.topLosers?.length ? (
          <p>
            最近一周跌幅前三：{summary.topLosers.map(trendMove).join("；")}。
          </p>
        ) : null}
        {flaggedMovers.length > 0 ? (
          <p className="trend-flag-note">
            涨跌榜中有 {flaggedMovers.length} 项属于疑似异常（见下），请先核对来源再解读。
          </p>
        ) : null}
        {summary?.suspects?.length ? (
          <div className="trend-suspects">
            <p>
              疑似异常，需核对来源（{summary.suspects.length} 项，仍计入中位数，未删除也未平滑）：
            </p>
            <ul>
              {summary.suspects.map((item) => (
                <li key={`${item.country}-${item.model}-${item.variant}-${item.week}`}>{trendWeekLabel(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(excluded?.missingSpec > 0 || excluded?.noSpec > 0) && (
          <p className="trend-excluded">
            规格筛选排除了 {excluded.missingSpec} 个缺少规格数据的型号
            {excluded.noSpec > 0 ? `，另有 ${excluded.noSpec} 个型号尚无规格条目` : ""}。
          </p>
        )}
        <p className="trend-method">
          说明：指数由各系列「同币种」的周环比中位数链式生成，不跨币种换算；可比样本少于 3 项时中位数与指数为缺口。
          指数只描述这些周已经观测到的真实记录，不代表未来价格。
        </p>
      </div>
    </section>
  );
}

function Detail({ selected, week, close }) {
  const { country, model } = selected;
  const [variant, setVariant] = useState(selected.variant),
    [channel, setChannel] = useState(selected.channel),
    [range, setRange] = useState("12"),
    [compare, setCompare] = useState(true),
    [usdMode, setUsdMode] = useState(false);
  const ref = useRef(null);
  const rows = history(country.id, model.id, channel, variant, week),
    data = cell(country.id, model.id, channel, variant, week),
    displayed = rows.slice(-Number(range));
  const chart = displayed.map((row) => ({
    week: row.week.slice(5),
    ...Object.fromEntries(
      channels.map((ch) => {
        const point = history(country.id, model.id, ch.id, variant, row.week).at(-1);
        return [ch.id, point ? (usdMode ? point.priceUsd : point.value) : null];
      }),
    ),
    events: Object.fromEntries(
      channels.map((ch) => [
        ch.id,
        history(country.id, model.id, ch.id, variant, row.week).at(-1)?.state,
      ]),
    ),
  }));
  const values = rows.filter((r) => r.value !== null).map((r) => r.value),
    fourAgo = rows.at(-5)?.value,
    fourChange = fourAgo > 0 ? ((data.value - fourAgo) / fourAgo) * 100 : null;
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () =>
        gsap.fromTo(
          ".chart",
          { opacity: 0.4, y: 3 },
          { opacity: 1, y: 0, duration: 0.2 },
        ),
      );
      return () => mm.revert();
    },
    {
      scope: ref,
      dependencies: [range, channel, variant, compare],
      revertOnUpdate: true,
    },
  );
  return (
    <Drawer title={`${country.name} · ${model.name}`} close={close}>
      <div ref={ref} className="drawer-body">
        <div className="detail-meta">
          <span>{rows.length ? "已验证价格记录" : "暂无已验证价格"}</span>
          <span>截至 {week}</span>
        </div>
        <div className="detail-controls">
          <Select
            label="容量"
            value={variant}
            onChange={setVariant}
            options={[{ value: ALL, label: variantLabel(ALL) }, ...model.variants.map((value) => ({ value, label: variantLabel(value) }))]}
          />
          <Select
            label="渠道"
            value={channel}
            onChange={setChannel}
            options={[{ value: ALL, label: channelName(ALL) }, ...channels.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            label="时间范围"
            value={range}
            onChange={setRange}
            options={["4", "8", "12"].map((n) => ({
              value: n,
              label: `近 ${n} 周`,
            }))}
          />
        </div>
        <div className="detail-price">
          <span>
            当前价格 · {usdMode ? "USD" : country.currency}
          </span>
          <strong>
            {usdMode ? (
              <span>{usd(data.priceUsd)}</span>
            ) : (
              <NumberValue value={data.value} currency={country.currency} />
            )}
          </strong>
          <span className="usd-price">
            {usdMode ? `${money(data.value, country.currency)}` : usd(data.priceUsd)}
          </span>
          <Change data={data} currency={country.currency} />
        </div>
        <div className="metrics">
          <div>
            <span>历史最低</span>
            <b>
              {money(
                values.length ? Math.min(...values) : null,
                country.currency,
              )}
            </b>
          </div>
          <div>
            <span>历史最高</span>
            <b>
              {money(
                values.length ? Math.max(...values) : null,
                country.currency,
              )}
            </b>
          </div>
          <div>
            <span>近 4 周</span>
            <b>{percentage(fourChange)}</b>
          </div>
        </div>
        <div className="chart-heading">
          <h3>周度趋势</h3>
          <span className="chart-toggles">
          <label className="check">
            <input
              type="checkbox"
              checked={usdMode}
              onChange={(e) => setUsdMode(e.target.checked)}
            />
            显示美元
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            对比渠道
          </label>
          </span>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chart}
              margin={{ top: 20, right: 14, left: 0, bottom: 8 }}
            >
              <CartesianGrid vertical={false} stroke="#e7e9ec" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 12, fill: "#69707b" }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                width={64}
                domain={["auto", "auto"]}
                tick={{ fontSize: 12, fill: "#69707b" }}
                tickFormatter={(v) => (usdMode ? usd(v) : money(v, country.currency))}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v, name, p) => [
                  `${usdMode ? usd(v) : `${money(v, country.currency)} ${country.currency}`} · ${labels[p.payload.events[name]]}`,
                  channels.find((c) => c.id === name)?.name,
                ]}
              />
              {channels
                .filter((c) => compare || c.id === channel)
                .map((c) => (
                  <Line
                    key={c.id}
                    type="linear"
                    dataKey={c.id}
                    stroke={c.color}
                    strokeWidth={2}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(p) => (
                      <circle
                        key={`${c.id}-${p.index}`}
                        cx={p.cx}
                        cy={p.cy}
                        r={p.payload.events[c.id] === "normal" ? 2 : 4}
                        fill={
                          anomaly(p.payload.events[c.id]) ? "#fff" : c.color
                        }
                        stroke={c.color}
                        strokeWidth={1.5}
                      />
                    )}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-legend">
          {channels
            .filter((c) => compare || c.id === channel)
            .map((c) => (
              <span key={c.id}>
                <i style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          <span>空心点：沿用上期</span>
        </div>
        <h3 className="records-title">
          价格记录 <small>{displayed.length} 周</small>
        </h3>
        <div className="record-list">
          {displayed.toReversed().map((row) => (
            <div className="record" key={row.week}>
              <div>
                <b>{row.week}</b>
                <span>
                  08:00 UTC · {channelName(row.channel ?? channel)}
                </span>
              </div>
              <div>
                <b>
                  {money(row.value, country.currency)} {country.currency}
                </b>
                <span className="usd-note">{row.priceUsd != null ? usd(row.priceUsd) : "FX 不可用"}</span>
                <span className={anomaly(row.state) ? "warning" : ""}>
                  {labels[row.state]}
                  {row.carried ? ` · 原记录 ${row.effectiveDate}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
        {rows.at(-1)?.sourceUrl ? <>
          <p className="note">来源：{rows.at(-1).sourceId} · 采集于 {rows.at(-1).collectedAt}</p>
          <a className="source-link" href={rows.at(-1).sourceUrl} target="_blank" rel="noreferrer">
            打开商品来源页 <ExternalLink size={14} />
          </a>
        </> : <p className="note">当前组合没有通过真实来源验证的价格，矩阵保持空白。</p>}
      </div>
    </Drawer>
  );
}
/* ----------------- spec-filter matching (R3 / WC §5, OQ-6) --------------- */

const keepNumber = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Mirrors the frozen data-layer number matching so both sides agree. */
const specNumberMatches = (actual, wanted) => {
  const a = keepNumber(actual);
  if (a == null) return false;
  const w = keepNumber(wanted);
  if (w == null) {
    return String(actual ?? "").trim().toLowerCase() === String(wanted ?? "").trim().toLowerCase();
  }
  return Math.abs(a - w) < 1e-6;
};

/** A model's published storage options, or `[]` when it has none. */
const specStorage = (modelId) => {
  const raw = specOf(modelId)?.storage;
  return Array.isArray(raw) ? raw.filter((v) => v != null && v !== "").map(String) : [];
};

/**
 * `ok` | `noSpec` | `missingSpec` (entry without the field) | `mismatch`,
 * mirroring the data layer's verdict so an active spec filter hides a model for
 * the same reason in the matrix and in `weeklyTrend()` (WC §3.2, OQ-6).
 */
function specVerdictFor(modelId, { screenInches, batteryMah, storage }) {
  if (screenInches === ALL && batteryMah === ALL && storage === ALL) return "ok";
  const spec = specOf(modelId);
  if (!spec) return "noSpec";
  if (screenInches !== ALL) {
    if (spec.screenInches == null || spec.screenInches === "") return "missingSpec";
    if (!specNumberMatches(spec.screenInches, screenInches)) return "mismatch";
  }
  if (batteryMah !== ALL) {
    if (spec.batteryMah == null || spec.batteryMah === "") return "missingSpec";
    if (!specNumberMatches(spec.batteryMah, batteryMah)) return "mismatch";
  }
  if (storage !== ALL) {
    const list = specStorage(modelId);
    if (!list.length) return "missingSpec";
    if (
      !list.some(
        (v) =>
          v.trim().toLowerCase() === String(storage).trim().toLowerCase() ||
          specNumberMatches(v, storage),
      )
    ) {
      return "mismatch";
    }
  }
  return "ok";
}

function App() {
  const ref = useRef(null);
  const [week, setWeek] = useState(weeks.at(-1)),
    [country, setCountry] = useState("all"),
    [query, setQuery] = useState(""),
    // Pre-existing default (the first configured brand). Safe again now that
    // history.json carries `brand`/`series` verbatim, so a brand scope keeps the
    // retired ids (A06/A57) in scope and the trend stays computable (WC §2 rule 7).
    [brand, setBrand] = useState(brands[0]?.id ?? "samsung"),
    [series, setSeries] = useState("all"),
    [variant, setVariant] = useState(ALL),
    [channel, setChannel] = useState(ALL),
    [screenInches, setScreenInches] = useState(ALL),
    [batteryMah, setBatteryMah] = useState(ALL),
    [alerts, setAlerts] = useState(false),
    [selected, setSelected] = useState(null),
    [specModel, setSpecModel] = useState(null),
    [sources, setSources] = useState(false),
    [showAll, setShowAll] = useState(false),
    [toast, setToast] = useState(""),
    [brokenFlags, setBrokenFlags] = useState({}),
    [refreshing, setRefreshing] = useState(true),
    [lastChecked, setLastChecked] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const variantOptions = [...new Set(models.flatMap((m) => m.variants))].sort((a, b) =>
      a === "N/A" ? 1 : b === "N/A" ? -1 : a.localeCompare(b),
    ),
    seriesOptions = [...new Set(models.map((m) => m.series).filter(Boolean))].sort(),
    screenBuckets = specValues("screenInches"),
    batteryBuckets = specValues("batteryMah"),
    // 容量 offers the model variants plus every researched `specs.storage`
    // value (WC §5: 容量 matches the model's variants OR specs.storage).
    capacityValues = [
      ...variantOptions,
      ...specValues("storage").map(String).filter((value) => !variantOptions.includes(value)),
    ],
    capacityIsVariant = variant === ALL || variantOptions.includes(variant),
    // OQ-6: `variant` filters records, `storage` only narrows spec coverage.
    storageScope = variant !== ALL && !capacityIsVariant ? variant : ALL,
    cellVariant = capacityIsVariant ? variant : ALL,
    specFilterOn = screenInches !== ALL || batteryMah !== ALL || storageScope !== ALL,
    specBucketsIncomplete = dataInfo.loaded && (screenBuckets.length === 0 || batteryBuckets.length === 0),
    visibleCountries = countries.filter((c) => country === "all" || country === c.id),
    visibleModels = models.filter(
      (m) =>
        m.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        (variant === ALL ||
          m.variants.some((v) => String(v) === String(variant)) ||
          specStorage(m.id).some((v) => v.trim().toLowerCase() === String(variant).trim().toLowerCase())) &&
        (brand === "all" || m.brandId === brand || (m.brandId == null && brand === "samsung")) &&
        (series === "all" || m.series === series) &&
        specVerdictFor(m.id, { screenInches, batteryMah, storage: storageScope }) === "ok",
    ),
    screenFilterOptions = [
      { value: ALL, label: "全部屏幕尺寸" },
      ...screenBuckets.map((value) => ({ value, label: `${value}"` })),
    ],
    batteryFilterOptions = [
      { value: ALL, label: "全部电池容量" },
      ...batteryBuckets.map((value) => ({ value, label: `${value} mAh` })),
    ],
    capacityFilterOptions = [
      { value: ALL, label: variantLabel(ALL) },
      ...capacityValues.map((value) => ({ value, label: variantLabel(value) })),
    ];
  const trendScope = {
      country,
      brand,
      series,
      channel,
      variant: cellVariant,
      screenInches,
      batteryMah,
      storage: storageScope,
      until: week,
    },
    trend = useMemo(
      () => weeklyTrend(trendScope),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [dataVersion, country, brand, series, channel, variant, screenInches, batteryMah, week, cellVariant, storageScope],
    ),
    trendScopeText = [
      country === "all" ? "全部市场" : `市场：${countries.find((c) => c.id === country)?.name ?? country}`,
      channel === ALL ? "全部渠道" : `渠道：${channelName(channel)}`,
      brand === "all" ? "全部品牌" : `品牌：${brands.find((b) => b.id === brand)?.name ?? brand}`,
      series === "all" ? "全部系列" : `系列：${series}`,
      variant === ALL ? "全部容量" : `容量：${variantLabel(variant)}`,
      screenInches === ALL ? "全部屏幕尺寸" : `屏幕尺寸：${screenInches}"`,
      batteryMah === ALL ? "全部电池容量" : `电池：${batteryMah} mAh`,
    ].join(" · ");
  const cells = visibleCountries.flatMap((c) =>
      visibleModels.map((m) => ({
        country: c,
        model: m,
        data: cell(c.id, m.id, channel, cellVariant, week),
      })),
    ),
    anomalies = cells.filter((c) => anomaly(c.data.state)),
    changes = cells.filter((c) => c.data.delta != null && c.data.delta !== 0);
  const coverageModelCount = new Set(
    records
      .filter(
        (record) =>
          String(record.week) === String(dataInfo.week) &&
          Number.isFinite(record.price) &&
          (record.state === "live" || record.state === "promo"),
      )
      .map((record) => record.model),
  ).size;
  const signals = cells
    .filter(
      (c) =>
        c.data.state !== "normal" && c.data.state !== "unavailable" ||
        (c.data.delta !== 0 && c.data.delta != null),
    )
    .sort(
      (a, b) =>
        Number(anomaly(b.data.state)) - Number(anomaly(a.data.state)) ||
        Math.abs(b.data.percent ?? 0) - Math.abs(a.data.percent ?? 0),
    );
  const reset = () => {
    setQuery("");
    setCountry("all");
    setBrand(brands[0]?.id ?? "samsung");
    setSeries("all");
    setVariant(ALL);
    setChannel(ALL);
    setScreenInches(ALL);
    setBatteryMah(ALL);
    setAlerts(false);
  };
  const open = (item) => setSelected({ ...item, variant: cellVariant, channel });
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await loadRemoteRecords();
    } catch (error) {
      // loadRemoteRecords already records per-file failures; this guards the
      // hydrate step so a malformed payload never becomes an uncaught error.
      console.warn("refresh failed", error);
    } finally {
      setDataVersion((v) => v + 1);
      setLastChecked(new Date());
      setRefreshing(false);
    }
  };
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () =>
        gsap.fromTo(
          ".cell-button",
          { opacity: 0.65, y: 2 },
          { opacity: 1, y: 0, duration: 0.18, stagger: { amount: 0.06 } },
        ),
      );
      return () => mm.revert();
    },
    {
      scope: ref,
      dependencies: [
        week,
        country,
        query,
        variant,
        channel,
        alerts,
        brand,
        series,
      ],
      revertOnUpdate: true,
    },
  );
  function download() {
    const rows = [
      [
        "数据类型",
        "国家",
        "型号",
        "容量",
        "渠道",
        "周次",
        "货币",
        "本周价格",
        "美元价格",
        "汇率日期",
        "上周价格",
        "变动金额",
        "变动比例",
          "状态",
        "原始价格日期",
      ],
      ...cells
        .filter((c) => c.data.state !== "unavailable" && (!alerts || anomaly(c.data.state)))
        .map((c) => [
          dataInfo.mode === "live" ? "实时采集" : "待配置采集",
          c.country.name,
          c.model.name,
          variantLabel(cellVariant),
          channelName(channel),
          week,
          c.country.currency,
          c.data.value,
          c.data.priceUsd,
          dataInfo.fx?.asOf ?? "",
          c.data.previous,
          c.data.delta,
          percentage(c.data.percent),
          labels[c.data.state],
          c.data.effectiveDate,
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `market-lens-${week}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("CSV 已导出");
  }
  return (
    <div ref={ref}>
      <header className="topbar">
        <div className="brand">
          <Activity size={22} />
          <strong>Market Lens</strong>
          <span className="slash">/</span>
          <span>市场研究</span>
        </div>
        <span className={`demo-badge ${dataInfo.mode === "live" ? "live-badge" : ""}`}>
          <i />
          {dataInfo.mode === "live" ? "已验证来源" : "暂无已验证数据"}
        </span>
      </header>
      <main>
        <div className={`freshness ${freshness().level}`} aria-live="polite">
          <i />
          <div className="freshness-body">
            <span className="freshness-main">{freshness().text}</span>
            <span className="freshness-meta">
              {dataInfo.collectedAt
                ? `采集于 ${freshness().collectedAtLocal}`
                : "尚无采集时间"}
              {" · "}
              {freshness().cadence}
              {" · "}
              <span className="next-refresh">{freshness().next.text}</span>
              {" · "}
              <span className="fx-line">汇率 {fxLabel()}</span>
            </span>
          </div>
          <div className="freshness-side">
            <button
              className="refresh-button"
              onClick={() => {
                refreshData().then(() => setToast("数据已刷新"));
              }}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? "spin" : ""} />
              {refreshing ? "刷新中…" : "刷新数据"}
            </button>
            <time
              className="last-checked"
              dateTime={lastChecked ? lastChecked.toISOString() : undefined}
              data-ts={lastChecked ? lastChecked.toISOString() : ""}
            >
              最近检查 {lastChecked ? localTime(lastChecked) : "—"}
            </time>
          </div>
        </div>
        <header className="page-heading">
          <div>
            <div className="breadcrumb">
              价格监测 <span>/</span> 中东市场
            </div>
            <h1>国家 × 型号价格矩阵</h1>
            <p>{brands.find((b) => b.id === brand)?.name ?? "Samsung"} 在售型号 · 本地货币与美元双显示 · 仅展示可访问商品页验证过的价格 · {dataInfo.collectedAt ? `最近采集 ${new Date(dataInfo.collectedAt).toLocaleString("zh-CN")}` : "尚未连接有效商品来源"}</p>
          </div>
          <div className="actions">
            <button onClick={() => setSources(true)}>
              <Database size={16} />
              数据来源
            </button>
            <button
              className="primary"
              onClick={download}
              disabled={!cells.length || (alerts && !anomalies.length)}
            >
              <Download size={16} />
              导出 CSV
            </button>
          </div>
        </header>
        <div className="tabs">
          <span className="active-tab">价格矩阵</span>
          <div className="week-picker">
            <Select
              label="周次"
              value={week}
              onChange={setWeek}
              options={weeks
                .toReversed()
                .map((w) => ({
                  value: w,
                  label: `${w}${w === weeks.at(-1) ? " · 最新" : ""}`,
                }))}
            />
          </div>
        </div>
        <section className="filters" aria-label="矩阵筛选">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="搜索型号"
              placeholder="搜索型号…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Select
            label="市场"
            value={country}
            onChange={setCountry}
            options={[
              { value: "all", label: "全部市场" },
              ...countries.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="渠道"
            value={channel}
            onChange={setChannel}
            options={[{ value: ALL, label: channelName(ALL) }, ...channels.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            label="品牌"
            value={brand}
            onChange={setBrand}
            options={[{ value: "all", label: "全部品牌" }, ...brands.map((b) => ({ value: b.id || b, label: b.name || b }))]}
          />
          <Select
            label="系列"
            value={series}
            onChange={setSeries}
            options={[{ value: "all", label: "全部系列" }, ...seriesOptions]}
          />
          <Select
            label="屏幕尺寸"
            value={screenInches}
            onChange={setScreenInches}
            options={screenFilterOptions}
          />
          <Select
            label="容量"
            value={variant}
            onChange={setVariant}
            options={capacityFilterOptions}
          />
          <Select
            label="电池"
            value={batteryMah}
            onChange={setBatteryMah}
            options={batteryFilterOptions}
          />
          <button
            className="icon reset"
            title="重置筛选"
            aria-label="重置筛选"
            onClick={reset}
          >
            <RotateCcw size={16} />
          </button>
          {specBucketsIncomplete && (
            <p className="filter-note">
              规格数据未载入或缺失：
              {screenBuckets.length === 0 ? "屏幕尺寸" : ""}
              {screenBuckets.length === 0 && batteryBuckets.length === 0 ? " / " : ""}
              {batteryBuckets.length === 0 ? "电池" : ""}
              筛选没有可选取值，不提供推测选项。
            </p>
          )}
        </section>
        {specFilterOn && (
          <p className="spec-exclusion">
            {trend.excluded.missingSpec} 个型号因缺少规格数据被排除
            {trend.excluded.noSpec > 0 ? `，另有 ${trend.excluded.noSpec} 个型号尚无规格条目` : ""}
            （按当前筛选范围统计）。其余未显示的型号是规格值与筛选不符，不是缺数据。
          </p>
        )}
        <section className="matrix-summary">
          <span>
            <b>{visibleCountries.length}</b> 个市场{" "}
            <span className="dot">·</span> <b>{visibleModels.length}</b> 个型号{" "}
            <span className="dot">·</span> <b>{changes.length}</b> 项价格变动
            <span className="coverage-summary">
              <span className="dot">·</span> {dataInfo.verifiedProductCount} 条已验证价格 · {dataInfo.sourceCount} 个来源 · {coverageModelCount} 个型号
            </span>
          </span>
          <label className="check">
            <input
              type="checkbox"
              checked={alerts}
              onChange={(e) => setAlerts(e.target.checked)}
            />
            仅异常 <span className="count">{anomalies.length}</span>
          </label>
        </section>
        {visibleModels.length === 0 ? (
          <div className="empty">
            <Search size={24} />
            <h3>没有匹配的型号</h3>
            <p>当前搜索或筛选条件没有对应型号。</p>
            <button onClick={reset}>重置筛选</button>
          </div>
        ) : (
          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">
                    市场 <small>当地货币</small>
                  </th>
              {visibleModels.map((m) => (
                    <th key={m.id} scope="col">
                      <button
                        type="button"
                        className="model-button"
                        aria-label={`${m.name} 产品规格`}
                        title={`查看 ${m.name} 产品规格`}
                        onClick={() => setSpecModel(m)}
                      >
                        <strong>{m.name}</strong>
                      </button>
                      <small>{variantLabel(variant)} · Samsung</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCountries.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <div className="country-name">
                        {brokenFlags[c.id] ? (
                          <span className="flag-emoji" aria-hidden="true">
                            {flagEmoji(c.id)}
                          </span>
                        ) : (
                          <img
                            src={`${import.meta.env.BASE_URL}flags/${c.id}.png`}
                            width="24"
                            height="16"
                            alt=""
                            onError={() => setBrokenFlags((f) => ({ ...f, [c.id]: true }))}
                          />
                        )}
                        <strong>{c.name}</strong>
                      </div>
                      <small>{c.currency}</small>
                    </th>
                    {visibleModels.map((m) => {
                      const d = cell(c.id, m.id, channel, variant, week);
                  return (
                    <td key={m.id}>
                      {d.state === "unavailable" ? (
                        <div
                          className={`empty-cell ${d.availabilityHint ? "has-hint" : ""}`}
                          aria-label={`${c.name} ${m.name} ${d.availabilityHint ?? "未在售"}`}
                        >
                          <span>{d.availabilityHint ? "当前筛选无价" : "未在售"}</span>
                          <small>{d.availabilityHint ?? "该市场没有已验证价格"}</small>
                        </div>
                      ) : alerts && !anomaly(d.state) ? (
                            <div className="excluded">无异常</div>
                          ) : (
                            <button
                              className={`cell-button ${anomaly(d.state) ? "attention" : ""}`}
                              aria-label={`${c.name} ${m.name} 价格详情`}
                              onClick={() => open({ country: c, model: m })}
                            >
                              <div className="price">
                                <NumberValue
                                  value={d.value}
                                  currency={c.currency}
                                />
                                <ArrowRight className="cell-arrow" size={15} />
                              </div>
                              <div className="cell-meta">
                                <div className="usd-cell">
                                  {d.priceUsd == null ? "FX 不可用" : usd(d.priceUsd)}
                                </div>
                                {channel === ALL && d.channel && (
                                  <span className="channel-tag">{channelShort(d.channel)}</span>
                                )}
                              </div>
                              <Change data={d} currency={c.currency} />
                              <div className="previous">
                                上周 {money(d.previous, c.currency)}
                              </div>
                              <div className="cell-status">
                                {d.state !== "normal" && (
                                  <span
                                    className={`badge ${anomaly(d.state) ? "warning" : d.state === "promo" ? "promo" : ""}`}
                                  >
                                    {labels[d.state]}
                                  </span>
                                )}
                              </div>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="matrix-footer">
          <span>
            本地货币 + USD · {variantLabel(variant)} · {channelName(channel)} · 同周最低价
          </span>
          <span>采集周期 {week}</span>
        </div>
        <section className="signals">
          <div className="section-head">
            <h2>本周变动</h2>
            {signals.length > 4 && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "收起" : "查看全部"}
                <span>{signals.length}</span>
              </button>
            )}
          </div>
          {signals.length === 0 ? (
            <p className="note">当前筛选下没有价格变动或异常。</p>
          ) : (
            signals.slice(0, showAll ? signals.length : 4).map((item) => (
              <button
                className="signal"
                key={`${item.country.id}-${item.model.id}`}
                onClick={() => open(item)}
              >
                <span
                  className={`signal-dot ${anomaly(item.data.state) ? "amber" : ""}`}
                />
                <span className="signal-name">
                  {item.model.name}
                  <small>{item.country.name}</small>
                </span>
                <span className="signal-state">{labels[item.data.state]}</span>
                <Change data={item.data} currency={item.country.currency} />
                <ArrowRight size={16} />
              </button>
            ))
          )}
        </section>
        <TrendSection trend={trend} week={week} scopeText={trendScopeText} />
        <footer className="page-footer">
          <span>Market Lens</span>
          <span>{dataInfo.mode === "live" ? "自动采集 · GitHub Actions" : "没有已验证来源 · 当前矩阵为空白"}</span>
        </footer>
      </main>
      {selected && (
        <Detail
          selected={selected}
          week={week}
          close={() => setSelected(null)}
        />
      )}{" "}
      {specModel && (
        <SpecDetail model={specModel} close={() => setSpecModel(null)} />
      )}{" "}
      {sources && (
        <Drawer title="数据来源" close={() => setSources(false)}>
          <div className="drawer-body">
            <span className="demo-badge">来源状态</span>
            <h3>当前数据状态</h3>
            <p className="note">
              {dataInfo.mode === "live" ? `已配置 ${dataInfo.sourceCount} 个数据源${dataInfo.failedSources?.length ? `，${dataInfo.failedSources.length} 个来源最近失败` : ""}。只有带来源 URL 和采集时间的记录才会进入矩阵。` : "当前没有载入已验证商品价格；没有通过验证的国家、型号或容量保持空白。"}
            </p>
            <div className="source-row">
              <span>记录维度</span>
              <b>国家 × 型号 × 渠道 × 容量 × 周次</b>
            </div>
            <div className="source-row">
              <span>历史范围</span>
              <b>
                {weeks[0]} — {weeks.at(-1)}
              </b>
            </div>
            <h3>品牌网站参考</h3>
            {countries.map((c) => (
              <a
                className="source-row"
                key={c.id}
                href={c.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>{c.name}</span>
                <span>
                  Samsung <ExternalLink size={14} />
                </span>
              </a>
            ))}
            <h3>零售来源</h3>
            {retailers.map((retailer) => (
              <a className="source-row" key={retailer.id} href={retailer.url} target="_blank" rel="noreferrer">
                <span>{retailer.name}</span><span>公开商城 <ExternalLink size={14} /></span>
              </a>
            ))}
            <p className="note">
              参考链接不作为价格凭证。正式采集需要逐市场配置产品
              URL、容量、渠道及采集时间，并保存原始来源记录。
            </p>
          </div>
        </Drawer>
      )}
      <div role="status" className={`toast ${toast ? "visible" : ""}`}>
        {toast}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
