"use client";

import { useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";

function render(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

export function TemplateEditor({
  action,
  initial,
  fields,
  sample,
  orgName,
}: {
  action: (fd: FormData) => Promise<void>;
  initial: { subject: string; body: string; enabled: boolean };
  fields: string[];
  sample: Record<string, string>;
  orgName: string;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const vars = useMemo(() => ({ ...sample, org_name: orgName }), [sample, orgName]);

  const insert = (f: string) => {
    const el = bodyRef.current;
    const tag = `{{${f}}}`;
    if (!el) return setBody((b) => b + tag);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + tag + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Edit" description="Click a merge field to insert it at the cursor." />
        <CardBody className="space-y-4">
          <Field label="Subject">
            <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea ref={bodyRef} name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-mono text-[13px] leading-relaxed" />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Merge fields</p>
            <div className="flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <button key={f} type="button" onClick={() => insert(f)} className="rounded-md bg-brand-50 px-2 py-1 font-mono text-[11px] text-brand-800 hover:bg-brand-100">
                  {`{{${f}}}`}
                </button>
              ))}
            </div>
          </div>
          <Checkbox name="enabled" label="Enabled" description="When off, this email is never sent." defaultChecked={initial.enabled} />
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <SubmitButton name="intent" value="test" variant="outline" pendingText="Sending…">
              <Send className="size-4" /> Save & send me a test
            </SubmitButton>
            <SubmitButton pendingText="Saving…">Save template</SubmitButton>
          </div>
        </CardBody>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Preview (sample data)</p>
        <div className="overflow-hidden rounded-2xl border border-[#eee6d8] bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm">
            <span className="text-slate-500">Subject: </span>
            <span className="font-medium text-slate-900">{render(subject, vars)}</span>
          </div>
          <div className="bg-brand-700 px-6 py-4 text-base font-semibold text-white">{orgName}</div>
          <div className="whitespace-pre-line px-6 py-6 text-[15px] leading-relaxed text-slate-800">{render(body, vars)}</div>
        </div>
      </div>
    </form>
  );
}
