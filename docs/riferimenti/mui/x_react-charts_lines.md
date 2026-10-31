<!-- Fonte: https://mui.com/x/react-charts/lines.md · scaricato il 2026-10-31 · licenza: MIT (mui.com) -->

---
title: React Line chart
productId: x-charts
components: LineChart, LineChartPro, LineElement, LineHighlightElement, LineHighlightPlot, LinePlot, MarkElement, MarkPlot, AreaElement, AreaPlot, AnimatedLine, AnimatedArea, ChartsGrid
---

# Charts - Lines

Use line charts to show trends over time, compare series, and highlight changes in continuous data.

## Overview

Line charts work well when you want to show how values change over a continuous dimension such as time or a measurement scale.
They emphasize trends, patterns, and fluctuations, so they are useful for exploring relationships, spotting cycles, or tracking performance over time.
Each line usually represents one series, so you can compare multiple variables or groups at a glance.

```tsx
import * as React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { ChartsDataProviderPro } from '@mui/x-charts-pro/ChartsDataProviderPro';
import { ChartsSurface } from '@mui/x-charts-pro/ChartsSurface';
import { LinePlot } from '@mui/x-charts-pro/LineChart';
import { ChartsXAxis } from '@mui/x-charts-pro/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts-pro/ChartsYAxis';
import { useDrawingArea, useXScale } from '@mui/x-charts-pro/hooks';
import { ChartsTooltip } from '@mui/x-charts-pro/ChartsTooltip';
import { ChartsGrid } from '@mui/x-charts-pro/ChartsGrid';
import { ChartsZoomSlider } from '@mui/x-charts-pro/ChartsZoomSlider';
import { ChartsClipPath } from '@mui/x-charts-pro/ChartsClipPath';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { ChartsLegend } from '@mui/x-charts-pro/ChartsLegend';
import { usaUnemploymentAndGdp } from '../dataset/usaUnemploymentAndGdp';

type RecessionPeriod = {
  start: Date;
  end: Date;
  label: string;
};

const recessions = [
  {
    start: new Date('2001-03-01'),
    end: new Date('2001-11-01'),
    label: 'Early 2000s',
  },
  {
    start: new Date('2007-12-01'),
    end: new Date('2009-06-01'),
    label: 'Great Recession',
  },
  { start: new Date('2020-02-01'), end: new Date('2020-04-01'), label: 'COVID-19' },
];

function RecessionBands({ periods }: { periods: RecessionPeriod[] }) {
  const { top, left, width, height } = useDrawingArea();
  const xScale = useXScale();
  const theme = useTheme();
  const labelFill = alpha(theme.palette.text.primary, 0.7);

  return (
    <g>
      {periods.map((p, index) => {
        const xStart = xScale(p.start.getTime());
        const xEnd = xScale(p.end.getTime());

        if (xStart === undefined || xEnd === undefined) {
          return null;
        }

        // Stick to the left of the drawing area boundaries
        let textX: number;
        if (xStart >= left && xStart <= left + width) {
          textX = xStart;
        } else if (xEnd >= left && xEnd <= left + width) {
          textX = left;
        } else {
          return null;
        }

        return (
          <React.Fragment key={index}>
            <rect
              x={textX}
              y={top}
              width={Math.min(xEnd, left + width) - textX}
              height={height}
              fill="grey"
              opacity={0.2}
            />
            <text
              x={textX}
              y={top - 5}
              textAnchor="start"
              dominantBaseline="auto"
              fill={labelFill}
              fontSize="0.8rem"
              fontWeight={500}
              pointerEvents="none"
            >
              {p.label}
            </text>
          </React.Fragment>
        );
      })}
    </g>
  );
}

export default function LineOverview() {
  const clipPathId = React.useId();
  return (
    <Box sx={{ width: '100%' }}>
      <Typography sx={{ textAlign: 'center' }}>
        US unemployment rate comparison with GDP per capita
      </Typography>
      <ChartsDataProviderPro
        height={300}
        dataset={usaUnemploymentAndGdp}
        series={[
          {
            type: 'line',
            id: 'unemployment',
            dataKey: 'unemploymentRate',
            label: 'Unemployment rate',
            color: '#af3838',
            yAxisId: 'unemployment-axis',
            valueFormatter: (value) => (value == null ? '' : `${value.toFixed(1)}%`),
          },
          {
            type: 'line',
            dataKey: 'gdpPerCapita',
            label: 'GDP per capita',
            color: '#4caf50',
            yAxisId: 'gdp-axis',
            connectNulls: true,
            valueFormatter: (value) =>
              value == null ? '' : `${(value / 1000).toFixed(1)}k`,
          },
        ]}
        xAxis={[
          {
            scaleType: 'time',
            dataKey: 'date',
            tickNumber: 4,
            valueFormatter: (date, context) => {
              if (context.location !== 'tick') {
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                });
              }
              return date.getMonth() === 0
                ? date.toLocaleDateString('en-US', {
                    year: 'numeric',
                  })
                : date.toLocaleDateString('en-US', {
                    month: 'short',
                  });
            },
            zoom: {
              slider: { enabled: true },
            },
          },
        ]}
        yAxis={[
          {
            id: 'unemployment-axis',
            scaleType: 'linear',
            valueFormatter: (value) => `${value}%`,
            width: 55,
            position: 'left',
          },
          {
            id: 'gdp-axis',
            scaleType: 'linear',
            width: 50,
            position: 'right',
            valueFormatter: (value) => `${(value / 1000).toLocaleString()}k`,
          },
        ]}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
          <ChartsLegend />
        </Box>
        <ChartsSurface>
          <ChartsClipPath id={clipPathId} />
          <RecessionBands periods={recessions} />
          <ChartsGrid horizontal />
          <g clipPath={`url(#${clipPathId})`}>
            <LinePlot />
          </g>
          <ChartsXAxis />
          <ChartsYAxis axisId="unemployment-axis" label="Unemployment Rate" />
          <ChartsYAxis axisId="gdp-axis" label="GDP per capita in US$" />
          <ChartsAxisHighlight x="line" />
          <ChartsZoomSlider />
        </ChartsSurface>
        <ChartsTooltip />
      </ChartsDataProviderPro>
      <Typography
        variant="caption"
        component="p"
        sx={{ color: 'text.secondary', textAlign: 'left', pt: 1 }}
      >
        Source: FRED
      </Typography>
    </Box>
  );
}

```

## Basics

### Data format

Line chart series must contain a `data` property with an array of numbers.
That array holds the y-values.

To set x-values, pass `data` on the `xAxis` configuration.
The axis can use any `scaleType`, and its `data` should have the same length as the series.

When you omit the `xAxis` prop entirely, `LineChart` supplies a default x-axis with `scaleType='point'`.
Its `data` is `[0, 1, 2, …]` with length matching the longest series, so each y-value pairs with its index in the series `data` array.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';

export default function BasicLineChart() {
  return (
    <LineChart
      xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
      series={[
        {
          data: [2, 5.5, 2, 8.5, 1.5, 5],
        },
      ]}
      height={300}
    />
  );
}

```

### Using a dataset

If your data is stored in an array of objects, you can use the `dataset` helper prop.
It accepts an array of objects such as `dataset={[{x: 1, y: 32}, {x: 2, y: 41}, ...]}`.

You can reuse this data when defining the series and axes by using the `dataKey` property.
For example, `xAxis={[{ dataKey: 'x' }]}` or `series={[{ dataKey: 'y' }]}`.

The demo below plots the evolution of world electricity production by source.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';
import {
  worldElectricityProduction,
  keyToLabel,
  colors,
} from '../dataset/worldElectricityProduction';

const stackStrategy = {
  stack: 'total',
  area: true,
  stackOffset: 'none', // To stack 0 on top of others
} as const;

const customize = {
  height: 350,
  hideLegend: true,
};

export default function LineDataset() {
  return (
    <LineChart
      xAxis={[
        { dataKey: 'year', valueFormatter: (value: number) => value.toString() },
      ]}
      yAxis={[{ width: 50 }]}
      series={Object.keys(keyToLabel).map((key) => ({
        dataKey: key,
        label: keyToLabel[key],
        color: colors[key],
        ...stackStrategy,
      }))}
      dataset={worldElectricityProduction}
      {...customize}
    />
  );
}

```

### Area

Set the series `area` property to `true` to fill the area under the line.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';

export default function BasicArea() {
  return (
    <LineChart
      xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
      series={[
        {
          data: [2, 5.5, 2, 8.5, 1.5, 5],
          area: true,
        },
      ]}
      height={300}
    />
  );
}

```

### Marks

Add `showMark: true` to display marks for all values.

It also accept a values `'start'` or `'end'` to display a mark on the first (or last) value of the series

To modify the mark, use the property `shape`.
It accepts 7 shapes: `'circle'`, `'square'`, `'diamond'`, `'cross'`, `'star'`, `'triangle'`, and `'wye'`.

:::info
The `'start' | 'end'` options render the highlight marks instead of the regular marks.
As a result, while the pointer highlights a value, the start/end mark is replaced by the highlighted one.
:::

```tsx
import * as React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { LineChart } from '@mui/x-charts/LineChart';
import { dataset } from '../dataset/weather';

type Shape = 'circle' | 'square' | 'diamond' | 'cross' | 'star' | 'triangle' | 'wye';

const marksMapping = {
  true: true,
  false: false,
  start: 'start',
  end: 'end',
  '({index})=>index%2===0': ({ index }: { index: number }) => index % 2 === 0,
} as const;

const marksOptions: (keyof typeof marksMapping)[] = [
  'true',
  'false',
  'start',
  'end',
  '({index})=>index%2===0',
];

const shapes: Shape[] = [
  'circle',
  'square',
  'diamond',
  'cross',
  'star',
  'triangle',
  'wye',
];

export default function LineMarkShape() {
  const [marks, setMarks] = React.useState<keyof typeof marksMapping>('true');
  const [shape, setShape] = React.useState<Shape>('circle');

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1}
      sx={{ width: '100%', padding: 2 }}
    >
      <Stack direction={{ xs: 'row', md: 'column' }} spacing={1}>
        <TextField
          select
          label="marks"
          value={marks}
          onChange={(event) =>
            setMarks(event.target.value as keyof typeof marksMapping)
          }
          sx={{ minWidth: 150 }}
        >
          {marksOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="shape"
          value={shape}
          onChange={(event) => setShape(event.target.value as Shape)}
          sx={{ minWidth: 150 }}
        >
          {shapes.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Box sx={{ flexGrow: 1 }}>
        <LineChart
          height={250}
          dataset={dataset}
          series={[
            {
              dataKey: 'london',
              label: 'London precipitation (mm)',
              curve: 'natural',
              showMark: marksMapping[marks],
              shape,
            },
          ]}
          xAxis={[{ scaleType: 'point', dataKey: 'month' }]}
          grid={{ vertical: true, horizontal: true }}
        />
      </Box>
    </Stack>
  );
}

```

### Log scale

A y-axis with a log scale cannot plot a line that crosses zero, and it cannot plot an area chart, because the logarithm of zero is undefined.

See [Axis—Symlog scale](/x/react-charts/axis/#symlog-scale) for a workaround.

### Stacking

You can use the `stack` string property to group line series into stacks.
Series that share the same `stack` value are stacked on top of each other.

You can use the `stackOffset` and `stackOrder` properties to define how the series is stacked.
By default, they are stacked in the order you defined them, with positive values stacked above 0 and negative values stacked below 0.

See [Stacking](/x/react-charts/stacking/) for more details.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';
import { dataset } from '../dataset/gdpPerCapitaEvolution';

export default function StackedAreas() {
  return (
    <div style={{ width: '100%' }}>
      <LineChart
        dataset={dataset}
        xAxis={[
          {
            id: 'Years',
            dataKey: 'date',
            scaleType: 'time',
            valueFormatter: (date) => date.getFullYear().toString(),
          },
        ]}
        yAxis={[{ width: 70 }]}
        series={[
          {
            id: 'France',
            label: 'French GDP per capita',
            dataKey: 'fr',
            stack: 'total',
            area: true,
          },
          {
            id: 'Germany',
            label: 'German GDP per capita',
            dataKey: 'dl',
            stack: 'total',
            area: true,
          },
          {
            id: 'United Kingdom',
            label: 'UK GDP per capita',
            dataKey: 'gb',
            stack: 'total',
            area: true,
          },
        ]}
        height={300}
      />
    </div>
  );
}

```

### Axis domain

By default, the x-axis domain limit for line charts is set to `'strict'`, meaning the axis range matches the data range exactly.
For other chart types, axes round their limits to match human-readable values (for example, data ranging from 2 to 195 displays values from 0 to 200).
This behavior can be modified by the [axis property `domainLimit`](/x/react-charts/axis/#relative-axis-subdomain).

```tsx
import * as React from 'react';
import Stack from '@mui/material/Stack';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { LineChart } from '@mui/x-charts/LineChart';
import { dataset } from '../dataset/gdpPerCapitaEvolution';

export default function LineDefaultDomainLimit() {
  const [niceDomainLimit, setNiceDomainLimit] = React.useState(false);

  return (
    <Stack sx={{ alignItems: 'center' }}>
      <FormControlLabel
        checked={niceDomainLimit}
        control={
          <Checkbox onChange={(event) => setNiceDomainLimit(event.target.checked)} />
        }
        label="Nice domain limit"
        labelPlacement="end"
      />
      <div style={{ width: '100%', maxWidth: 450 }}>
        <LineChart
          dataset={dataset.slice(2, dataset.length)}
          xAxis={[
            {
              id: 'Years',
              dataKey: 'date',
              scaleType: 'time',
              valueFormatter: (date) => date.getFullYear().toString(),
              domainLimit: niceDomainLimit ? 'nice' : undefined,
            },
          ]}
          yAxis={[{ width: 70 }]}
          series={[
            {
              id: 'France',
              label: 'French GDP per capita',
              dataKey: 'fr',
              stack: 'total',
              area: true,
            },
            {
              id: 'Germany',
              label: 'German GDP per capita',
              dataKey: 'dl',
              stack: 'total',
              area: true,
            },
            {
              id: 'United Kingdom',
              label: 'UK GDP per capita',
              dataKey: 'gb',
              stack: 'total',
              area: true,
            },
          ]}
          height={300}
        />
      </div>
    </Stack>
  );
}

```

## Partial data

### Skip missing points

A line series can have fewer data points than the axis.
Use `null` values when you have partial data or series that start at different points.

By default, the tooltip omits series that have no value at the hovered position.
To show a tooltip for missing values, use `valueFormatter` to return a string when the value is `null` or `undefined`.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';

export default function DifferentLength() {
  return (
    <LineChart
      xAxis={[{ data: [1, 2, 3, 5, 8, 10, 12, 15, 16] }]}
      series={[
        {
          data: [2, 5.5, 2, 8.5, 1.5, 5],
          valueFormatter: (value) => (value == null ? 'NaN' : value.toString()),
        },
        {
          data: [null, null, null, null, 5.5, 2, 8.5, 1.5, 5],
        },
        {
          data: [7, 8, 5, 4, null, null, 2, 5.5, 1],
          valueFormatter: (value) => (value == null ? '?' : value.toString()),
        },
      ]}
      height={200}
      margin={{ bottom: 10 }}
    />
  );
}

```

:::info
When the series `data` array is shorter than the axis `data`, values outside the series length are `undefined`, not `null`.

The following code draws a line for x between 2 and 4.

- For x<2, values are `null`, so the line is not drawn.
- For x>4, values are `undefined`, so the line is not drawn.

```jsx
<LineChart
  series={[{ data: [null, null, 10, 11, 12] }]}
  xAxis={[{ data: [0, 1, 2, 3, 4, 5, 6] }]}
/>
```

:::

### Connect missing points

Set the `connectNulls` property on a line series to continue the curve across points whose value is `null`.
This links two segments with a gap of `null` values in between.
The curve is not extrapolated before the first non-null point or after the last one.

```tsx
import * as React from 'react';
import Stack from '@mui/material/Stack';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { LineChart } from '@mui/x-charts/LineChart';

export default function ConnectNulls() {
  const [connectNulls, setConnectNulls] = React.useState(true);

  return (
    <Stack sx={{ width: '100%' }}>
      <FormControlLabel
        checked={connectNulls}
        control={
          <Checkbox onChange={(event) => setConnectNulls(event.target.checked)} />
        }
        label="connectNulls"
        labelPlacement="end"
      />
      <LineChart
        xAxis={[{ data: [1, 2, 3, 5, 8, 10, 12, 15, 16, 18, 20] }]}
        series={[
          {
            data: [2, 5, 6.5, 3, 8, 10, 9.5, 2.5, 6, 10, 8],
          },
          {
            data: [null, null, 5.5, 2, null, null, 8.5, 1.5, 5],
            connectNulls,
            area: true,
          },
        ]}
        height={200}
        margin={{ bottom: 10 }}
        skipAnimation
      />
    </Stack>
  );
}

```

## Click event

Line charts provide several click handlers:

- `onAreaClick` when a specific area is clicked
- `onLineClick` when a specific line is clicked
- `onMarkClick` when a specific mark is clicked
- `onAxisClick` when the chart background is clicked

Each handler receives the same signature:

```js
const clickHandler = (
  event, // The mouse event.
  params, // An object that identifies the clicked elements.
) => {};
```

```tsx
import * as React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';

import { LineChart } from '@mui/x-charts/LineChart';

import { HighlightedCode } from '@mui/internal-core-docs/HighlightedCode';
import type { ChartsAxisData, LineItemIdentifier } from '@mui/x-charts/models';

const lineChartsParams = {
  series: [
    {
      id: 'series-1',
      data: [3, 4, 1, 6, 5],
      label: 'A',
      area: true,
      stack: 'total',
      highlightScope: {
        highlight: 'item',
      },
    },
    {
      id: 'series-2',
      data: [4, 3, 1, 5, 8],
      label: 'B',
      area: true,
      stack: 'total',
      highlightScope: {
        highlight: 'item',
      },
    },
    {
      id: 'series-3',
      data: [4, 2, 5, 4, 1],
      label: 'C',
      area: true,
      stack: 'total',
      highlightScope: {
        highlight: 'item',
      },
    },
  ],
  xAxis: [{ data: [0, 3, 6, 9, 12], scaleType: 'linear', id: 'axis1' }],
  height: 400,
} as const;

export default function LineClick() {
  const [itemData, setItemData] = React.useState<LineItemIdentifier>();
  const [axisData, setAxisData] = React.useState<ChartsAxisData | null>();

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 0, md: 4 }}
      sx={{ width: '100%' }}
    >
      <Box sx={{ flexGrow: 1 }}>
        <LineChart
          {...lineChartsParams}
          onAreaClick={(event, d) => setItemData(d)}
          onMarkClick={(event, d) => setItemData(d)}
          onLineClick={(event, d) => setItemData(d)}
          onAxisClick={(event, d) => setAxisData(d)}
        />
      </Box>

      <Stack direction="column" sx={{ width: { xs: '100%', md: '40%' } }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography>Click on the chart</Typography>
          <IconButton
            aria-label="reset"
            size="small"
            onClick={() => {
              setItemData(undefined);
              setAxisData(null);
            }}
          >
            <UndoOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
        <HighlightedCode
          code={`// Data from item click
${itemData ? JSON.stringify(itemData, null, 2) : '// The data will appear here'}

// Data from axis click
${axisData ? JSON.stringify(axisData, null, 2) : '// The data will appear here'}
`}
          language="json"
          copyButtonHidden
        />
      </Stack>
    </Stack>
  );
}

```

:::info
The `event` differs slightly between `onAxisClick` and the others:

- For `onAxisClick`, it is the native mouse event from the SVG element.
- For the rest, it is a React synthetic mouse event from the area, line, or mark component.

:::

### Composition

If you're composing a custom component, you can receive these click events as follows.
Note that `onAxisClick` runs for both bar and line series when you mix them.

```jsx
<ChartsContainer onAxisClick={onAxisClick}>
  {/* ... */}
  <LinePlot onItemClick={onLineClick} />
  <AreaPlot onItemClick={onAreaClick} />
</ChartsContainer>
```

### Pointer interaction 🧪

:::warning
This feature is in preview.
It is ready for production use, and its API, visuals, and behavior may change in future minor or patch releases.
:::

By default, line and area series are highlighted when the pointer hovers directly over the SVG element (the line stroke or area fill).
This can make it difficult to interact with thin lines.

Enabling `experimentalFeatures.enablePositionBasedPointerInteraction` switches to a pointer-position-based detection that determines the closest series to the cursor.
For area series, it detects whether the pointer is inside the filled area.
For line series (without area), it finds the series whose curve is closest to the pointer's vertical position.

This uses the same curve interpolation as the rendered line (for example, `monotoneX`, `catmullRom`), so the hit detection matches the visual shape.

```tsx
import * as React from 'react';
import Box from '@mui/material/Box';
import { LineChart } from '@mui/x-charts/LineChart';

const data = {
  xAxis: [{ data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
  series: [
    {
      data: [5, 8, 3, 7, 2, 9, 4, 6, 1, 5, 3],
      label: 'Series C',
      area: true,
      highlightScope: { highlight: 'series', fade: 'global' },
    },
    {
      data: [2, 5.5, 2, 8.5, 1.5, 5, 1, 4, 3, 8, 2],
      label: 'Series A',
      highlightScope: { highlight: 'series', fade: 'global' },
    },
    {
      data: [8, 2, 5, 1, 7, 3, 9, 2, 6, 3, 7],
      label: 'Series B',
      highlightScope: { highlight: 'series', fade: 'global' },
    },
  ],
} as const;

export default function LinePointerInteraction() {
  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <LineChart
        {...data}
        experimentalFeatures={{ enablePositionBasedPointerInteraction: true }}
      />
    </Box>
  );
}

```

### Highlight

The line highlight display marks on top of the lines and marks.
Even if you set `showMark: false`.

You can turn off this behavior with the `disableHighlight` series property or the `disableLineItemHighlight` prop on the line chart.

## Styling

### Grid

You can add a grid in the background of the chart with the `grid` prop.

See [Axis—Grid](/x/react-charts/axis-ticks/#grid) for details.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';
import type { XAxis } from '@mui/x-charts/models';
import {
  dateAxisFormatter,
  percentageFormatter,
  usUnemploymentRate,
} from '../dataset/usUnemploymentRate';

const xAxis: XAxis<'time'>[] = [
  {
    dataKey: 'date',
    scaleType: 'time',
    valueFormatter: dateAxisFormatter,
  },
];
const yAxis = [
  {
    valueFormatter: percentageFormatter,
  },
];
const series = [
  {
    dataKey: 'rate',
    valueFormatter: percentageFormatter,
  },
];
export default function GridDemo() {
  return (
    <LineChart
      dataset={usUnemploymentRate}
      xAxis={xAxis}
      yAxis={yAxis}
      series={series}
      height={300}
      grid={{ vertical: true, horizontal: true }}
    />
  );
}

```

### Color scale

As with other charts, you can modify the [series color](/x/react-charts/styling/#colors) either directly, or with the color palette.

You can also modify the color by using the axes' `colorMap`, which maps values to colors.
Line charts use the following, in order of priority:

1. The y-axis color
2. The x-axis color
3. The series color

See [Styling—Value-based colors](/x/react-charts/styling/#value-based-colors) for the `colorMap` properties.

```tsx
import * as React from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { HighlightedCode } from '@mui/internal-core-docs/HighlightedCode';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

export default function ColorScale() {
  const [colorX, setColorX] = React.useState<
    'None' | 'piecewise' | 'continuous' | 'ordinal'
  >('None');
  const [colorY, setColorY] = React.useState<'None' | 'piecewise' | 'continuous'>(
    'piecewise',
  );
  const [colorArea, setColorArea] = React.useState(true);

  return (
    <Stack direction="column" spacing={1} sx={{ width: '100%', maxWidth: 600 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <TextField
          select
          sx={{ minWidth: 150 }}
          label="x-axis colorMap"
          value={colorX}
          onChange={(event) =>
            setColorX(event.target.value as 'None' | 'piecewise' | 'continuous')
          }
        >
          <MenuItem value="None">None</MenuItem>
          <MenuItem value="piecewise">piecewise</MenuItem>
          <MenuItem value="continuous">continuous</MenuItem>
        </TextField>
        <TextField
          select
          sx={{ minWidth: 150 }}
          label="y-axis colorMap"
          value={colorY}
          onChange={(event) =>
            setColorY(event.target.value as 'None' | 'piecewise' | 'continuous')
          }
        >
          <MenuItem value="None">None</MenuItem>
          <MenuItem value="piecewise">piecewise</MenuItem>
          <MenuItem value="continuous">continuous</MenuItem>
        </TextField>
        <FormControlLabel
          checked={colorArea}
          control={
            <Checkbox onChange={(event) => setColorArea(event.target.checked)} />
          }
          label="Show chart area"
          labelPlacement="end"
        />
      </Stack>
      <LineChart
        height={300}
        grid={{ horizontal: true }}
        series={[
          {
            data: [-2, -9, 12, 11, 6, -4],
            area: colorArea,
            showMark: true,
          },
        ]}
        yAxis={[
          {
            colorMap:
              (colorY === 'continuous' && {
                type: 'continuous',
                min: -10,
                max: 10,
                color: ['red', 'green'],
              }) ||
              (colorY === 'piecewise' && {
                type: 'piecewise',
                thresholds: [0, 10],
                colors: ['red', 'green', 'blue'],
              }) ||
              undefined,
          },
        ]}
        xAxis={[
          {
            scaleType: 'time',
            data: [
              new Date(2019, 0, 1),
              new Date(2020, 0, 1),
              new Date(2021, 0, 1),
              new Date(2022, 0, 1),
              new Date(2023, 0, 1),
              new Date(2024, 0, 1),
            ],
            valueFormatter: (value) => value.getFullYear().toString(),
            colorMap:
              (colorX === 'continuous' && {
                type: 'continuous',
                min: new Date(2019, 1, 1),
                max: new Date(2024, 1, 1),
                color: ['green', 'orange'],
              }) ||
              (colorX === 'piecewise' && {
                type: 'piecewise',
                thresholds: [new Date(2021, 1, 1), new Date(2023, 1, 1)],
                colors: ['blue', 'red', 'blue'],
              }) ||
              undefined,
          },
        ]}
      />
      <HighlightedCode
        code={[
          `<LineChart`,
          '  /* ... */',
          `  series={[{data: [-2, -9, 12, 11, 6, -4], area: ${colorArea}}]}`,
          // ColorX
          ...(colorX === 'None' ? ['  xAxis={[{}]}'] : []),
          ...(colorX === 'continuous'
            ? [
                '  xAxis={[{',
                `    colorMap: {`,
                `      type: 'continuous',`,
                `      min: new Date(2019, 1, 1),`,
                `      max: new Date(2024, 1, 1),`,
                `      color: ['green', 'orange']`,
                `    }`,
                '  }]}',
              ]
            : []),
          ...(colorX === 'piecewise'
            ? [
                '  xAxis={[{',
                `    colorMap: {`,
                `      type: 'piecewise',`,
                `      thresholds: [new Date(2021, 1, 1), new Date(2023, 1, 1)],`,
                `      colors: ['blue', 'red', 'blue'],`,
                `    }`,
                '  }]}',
              ]
            : []),

          // ColorY
          ...(colorY === 'None' ? ['  yAxis={[{}]}'] : []),
          ...(colorY === 'continuous'
            ? [
                '  yAxis={[{',
                `    colorMap: {`,
                `      type: 'continuous',`,
                `      min: -10,`,
                `      max: 10,`,
                `      color: ['red', 'green'],`,
                `    }`,
                '  }]}',
              ]
            : []),
          ...(colorY === 'piecewise'
            ? [
                '  yAxis={[{',
                `    colorMap: {`,
                `      type: 'piecewise',`,
                `      thresholds: [0, 10],`,
                `      colors: ['red', 'green', 'blue'],`,
                `    }`,
                '  }]}',
              ]
            : []),
          `/>`,
        ].join('\n')}
        language="jsx"
        copyButtonHidden
      />
    </Stack>
  );
}

```

:::warning
Ordinal color config is not yet supported for line charts.
:::

### Interpolation

Use the `curve` property to choose how the line is drawn between points.
It accepts these string values: `'linear'`, `'catmullRom'`, `'monotoneX'`, `'monotoneY'`, `'natural'`, `'step'`, `'stepBefore'`, `'stepAfter'`, `'bumpX'`, and `'bumpY'`.

Use the select in the demo below to compare how each value renders on the same data.

You can set `curve` per series, so different series can use different interpolations.

```tsx
import * as React from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { LineChart } from '@mui/x-charts/LineChart';

import { HighlightedCode } from '@mui/internal-core-docs/HighlightedCode';
import type { CurveType } from '@mui/x-charts/models';

const curveTypes: CurveType[] = [
  'linear',
  'catmullRom',
  'monotoneX',
  'monotoneY',
  'natural',
  'step',
  'stepBefore',
  'stepAfter',
  'bumpX',
  'bumpY',
];

function getExample(curveType: CurveType) {
  return `<LineChart
  series={[
    { curve: "${curveType}", data: [1, 5, 2, 6, 3, 9.3] },
    { curve: "${curveType}", data: [6, 3, 7, 9.5, 4, 2] },
  ]}
  {/* ... */}
/>`;
}

export default function InterpolationDemo() {
  const [curveType, setCurveType] = React.useState(curveTypes[0]);

  return (
    <Box sx={{ p: 2, width: 1, maxWidth: 600 }}>
      <TextField
        select
        label="interpolation method"
        value={curveType}
        sx={{ minWidth: 200, mb: 2 }}
        onChange={(event) => setCurveType(event.target.value as CurveType)}
      >
        {curveTypes.map((curve) => (
          <MenuItem key={curve} value={curve}>
            {curve}
          </MenuItem>
        ))}
      </TextField>
      <LineChart
        xAxis={[{ data: [1, 3, 5, 6, 7, 9], min: 0, max: 10 }]}
        series={[
          { curve: curveType, data: [1, 5, 2, 6, 3, 9.3] },
          { curve: curveType, data: [6, 3, 7, 9.5, 4, 2] },
        ]}
        height={300}
        skipAnimation
      />
      <HighlightedCode code={getExample(curveType)} language="tsx" />
    </Box>
  );
}

```

#### Expanding steps

For step interpolations (when `curve` is set to `'step'`, `'stepBefore'`, or `'stepAfter'`), the line expands to cover the full band width to simplify composing line and area charts.

Use the `strictStepCurve` series property to turn off this behavior.

```tsx
import * as React from 'react';
import Stack from '@mui/material/Stack';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsContainer } from '@mui/x-charts/ChartsContainer';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { BarPlot } from '@mui/x-charts/BarChart';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';

const weekDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const stepCurves = ['step', 'stepBefore', 'stepAfter'];
type StepCurve = 'step' | 'stepBefore' | 'stepAfter';

export default function ExpandingStep() {
  const [strictStepCurve, setStrictStepCurve] = React.useState(false);
  const [connectNulls, setConnectNulls] = React.useState(false);
  const [curve, setCurve] = React.useState<StepCurve>('step');

  return (
    <Stack sx={{ width: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Stack>
          <FormControlLabel
            checked={connectNulls}
            control={
              <Checkbox
                onChange={(event) => setConnectNulls(event.target.checked)}
              />
            }
            label="connectNulls"
            labelPlacement="end"
          />
          <FormControlLabel
            checked={strictStepCurve}
            control={
              <Checkbox
                onChange={(event) => setStrictStepCurve(event.target.checked)}
              />
            }
            label="strictStepCurve"
            labelPlacement="end"
          />
        </Stack>
        <TextField
          select
          label="curve"
          value={curve}
          sx={{ minWidth: 100, mb: 2 }}
          onChange={(event) => setCurve(event.target.value as StepCurve)}
        >
          {stepCurves.map((curveType) => (
            <MenuItem key={curveType} value={curveType}>
              {curveType}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <ChartsContainer
        xAxis={[{ scaleType: 'band', data: weekDay }]}
        series={[
          {
            type: 'line',
            curve,
            connectNulls,
            strictStepCurve,
            data: [5, 10, 16, 9, null, 6],
            showMark: true,
            color: 'blue',
          },
          {
            type: 'line',
            curve,
            connectNulls,
            strictStepCurve,
            data: [null, 15, 9, 6, 8, 3, 10],
            showMark: true,
            color: 'red',
          },
          {
            data: [1, 2, 3, 4, 3, 2, 1],
            type: 'bar',
          },
        ]}
        height={250}
        margin={{ bottom: 10 }}
        skipAnimation
      >
        <ChartsAxisHighlight x="band" />
        <BarPlot />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis />
        <ChartsYAxis />
      </ChartsContainer>
    </Stack>
  );
}

```

### Baseline

The area chart uses the y-axis value `0` as the baseline by default.
That works well as a reference, but your use case may call for a different baseline.

Set `baseline` to `"min"` or `"max"` to fill the area above or below the line.
You can also set `baseline` to a number to fix the baseline at a specific value.

:::warning
Do not use `baseline` with stacked areas; the result will not match expectations.
:::

```tsx
import { LineChart } from '@mui/x-charts/LineChart';

export default function AreaBaseline() {
  return (
    <LineChart
      xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
      series={[
        {
          data: [2, -5.5, 2, -7.5, 1.5, 6],
          area: true,
          baseline: 'min',
        },
      ]}
      height={300}
    />
  );
}

```

### Optimization

Avoid displaying [marks](#marks) for large dataset.

Either pass `'start'` or `'end'` to `showMark` to limit the number of element rendered on screen while keeping a mark for accessibility.

Or you can display a subset of the marks by providing a callback to `showMarks`.

This demo shows one mark for values with even index.
The highlighted point always shows a mark, whether its index is even or odd.

```tsx
import { LineChart } from '@mui/x-charts/LineChart';

export default function MarkOptimization() {
  return (
    <LineChart
      xAxis={[{ data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }]}
      series={[
        {
          data: [2, 3, 5.5, 8.5, 1.5, 5, 1, 4, 3, 8],
          showMark: ({ index }) => index % 2 === 0,
        },
      ]}
      height={300}
    />
  );
}

```

For large datasets, set the `sampling` prop on `LineChartPro` to reduce the line when zoomed out,
with a choice of algorithms (`'m4'`, `'minmax'`, `'lttb'`). See [Charts—Performance](/x/react-charts/performance/#sampling)
for details and a live demo.

### CSS

You can customize the line chart elements using CSS selectors.
Line plots use three elements: `LineElement`, `AreaElement`, and `MarkElement`.
You can target them with the CSS classes `lineClasses.line`, `lineClasses.area`, and `lineClasses.mark`.
To target a specific series, use the `data-series` attribute.

In the demo below, each line uses a custom dash style and marks are hidden.
The area for Germany's GDP uses a custom gradient.
The gradient is defined as a child of the chart (`myGradient` referenced in `fill`).

```jsx
<LineChart
  sx={{
    '& .MuiLineElement-root': {
      strokeDasharray: '10 5',
      strokeWidth: 4,
    },
    [`& .${lineClasses.line}`]: {
      strokeDasharray: '10 5',
      strokeWidth: 4,
    },
    [`& .${lineClasses.area}[data-series="Germany"]`]: {
      fill: "url('#myGradient')",
    },
  }}
/>
```

```tsx
import { lineClasses, LineChart } from '@mui/x-charts/LineChart';
import { dataset } from '../dataset/gdpPerCapitaEvolution';

export default function CSSCustomization() {
  return (
    <LineChart
      dataset={dataset}
      sx={{
        [`& .${lineClasses.line}`]: {
          strokeDasharray: '10 5',
          strokeWidth: 4,
        },
        [`& .${lineClasses.area}[data-series="Germany"]`]: {
          fill: "url('#myGradient')",
          filter: 'none', // Remove the default filtering
        },
      }}
      xAxis={[
        {
          id: 'Years',
          dataKey: 'date',
          scaleType: 'time',
          valueFormatter: (date) => date.getFullYear().toString(),
        },
      ]}
      yAxis={[
        {
          width: 60,
        },
      ]}
      series={[
        {
          id: 'France',
          label: 'France',
          dataKey: 'fr',
          stack: 'total',
          area: true,
        },
        {
          id: 'Germany',
          label: 'Germany',
          dataKey: 'dl',
          stack: 'total',
          area: true,
        },
        {
          id: 'United Kingdom',
          label: 'United Kingdom',
          dataKey: 'gb',
          stack: 'total',
          area: true,
        },
      ]}
      height={300}
    >
      <defs>
        <linearGradient id="myGradient" gradientTransform="rotate(90)">
          <stop offset="5%" stopColor="gold" />
          <stop offset="95%" stopColor="red" />
        </linearGradient>
      </defs>
    </LineChart>
  );
}

```

The next example shows how to apply a dashed stroke to the chart line, legend mark, and tooltip mark for each series using the `[data-series]` attribute selector.

```tsx
import Box from '@mui/material/Box';
import { LineChart, lineClasses } from '@mui/x-charts/LineChart';
import { labelMarkClasses } from '@mui/x-charts/ChartsLabel';

const margin = { right: 24 };
const uData = [4000, 3000, 2000, 2780, 1890, 2390, 3490];
const pData = [2400, 1398, 9800, 3908, 4800, 3800, 4300];
const xLabels = [
  'Page A',
  'Page B',
  'Page C',
  'Page D',
  'Page E',
  'Page F',
  'Page G',
];

export default function StyledLineChart() {
  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <LineChart
        series={[
          {
            data: pData,
            label: 'pv',
            id: 'pvId',
            showMark: true,
            labelMarkType: 'line',
          },
          {
            data: uData,
            label: 'uv',
            id: 'uvId',
            showMark: true,
            labelMarkType: 'line',
          },
        ]}
        xAxis={[{ id: 'x-axis', scaleType: 'point', data: xLabels, height: 28 }]}
        yAxis={[{ width: 50 }]}
        tooltipAxis={[{ axisId: 'x-axis', dataIndex: 6 }]}
        slotProps={{ tooltip: { position: 'left' } }}
        sx={{
          // Style the chart line, legend mark, and tooltip mark for pvId
          [`& .${lineClasses.line}[data-series="pvId"], [data-series="pvId"] .${labelMarkClasses.fill}`]:
            {
              strokeDasharray: '5 5',
              strokeWidth: 1,
              strokeLinecap: 'square',
            },
          // Style the chart line, legend mark, and tooltip mark for uvId
          [`& .${lineClasses.line}[data-series="uvId"], [data-series="uvId"] .${labelMarkClasses.fill}`]:
            {
              strokeDasharray: '3 4 5 2',
              strokeWidth: 1,
              strokeLinecap: 'square',
            },
        }}
        margin={margin}
      />
    </Box>
  );
}

```

#### Mark size

Neither the line series nor the `mark` slot accepts a size property, so you set the mark size with CSS on the `lineClasses.mark` class.

The default `'circle'` shape renders an SVG `circle` element, so use the `r` (radius) property, which defaults to `5`.
The other shapes render an SVG `path` element that `r` does not affect.
For those, use the `scale` property, which resizes the mark around its own center.

```tsx
import * as React from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { HighlightedCode } from '@mui/internal-core-docs/HighlightedCode';
import { LineChart, lineClasses } from '@mui/x-charts/LineChart';

type Shape = 'circle' | 'cross' | 'diamond' | 'square' | 'star' | 'triangle' | 'wye';

const shapes: Shape[] = [
  'circle',
  'cross',
  'diamond',
  'square',
  'star',
  'triangle',
  'wye',
];

export default function MarkSize() {
  const [shape, setShape] = React.useState<Shape>('circle');
  const [radius, setRadius] = React.useState(6);
  const [scale, setScale] = React.useState(1.2);

  const isCircle = shape === 'circle';
  const markStyle = isCircle ? { r: radius } : { scale: `${scale}` };

  const code = `<LineChart
  series={[{ data: [...], showMark: true, shape: '${shape}' }]}
  sx={{
    [\`& .\${lineClasses.mark}\`]: {
      ${isCircle ? `r: ${radius}` : `scale: '${scale}'`},
    },
  }}
/>`;

  return (
    <Box sx={{ p: 2, width: '100%', maxWidth: 600 }}>
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center', mb: 1 }}>
        <TextField
          select
          label="shape"
          value={shape}
          sx={{ minWidth: 140 }}
          onChange={(event) => setShape(event.target.value as Shape)}
        >
          {shapes.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        <Stack sx={{ flex: 1 }}>
          <Typography id="mark-size" gutterBottom>
            {isCircle ? 'radius' : 'scale'}
          </Typography>
          {isCircle ? (
            <Slider
              aria-labelledby="mark-size"
              value={radius}
              onChange={(event, value) => setRadius(value as number)}
              valueLabelDisplay="auto"
              min={1}
              max={12}
              step={1}
            />
          ) : (
            <Slider
              aria-labelledby="mark-size"
              value={scale}
              onChange={(event, value) => setScale(value as number)}
              valueLabelDisplay="auto"
              min={0.5}
              max={3}
              step={0.1}
            />
          )}
        </Stack>
      </Stack>
      <LineChart
        xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
        series={[{ data: [2, 5.5, 2, 8.5, 1.5, 5], showMark: true, shape }]}
        height={250}
        sx={{ [`& .${lineClasses.mark}`]: markStyle }}
      />
      <HighlightedCode code={code} language="tsx" />
    </Box>
  );
}

```

## Animation

Chart containers respect [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), but you can also disable animations manually by setting the `skipAnimation` prop to `true`.

When you set `skipAnimation` to `true`, the chart renders without animations.

:::warning
If you add or remove series interactively, give each series an `id`.
Otherwise the chart cannot tell whether you are updating, removing, or adding a series, and the animation may not behave as expected.
:::

```jsx
// For a single component chart
<LineChart skipAnimation />

// For a composed chart
<ChartsContainer>
  <LinePlot skipAnimation />
  <AreaPlot skipAnimation />
</ChartsContainer>
```

```tsx
import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { LineChart } from '@mui/x-charts/LineChart';
import { mangoFusionPalette } from '@mui/x-charts/colorPalettes';

const defaultSeries = [
  { id: '1', data: [4, 5, 1, 2, 3, 3, 2], area: true, stack: '1' },
  { id: '2', data: [7, 4, 6, 7, 2, 3, 5], area: true, stack: '1' },
  { id: '3', data: [6, 4, 1, 2, 6, 3, 3], area: true, stack: '1' },
  { id: '4', data: [4, 7, 6, 1, 2, 7, 7], area: true, stack: '1' },
  { id: '5', data: [2, 2, 1, 7, 1, 5, 3], area: true, stack: '1' },
  { id: '6', data: [6, 6, 1, 6, 7, 1, 1], area: true, stack: '1' },
  { id: '7', data: [7, 6, 1, 6, 4, 4, 6], area: true, stack: '1' },
  { id: '8', data: [4, 3, 1, 6, 6, 3, 5], area: true, stack: '1' },
  { id: '9', data: [7, 6, 2, 7, 4, 2, 7], area: true, stack: '1' },
].map((item, index) => ({
  ...item,
  color: mangoFusionPalette('light')[index],
}));

export default function LineAnimation() {
  const [series, setSeries] = React.useState(defaultSeries);
  const [nbSeries, setNbSeries] = React.useState(3);
  const [skipAnimation, setSkipAnimation] = React.useState(false);

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div>
        <LineChart
          xAxis={[{ data: [1, 2, 3, 4, 5, 6, 7] }]}
          series={[
            ...series.slice(0, Math.min(nbSeries, 8)),
            ...series.slice(8, 10),
          ]}
          skipAnimation={skipAnimation}
          height={400}
        />
      </div>
      <Stack spacing={1} direction="row" sx={{ flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          onClick={() =>
            setSeries((prev) =>
              prev.map((item) => ({
                ...item,
                // eslint-disable-next-line no-restricted-properties -- interactive randomize button
                data: item.data.map((v) => Math.max(0.5, v - 4 + 8 * Math.random())),
              })),
            )
          }
        >
          randomize
        </Button>
        <Button
          variant="outlined"
          onClick={() => setNbSeries((prev) => prev - 1)}
          disabled={nbSeries === 0}
        >
          remove
        </Button>
        <Button
          variant="outlined"
          onClick={() => setNbSeries((prev) => prev + 1)}
          disabled={nbSeries === 8}
        >
          add
        </Button>
        <FormControlLabel
          checked={skipAnimation}
          control={
            <Checkbox onChange={(event) => setSkipAnimation(event.target.checked)} />
          }
          label="skipAnimation"
          labelPlacement="end"
        />
      </Stack>
    </div>
  );
}

```

## Composition

Use `ChartsDataProvider` to provide `series`, `xAxis`, and `yAxis` props for composition.

In addition to the shared chart components available for [composition](/x/react-charts/composition/), you can use `LinePlot`, `AreaPlot`, `MarkPlot`, `LineHighlightPlot`, and `FocusedLineMark` to draw the lines, areas, marks, and focus ring.

Here's how the line chart is composed:

```jsx
<ChartsDataProvider>
  <ChartsWrapper>
    <ChartsLegend />
    <ChartsSurface>
      <ChartsGrid />
      <g clipPath={`url(#${clipPathId})`}>
        {/* Elements clipped inside the drawing area. */}
        <AreaPlot />
        <LinePlot />
        <ChartsOverlay />
        <ChartsAxisHighlight />
      </g>
      <FocusedLineMark />
      <ChartsAxis />
      <g data-drawing-container>
        {/* Elements able to overflow the drawing area. */}
        <MarkPlot />
      </g>
      <LineHighlightPlot />
      <ChartsClipPath id={clipPathId} />
    </ChartsSurface>
    <ChartsTooltip />
  </ChartsWrapper>
</ChartsDataProvider>
```

:::info
The `data-drawing-container` attribute marks children as part of the drawing area even when they overflow.

See [Composition—clipping](/x/react-charts/composition/#clipping) for details.
:::
