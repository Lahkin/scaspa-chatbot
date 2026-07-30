import { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartSpec } from '@/lib/types';
import {
  formatNumber,
  seriesKey,
  shortenLabel,
  shouldLayoutHorizontally,
  tickInterval,
  toRows,
} from '@/features/chat/chartLayout';
import { resolveToken, styleFor } from '@/features/chat/chartSeries';

/**
 * The Recharts half.
 *
 * **This module is the only place Recharts is imported**, and it is reached only
 * through `React.lazy` in `ChartBlock`. Recharts is ~400kB and most conversations
 * never render a chart; on roaming data that is a real cost to impose on someone
 * asking what time the ferry leaves.
 *
 * ### ResponsiveContainer, and the reason your chart is invisible
 *
 * `ResponsiveContainer` measures its parent. Given `height="100%"` inside a
 * parent whose height is `auto`, the percentage resolves against nothing, the
 * container measures **zero**, and the chart renders at zero pixels — which looks
 * exactly like a failure to load and sends people hunting through their data.
 *
 * So the wrapper below has an **explicit height** from a token (`h-chart`), not a
 * percentage. That is the whole fix, and it is why the height is a token rather
 * than an arbitrary value that someone might later "tidy" into `h-full`.
 */

interface ChartCanvasProps {
  spec: ChartSpec;
  /** Index of a series to draw in the accent colour, or null. */
  highlighted?: number | null;
}

export function ChartCanvas({ spec, highlighted = null }: ChartCanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(wrapper);

  const rows = toRows(spec);
  const horizontal = shouldLayoutHorizontally(spec.type, rows.length, width);
  const interval = tickInterval(rows.length, width);

  // Resolved once per render: SVG presentation attributes cannot take `var(--x)`.
  const axisColor = resolveToken('--color-neutral-700', '#3d4650');
  const gridColor = resolveToken('--color-neutral-200', '#dde4ec');
  const surface = resolveToken('--color-surface', '#ffffff');

  const styles = spec.series.map((_, index) => {
    const style = styleFor(index, highlighted);
    return { ...style, color: resolveToken(style.colorVar) };
  });

  const axisProps = {
    stroke: axisColor,
    tick: { fill: axisColor, fontSize: 11 },
    tickLine: { stroke: gridColor },
    axisLine: { stroke: gridColor },
  } as const;

  const categoryAxis = (
    <XAxis
      {...axisProps}
      dataKey="x"
      type={horizontal ? 'number' : 'category'}
      // Shortened, not rotated. Rotated labels at 390px are the unreadable case.
      tickFormatter={(value: string | number) => shortenLabel(value)}
      interval={interval}
      {...(horizontal ? {} : { minTickGap: 4 })}
    />
  );

  const valueAxis = (
    <YAxis
      {...axisProps}
      type={horizontal ? 'category' : 'number'}
      {...(horizontal ? { dataKey: 'x', width: 78 } : { width: 52 })}
      tickFormatter={(value: string | number) =>
        typeof value === 'number' ? formatNumber(value) : shortenLabel(value, 10)
      }
    />
  );

  const common = {
    data: rows,
    margin: { top: 8, right: 12, bottom: 4, left: 0 },
  };

  const grid = <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />;

  const tooltip = (
    <Tooltip
      formatter={(value) => (typeof value === 'number' ? formatNumber(value) : String(value ?? ''))}
      contentStyle={{
        background: surface,
        border: `1px solid ${gridColor}`,
        borderRadius: 6,
        fontSize: 12,
        color: axisColor,
      }}
    />
  );

  // Only shown when there is more than one series — a legend for a single series
  // is a label repeating the title.
  const legend =
    spec.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: axisColor }} /> : null;

  return (
    // The determinate height. Everything above depends on this line.
    <div ref={wrapper} className="h-chart w-full sm:h-chart-lg" data-testid="chart-canvas">
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === 'line' ? (
          <LineChart {...common}>
            <Patterns styles={styles} />
            {grid}
            {categoryAxis}
            {valueAxis}
            {tooltip}
            {legend}
            {spec.series.map((series, index) => {
              const style = styles[index]!;
              return (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={seriesKey(index)}
                  name={series.name}
                  stroke={style.color}
                  strokeWidth={2}
                  // The second and third signals: pattern and marker shape.
                  // Spread rather than passed as undefined — `exactOptionalPropertyTypes`
                  // treats an explicit undefined as a different thing from absence.
                  {...(style.dash ? { strokeDasharray: style.dash } : {})}
                  dot={{ fill: style.color, r: 3 }}
                  activeDot={{ r: 5 }}
                  // A missing point is a gap, not a zero.
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart {...common}>
            <Patterns styles={styles} />
            {grid}
            {categoryAxis}
            {valueAxis}
            {tooltip}
            {legend}
            {spec.series.map((series, index) => {
              const style = styles[index]!;
              return (
                <Area
                  key={index}
                  type="monotone"
                  dataKey={seriesKey(index)}
                  name={series.name}
                  stroke={style.color}
                  strokeWidth={2}
                  {...(style.dash ? { strokeDasharray: style.dash } : {})}
                  // A hatched fill survives a black-and-white printout where four
                  // translucent blues become one grey.
                  fill={`url(#${style.patternId})`}
                  fillOpacity={1}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        ) : (
          <BarChart {...common} layout={horizontal ? 'vertical' : 'horizontal'}>
            <Patterns styles={styles} />
            {grid}
            {horizontal ? valueAxis : categoryAxis}
            {horizontal ? categoryAxis : valueAxis}
            {tooltip}
            {legend}
            {spec.series.map((series, index) => {
              const style = styles[index]!;
              return (
                <Bar
                  key={index}
                  dataKey={seriesKey(index)}
                  name={series.name}
                  fill={`url(#${style.patternId})`}
                  stroke={style.color}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              );
            })}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * SVG fill patterns, one per series.
 *
 * This is the part that makes a bar chart readable in the printed leave-behind.
 * Four translucent blues are four indistinguishable greys once the colour is
 * gone; solid / diagonal / dotted / cross-hatch stay distinct.
 */
function Patterns({ styles }: { styles: { color: string; patternId: string }[] }) {
  return (
    <defs>
      {styles.map((style, index) => {
        const id = style.patternId;
        if (id === 'scaspa-solid') {
          return (
            <pattern key={index} id={id} width="1" height="1" patternUnits="userSpaceOnUse">
              <rect width="1" height="1" fill={style.color} />
            </pattern>
          );
        }
        if (id === 'scaspa-diagonal') {
          return (
            <pattern
              key={index}
              id={id}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={style.color} fillOpacity={0.25} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={style.color} strokeWidth="3" />
            </pattern>
          );
        }
        if (id === 'scaspa-dots') {
          return (
            <pattern key={index} id={id} width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill={style.color} fillOpacity={0.18} />
              <circle cx="3" cy="3" r="1.6" fill={style.color} />
            </pattern>
          );
        }
        return (
          <pattern key={index} id={id} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill={style.color} fillOpacity={0.18} />
            <path d="M0 0 L7 7 M7 0 L0 7" stroke={style.color} strokeWidth="1.2" />
          </pattern>
        );
      })}
    </defs>
  );
}

/**
 * The wrapper's own width, for the tick and layout decisions.
 *
 * Measured rather than taken from a breakpoint, because the widget is 380px wide
 * inside an iframe on a 1440px desktop and has exactly the phone's problem.
 */
function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(360);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth || 360);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
