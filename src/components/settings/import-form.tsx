"use client";

import { importRankHistoryAction } from "@/lib/actions/rank-import";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useServerForm } from "@/components/ui/use-server-form";

const FORMAT_LABEL = {
  long: "One row per keyword per date",
  wide: "One column per date",
  snapshot: "One position per keyword, no dates",
} as const;

export function RankImportForm({ clientId, today, locationName }: { clientId: string; today: string; locationName: string }) {
  const { state, pending, formProps } = useServerForm(importRankHistoryAction.bind(null, clientId));
  const preview = state?.preview;

  return (
    <form {...formProps} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="CSV file" htmlFor="file" hint="Export from AgencyAnalytics or any rank tracker. Up to 7 MB.">
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="block w-full text-sm text-muted file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-ink hover:file:bg-brand-50"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="These rankings are for" htmlFor="device">
            <Select id="device" name="device" defaultValue="desktop">
              <option value="desktop">Desktop results</option>
              <option value="mobile">Mobile results</option>
            </Select>
          </Field>
          <Field label="Date of positions" htmlFor="snapshotDate" hint="Only used when the file has no dates.">
            <Input id="snapshotDate" name="snapshotDate" type="date" max={today} defaultValue={today} />
          </Field>
        </div>
      </div>

      <Field
        label="Or paste rows from a spreadsheet"
        htmlFor="text"
        hint="Include the heading row. Ignored when a file is chosen."
      >
        <Textarea
          id="text"
          name="text"
          rows={6}
          className="font-mono text-xs"
          placeholder={"Keyword\tDate\tPosition\tURL\nplumber cardiff\t01/10/2026\t12\thttps://example.co.uk/"}
        />
      </Field>

      {state?.error ? (
        <p role="alert" className="rounded-lg bg-down-bg px-3 py-2 text-sm text-down">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p role="status" className="rounded-lg bg-up-bg px-3 py-2 text-sm text-up">
          {state.message}
        </p>
      ) : null}
      {state?.warnings && state.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {preview && !state?.imported ? (
        <div className="rounded-xl border border-line bg-paper p-4">
          <h3 className="font-display text-[15px] font-semibold">What will be imported</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Layout detected</dt>
              <dd className="font-medium text-ink">{FORMAT_LABEL[preview.format]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Keywords</dt>
              <dd className="font-medium text-ink">
                {preview.keywordCount.toLocaleString("en-GB")}
                <span className="font-normal text-muted">
                  {" "}
                  ({preview.newKeywordCount.toLocaleString("en-GB")} new)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Positions</dt>
              <dd className="font-medium text-ink">{preview.resultCount.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Dates covered</dt>
              <dd className="font-medium text-ink">
                {preview.dateRange ? `${preview.dateRange.from} to ${preview.dateRange.to}` : "None yet"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">Columns used: {preview.columns.join(" · ")}</p>
          {preview.newKeywordCount > 0 ? (
            <p className="mt-1 text-xs text-muted">
              New keywords are added to tracking with the location {locationName}, and will be checked from
              the next rank check onwards.
            </p>
          ) : null}
          {preview.sample.length > 0 ? (
            <table className="mt-3 w-full max-w-xl text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 font-medium">Keyword</th>
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 text-right font-medium">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.sample.map((r) => (
                  <tr key={`${r.keyword}-${r.date}`}>
                    <td className="py-1.5 text-ink">{r.keyword}</td>
                    <td className="py-1.5 text-muted">{r.date}</td>
                    <td className="tabular py-1.5 text-right font-medium">{r.position ?? "Not ranking"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="mode" value="preview" variant="secondary" pending={pending} pendingLabel="Reading...">
          Preview
        </SubmitButton>
        <SubmitButton name="mode" value="import" pending={pending} pendingLabel="Importing...">
          Import rankings
        </SubmitButton>
        <span className="text-xs text-muted">Preview first to check the columns were read correctly.</span>
      </div>
    </form>
  );
}
