"use client";

import { Children, useState } from "react";
import type { ReactNode } from "react";

/** Shows the first few table rows with a button to reveal the rest. */
export function ShowMoreRows({
  children,
  initial = 10,
  columns,
  noun = "rows",
}: {
  children: ReactNode;
  initial?: number;
  columns: number;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const rows = Children.toArray(children);
  const hidden = rows.length - initial;

  return (
    <>
      {open ? rows : rows.slice(0, initial)}
      {hidden > 0 ? (
        <tr className="no-print">
          <td colSpan={columns} className="px-5 py-2.5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[13px] font-medium text-brand-600 hover:underline"
            >
              {open ? "Show fewer" : `Show ${hidden} more ${noun}`}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
