import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Download,
  X,
  Search,
  Database,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  countries,
  models,
  channels,
  retailers,
  weeks,
  labels,
  anomaly,
  history,
  cell,
  money,
  percentage,
  csv,
  dataInfo,
  loadRemoteRecords,
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
function Detail({ selected, week, close }) {
  const { country, model } = selected;
  const [variant, setVariant] = useState(selected.variant),
    [channel, setChannel] = useState(selected.channel),
    [range, setRange] = useState("12"),
    [compare, setCompare] = useState(true);
  const ref = useRef(null);
  const rows = history(country.id, model.id, channel, variant, week),
    data = cell(country.id, model.id, channel, variant, week),
    displayed = rows.slice(-Number(range));
  const chart = displayed.map((row) => ({
    week: row.week.slice(5),
    ...Object.fromEntries(
      channels.map((ch) => [
        ch.id,
        history(country.id, model.id, ch.id, variant, row.week).at(-1)?.value,
      ]),
    ),
    events: Object.fromEntries(
      channels.map((ch) => [
        ch.id,
        history(country.id, model.id, ch.id, variant, row.week).at(-1)?.state,
      ]),
    ),
  }));
  const values = rows.filter((r) => r.price !== null).map((r) => r.price),
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
            options={model.variants}
          />
          <Select
            label="渠道"
            value={channel}
            onChange={setChannel}
            options={channels.map((c) => ({ value: c.id, label: c.name }))}
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
          <span>当前价格 · {country.currency}</span>
          <strong>
            <NumberValue value={data.value} currency={country.currency} />
          </strong>
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
          <label className="check">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            对比渠道
          </label>
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
                tickFormatter={(v) => money(v, country.currency)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v, name, p) => [
                  `${money(v, country.currency)} ${country.currency} · ${labels[p.payload.events[name]]}`,
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
                  08:00 UTC · {channels.find((c) => c.id === channel).name}
                </span>
              </div>
              <div>
                <b>
                  {money(row.value, country.currency)} {country.currency}
                </b>
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
function App() {
  const ref = useRef(null);
  const [week, setWeek] = useState(weeks.at(-1)),
    [country, setCountry] = useState("all"),
    [query, setQuery] = useState(""),
    [brand, setBrand] = useState("all"),
    [series, setSeries] = useState("all"),
    [variant, setVariant] = useState("128GB"),
    [channel, setChannel] = useState("retail"),
    [alerts, setAlerts] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [selected, setSelected] = useState(null),
    [sources, setSources] = useState(false),
    [showAll, setShowAll] = useState(false),
    [toast, setToast] = useState("");
  const [, setDataVersion] = useState(0);
  const visibleCountries = countries.filter(
      (c) => country === "all" || country === c.id,
    ),
    visibleModels = models.filter(
      (m) =>
        m.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        m.variants.includes(variant) &&
        (brand === "all" || brand === "Samsung") &&
        (series === "all" || series === "Galaxy A"),
    );
  const cells = visibleCountries.flatMap((c) =>
      visibleModels.map((m) => ({
        country: c,
        model: m,
        data: cell(c.id, m.id, channel, variant, week),
      })),
    ),
    anomalies = cells.filter((c) => anomaly(c.data.state)),
    changes = cells.filter((c) => c.data.delta != null && c.data.delta !== 0);
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
    setBrand("all");
    setSeries("all");
    setVariant("128GB");
    setChannel("retail");
    setAlerts(false);
  };
  const open = (item) => setSelected({ ...item, variant, channel });
  useEffect(() => {
    loadRemoteRecords().finally(() => setDataVersion((v) => v + 1));
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
          variant,
          channel,
          week,
          c.country.currency,
          c.data.value,
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
        <header className="page-heading">
          <div>
            <div className="breadcrumb">
              价格监测 <span>/</span> 中东市场
            </div>
            <h1>国家 × 型号价格矩阵</h1>
            <p>Galaxy A 系列 · 仅展示可访问商品页验证过的价格 · {dataInfo.collectedAt ? `最近采集 ${new Date(dataInfo.collectedAt).toLocaleString("zh-CN")}` : "尚未连接有效商品来源"}</p>
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
            options={channels.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="容量"
            value={variant}
            onChange={setVariant}
            options={["64GB", "128GB", "256GB"]}
          />
          <button
            className={advanced ? "pressed" : ""}
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={16} />
            更多筛选
          </button>
          <button
            className="icon reset"
            title="重置筛选"
            aria-label="重置筛选"
            onClick={reset}
          >
            <RotateCcw size={16} />
          </button>
          {advanced && (
            <div className="advanced">
              <Select
                label="品牌"
                value={brand}
                onChange={setBrand}
                options={[{ value: "all", label: "全部品牌" }, "Samsung"]}
              />
              <Select
                label="系列"
                value={series}
                onChange={setSeries}
                options={[{ value: "all", label: "全部系列" }, "Galaxy A"]}
              />
            </div>
          )}
        </section>
        <section className="matrix-summary">
          <span>
            <b>{visibleCountries.length}</b> 个市场{" "}
            <span className="dot">·</span> <b>{visibleModels.length}</b> 个型号{" "}
            <span className="dot">·</span> <b>{changes.length}</b> 项价格变动
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
            <p>当前搜索或容量没有对应记录。</p>
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
                      <strong>{m.name}</strong>
                      <small>{variant} · Samsung</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCountries.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <div className="country-name">
                        <img
                          src={`${import.meta.env.BASE_URL}flags/${c.id}.png`}
                          width="24"
                          height="16"
                          alt=""
                        />
                        <strong>{c.name}</strong>
                      </div>
                      <small>{c.currency}</small>
                    </th>
                    {visibleModels.map((m) => {
                      const d = cell(c.id, m.id, channel, variant, week);
                  return (
                    <td key={m.id}>
                      {d.state === "unavailable" ? (
                        <div className="empty-cell"><span>—</span><small>暂无该型号</small></div>
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
            本地货币 · {variant} · {channels.find((c) => c.id === channel).name}
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
