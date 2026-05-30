import React from "react";

export type DataColumnAlign = "left" | "right";

export interface DataColumn<Row> {
  key: string;
  header: React.ReactNode;
  align?: DataColumnAlign;
  /** When true, the cell renders with tabular-nums + monospace-friendly alignment. */
  numeric?: boolean;
  /** Width as CSS value (e.g. "120px" or "20%"). */
  width?: string | number;
  render: (row: Row, rowIndex: number) => React.ReactNode;
}

export interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row, index: number) => string | number;
  focalRowKey?: string | number;
  onRowClick?: (row: Row, index: number) => void;
  empty?: React.ReactNode;
  /** Optional caption-style heading for screen readers. */
  caption?: string;
}

function DataTableInner<Row>({
  columns,
  rows,
  getRowKey,
  focalRowKey,
  onRowClick,
  empty,
  caption,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }
  return (
    <div
      style={{
        background: "var(--msp-card)",
        borderRadius: "var(--msp-radius-card)",
        border: "1px solid var(--msp-border)",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--msp-text-body)",
          color: "var(--msp-text)",
        }}
      >
        {caption && (
          <caption
            style={{
              textAlign: "left",
              padding: "12px 16px",
              fontSize: "var(--msp-text-h2)",
              fontWeight: 500,
              color: "var(--msp-text)",
              captionSide: "top",
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  textAlign: col.align ?? (col.numeric ? "right" : "left"),
                  fontSize: "var(--msp-text-label)",
                  fontWeight: 500,
                  color: "var(--msp-text-muted)",
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--msp-border)",
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = getRowKey(row, i);
            const isFocal = focalRowKey !== undefined && key === focalRowKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  background: isFocal ? "var(--msp-card-2)" : "transparent",
                  borderLeft: isFocal ? "2px solid var(--msp-accent)" : "2px solid transparent",
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      textAlign: col.align ?? (col.numeric ? "right" : "left"),
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--msp-border)",
                      fontVariantNumeric: col.numeric ? "tabular-nums" : undefined,
                    }}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DataTable = DataTableInner as <Row>(props: DataTableProps<Row>) => React.ReactElement;

export default DataTable;
