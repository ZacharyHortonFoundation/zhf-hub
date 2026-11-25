"use client";

import { useActionState } from "react";
import { FileUp } from "lucide-react";
import { runImport, type ImportResult } from "@/app/admin/import/actions";
import { Card, CardBody, CardHeader, Checkbox, Field, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";

export function ImportForm() {
  const [res, action] = useActionState<ImportResult, FormData>(runImport, null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Upload a CSV" />
        <CardBody>
          <form action={action} className="space-y-4">
            <Field label="What are you importing?">
              <Select name="kind" defaultValue="contacts">
                <option value="contacts">Constituents (contacts)</option>
                <option value="donations">Donations (transactions)</option>
              </Select>
            </Field>
            <Field label="CSV file" hint="Max 8 MB. Import constituents first, then donations.">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-100"
              />
            </Field>
            <Checkbox name="dryRun" label="Dry run" description="Check the file and show what would happen, without saving anything." defaultChecked />
            <SubmitButton pendingText="Importing…">
              <FileUp className="size-4" /> Run import
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Result" />
        <CardBody>
          {!res ? (
            <p className="text-sm text-slate-500">Results will appear here.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <Notice tone={res.errors.length && !res.created && !res.updated ? "red" : res.dryRun ? "amber" : "green"}>
                {res.dryRun ? "Dry run — nothing was saved. " : "Import complete. "}
                {res.rows} rows read · <strong>{res.created}</strong> new · <strong>{res.updated}</strong> matched existing · {res.skipped} skipped
              </Notice>
              {Object.keys(res.mapped).length ? (
                <div>
                  <p className="mb-1 font-medium text-slate-700">Column mapping</p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(res.mapped).map(([k, v]) => (
                      <li key={k} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                        <span className="text-slate-500">{k}</span>
                        <span className={v === "—" ? "text-slate-300" : "font-medium text-slate-800"}>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {res.errors.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
                  {res.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
